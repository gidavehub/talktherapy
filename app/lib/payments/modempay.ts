/**
 * Modem Pay adapter — the half that holds the secret key and makes requests.
 *
 * The wire format, signature verification and fulfilment decisions are all in
 * ./modempay-protocol.ts, which is pure and unit-tested. This file is only
 * credentials, `fetch`, and the unit conversion at the boundary.
 *
 * THIS IS THE ONLY PLACE MINOR UNITS BECOME MAJOR UNITS. Modem Pay's
 * `amount` field is Dalasi, not bututs — despite the SDK's own type comment
 * claiming minor units, which is wrong and would charge a hundredth of the
 * intended price. Everything above this file speaks bututs.
 */

import "server-only";
import { toMajor, toMinor } from "@/lib/money";
import {
  MODEM_PAY_BASE_URL,
  buildCheckoutBody,
  paymentMethodsFor,
  readCheckoutResponse,
  type SignatureCandidate,
} from "./modempay-protocol";
import type { Checkout, CheckoutRequest, PaymentProvider, PaymentState, VerifiedPayment } from "./provider";

/**
 * Env is read inside functions, never at module scope.
 *
 * Next 16 inlines build-time `process.env` reads, so a top-level `const KEY =
 * process.env...` bakes the build machine's value (usually empty) into the
 * deployed bundle. Reading per request also means rotating a key needs a
 * restart, not a rebuild.
 */
function secretKey(): string {
  // Trimmed for the same reason the webhook secrets are: a key pasted from a
  // dashboard very often arrives with a trailing newline, and every request
  // then fails authentication for no visible reason.
  const key = (process.env.MODEM_PAY_SECRET_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "MODEM_PAY_SECRET_KEY is not set — see .env.example. " +
        "Set PAYMENTS_PROVIDER=simulated to run without a merchant account.",
    );
  }
  return key;
}

/**
 * Both secrets Modem Pay might have signed a webhook with, in the order they
 * are most likely.
 *
 * This integration sets a per-intent `callback_url`, and those deliveries are
 * signed with the MERCHANT SECRET KEY. A webhook configured in the dashboard
 * is signed with the WEBHOOK SIGNING SECRET instead. Which one arrives depends
 * on how the event was routed, and nothing in the delivery says which, so the
 * verifier tries both.
 */
export function webhookSignatureCandidates(): SignatureCandidate[] {
  return [
    { routing: "merchant-secret-key", secret: process.env.MODEM_PAY_SECRET_KEY },
    { routing: "webhook-signing-secret", secret: process.env.MODEM_PAY_WEBHOOK_SECRET },
  ];
}

/**
 * Minor → major at the one boundary that needs it: reading the amount Modem
 * Pay reports back. Kept here beside `toMajor` so both conversions are in one
 * reviewable place.
 */
export function reportedAmountMinor(amountMajor: number | null): number | null {
  return amountMajor === null ? null : toMinor(amountMajor);
}

async function request(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const { idempotencyKey, ...rest } = init;
  const response = await fetch(`${MODEM_PAY_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(rest.headers ?? {}),
    },
    // Payment calls must never be served from a cache.
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Left as null; the error below carries the raw text, which is what a
    // gateway error page actually looks like and is worth seeing in a log.
  }

  if (!response.ok) {
    const message =
      (typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "") || text.slice(0, 300);
    throw new Error(`Modem Pay ${path} failed (${response.status}): ${message}`);
  }

  return body;
}

export function modemPayProvider(): PaymentProvider {
  return {
    name: "modempay",

    async createCheckout(input: CheckoutRequest): Promise<Checkout> {
      const paymentMethods = paymentMethodsFor(input.amountMinor);

      const body = buildCheckoutBody({
        // ---- the one minor → major conversion in the codebase ----
        amountMajor: toMajor(input.amountMinor),
        title: input.title,
        description: input.description,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        paymentMethods,
        metadata: {
          uid: input.uid,
          purpose: input.purpose,
          // The expected amount travels with the payment so a mismatch can be
          // spotted even if our own record is somehow missing.
          amount_minor: String(input.amountMinor),
        },
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        callbackUrl: input.callbackUrl,
      });

      const response = await request("/v1/payments", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const { paymentIntentId, paymentLink } = readCheckoutResponse(response);
      return { paymentIntentId, paymentLink, paymentMethods };
    },

    /**
     * `GET /v1/transactions/{id}` is the authority on what was actually paid
     * and on the metadata attached to it — a webhook payload can be stale or
     * partial, this cannot.
     */
    async verify(paymentIntentId: string): Promise<VerifiedPayment> {
      const response = await request(`/v1/transactions/${encodeURIComponent(paymentIntentId)}`, {
        method: "GET",
      });

      const data = pick(pick(response, "data") ?? response, null);
      const metadata = pick(data, "metadata") ?? {};
      const status = String(read(data, "status") ?? "").toLowerCase();
      const amount = read(data, "amount");

      return {
        paymentIntentId,
        state: stateFromStatus(status),
        amountMinor: reportedAmountMinor(typeof amount === "number" && Number.isFinite(amount) ? amount : null),
        expectedAmountMinor: expectedMinorFromMetadata(read(metadata, "amount_minor")),
        uid: stringOrNull(read(metadata, "uid")),
        purpose: stringOrNull(read(metadata, "purpose")),
        customerEmail: stringOrNull(read(data, "customer_email") ?? read(data, "customerEmail")),
      };
    },
  };
}

/**
 * The same status vocabulary the webhook tolerates, because the transaction
 * endpoint uses it too.
 */
function stateFromStatus(status: string): PaymentState {
  if (["completed", "successful", "success", "succeeded", "paid"].includes(status)) return "succeeded";
  if (["failed", "cancelled", "canceled", "expired", "declined"].includes(status)) return "failed";
  if (["pending", "processing", "created", "requires_action"].includes(status)) return "pending";
  return "unknown";
}

function pick(value: unknown, key: string | null): Record<string, unknown> | null {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!record) return null;
  if (key === null) return record;
  const nested = record[key];
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function read(record: Record<string, unknown> | null, key: string): unknown {
  return record ? record[key] : undefined;
}

/**
 * `metadata.amount_minor` as we wrote it at checkout.
 *
 * Whole bututs or nothing: a fractional or negative figure is not a price
 * this app ever set, and treating it as one would mean checking a real
 * payment against a corrupted expectation. Null instead, which makes the
 * payment hold for review.
 */
function expectedMinorFromMetadata(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
