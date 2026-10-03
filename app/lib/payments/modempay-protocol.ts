/**
 * Modem Pay's wire protocol — the pure half.
 *
 * Everything here is deterministic and offline: HMAC verification, event-shape
 * normalisation, the card-minimum rule, request/response shaping and the
 * fulfilment decision. The half that holds the secret key and talks to
 * api.modempay.com lives in ./modempay.ts.
 *
 * Why the split: this file is what `scripts/test-modempay-webhook.mjs` imports
 * and exercises. The webhook verifier is the one piece of a payment
 * integration that must be right before any real money moves, and it is the
 * one piece that can be proved without credentials — but only if it is
 * reachable from a plain Node script. So this file deliberately carries no
 * `server-only` marker and makes NO value imports at all (only `node:crypto`,
 * which Node resolves natively). Type-only imports are erased, so Node's type
 * stripping can load it as-is.
 *
 * Money convention: every amount crossing this file is an integer in minor
 * units (bututs), as everywhere else in the app. Modem Pay's own API wants
 * MAJOR units; that conversion happens in ./modempay.ts and nowhere else.
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// --------------------------------------------------------------- the endpoint

export const MODEM_PAY_BASE_URL = "https://api.modempay.com";

/** Header Modem Pay signs the webhook body with. */
export const SIGNATURE_HEADER = "x-modem-signature";

// ------------------------------------------------------------ payment methods

/**
 * Modem Pay's tokens, which are not the names a human would guess.
 *
 * `wallet` is how every Gambian mobile-money wallet is reached — Wave,
 * Afrimoney and QMoney are all behind it; the shopper picks theirs on the
 * hosted page. `mobile_money` looks like the obvious token and is REJECTED by
 * the API.
 */
export const PAYMENT_METHOD_WALLET = "wallet" as const;
export const PAYMENT_METHOD_CARD = "card" as const;

export type PaymentMethodToken = typeof PAYMENT_METHOD_WALLET | typeof PAYMENT_METHOD_CARD;

/**
 * The card rail has a floor of about GMD 75. Offering card below it produces a
 * checkout page the shopper cannot complete, so small amounts go wallet-only.
 */
export const CARD_MINIMUM_MINOR = 75_00;

/**
 * Wallet is always listed first: it is what almost everyone here actually
 * pays with, and the hosted page follows this order.
 */
export function paymentMethodsFor(amountMinor: number): PaymentMethodToken[] {
  return amountMinor < CARD_MINIMUM_MINOR
    ? [PAYMENT_METHOD_WALLET]
    : [PAYMENT_METHOD_WALLET, PAYMENT_METHOD_CARD];
}

// ------------------------------------------------------------ hosted checkout

export type CheckoutParams = {
  /** MAJOR units — Dalasi. Converted by the caller; see the file header. */
  amountMajor: number;
  title: string;
  description: string;
  customerEmail: string | null;
  customerName: string | null;
  paymentMethods: PaymentMethodToken[];
  /** Always carries `uid` and `purpose`; see `CheckoutMetadata`. */
  metadata: CheckoutMetadata;
  returnUrl: string;
  cancelUrl: string;
  /** Per-intent webhook target. Note the signing-key consequence below. */
  callbackUrl: string;
};

/**
 * Metadata is the first and most reliable way the webhook learns who paid, so
 * `uid` and `purpose` are required rather than optional. Values are strings
 * only — anything else has a habit of coming back from the provider coerced.
 */
export type CheckoutMetadata = {
  uid: string;
  purpose: string;
  [key: string]: string;
};

/**
 * The create-payment request body.
 *
 * THE WRAPPER IS NOT OPTIONAL. `POST /v1/payments` expects
 * `{ data: { ...params, from_sdk: false } }`. Sending the parameters flat — the
 * shape every REST API in the world would suggest — fails. `from_sdk` tells
 * Modem Pay this is a direct server call rather than one of their SDKs, and it
 * sits inside `data` with the rest.
 */
export function buildCheckoutBody(params: CheckoutParams): { data: Record<string, unknown> } {
  return {
    data: {
      amount: params.amountMajor,
      // GMD is the only currency this merchant account can take.
      currency: "GMD",
      payment_methods: params.paymentMethods,
      title: params.title,
      description: params.description,
      customer_email: params.customerEmail,
      customer_name: params.customerName,
      metadata: params.metadata,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      callback_url: params.callbackUrl,
      from_sdk: false,
    },
  };
}

export type CheckoutResult = {
  paymentIntentId: string;
  paymentLink: string;
};

/**
 * Read `POST /v1/payments`'s reply: `{ status, message, data: { ... } }`.
 *
 * The two fields we need are `data.payment_intent_id` and `data.payment_link`.
 * `data.id` also exists and is NOT the intent id — reading it gives an id that
 * no later lookup or webhook will ever match. `intent_secret` is for the
 * client-side SDK's embedded flow; this integration is hosted-redirect only,
 * so it is ignored on purpose.
 */
export function readCheckoutResponse(body: unknown): CheckoutResult {
  const data = asRecord(asRecord(body)?.data);
  const paymentIntentId = asString(data?.payment_intent_id);
  const paymentLink = asString(data?.payment_link);
  if (!paymentIntentId || !paymentLink) {
    throw new Error(
      "Modem Pay did not return data.payment_intent_id and data.payment_link",
    );
  }
  return { paymentIntentId, paymentLink };
}

// ------------------------------------------------------- signature verification

export type SignatureRouting =
  /** Modem Pay signs with the MERCHANT SECRET KEY when it posts to a
   *  per-intent `callback_url` — which is what this integration sets. */
  | "merchant-secret-key"
  /** ...and with the WEBHOOK SIGNING SECRET when the delivery comes from a
   *  webhook configured in the dashboard. */
  | "webhook-signing-secret";

export type SignatureCandidate = {
  routing: SignatureRouting;
  secret: string | null | undefined;
};

/** Which body bytes the HMAC was computed over. */
export type SignedForm = "raw" | "restringified";

export type SignatureVerdict = {
  ok: boolean;
  routing: SignatureRouting | null;
  form: SignedForm | null;
};

/**
 * Test hook: how much work the verifier did.
 *
 * `scripts/test-modempay-webhook.mjs` reads these to prove the verifier does
 * the SAME amount of work for a forged signature as for a valid one — no
 * early return on a length mismatch, no `break` the moment a candidate key
 * matches. A timing measurement would be flaky; counting the digests and
 * compares actually performed is not.
 */
export const signatureStats = { digests: 0, compares: 0 };

/** Hex HMAC-SHA512, which is what the `x-modem-signature` header holds. */
export function hexHmacSha512(secret: string, body: string): string {
  signatureStats.digests += 1;
  return createHmac("sha512", secret).update(body, "utf8").digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Per-process key for the double-HMAC compare below. Random, never leaves this
 * process, and signs nothing — it exists only to give the comparison two
 * equal-length buffers.
 */
const COMPARE_KEY = randomBytes(32);

/**
 * Constant-time compare for two hex strings of possibly different lengths.
 *
 * `crypto.timingSafeEqual` throws unless both buffers are the same length, and
 * the obvious guard — `a.length === b.length && timingSafeEqual(a, b)` — leaks
 * the expected digest's length through timing and short-circuits on exactly
 * the input an attacker controls. Hashing both sides under a random
 * per-process key first yields two 32-byte buffers whatever was presented, so
 * the work done is identical for a 1-character signature and a correct one.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = createHmac("sha256", COMPARE_KEY).update(a, "utf8").digest();
  const right = createHmac("sha256", COMPARE_KEY).update(b, "utf8").digest();
  signatureStats.compares += 1;
  return timingSafeEqual(left, right);
}

/** `JSON.stringify(JSON.parse(x))`, or null when the body is not JSON. */
function restringify(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Is this delivery genuinely from Modem Pay?
 *
 * Two things make this harder than the usual HMAC check, and both are learned
 * the hard way rather than documented:
 *
 *  1. THE SIGNING KEY DEPENDS ON ROUTING. A delivery to a per-intent
 *     `callback_url` is signed with the merchant secret key; a delivery from a
 *     dashboard-configured webhook is signed with the webhook signing secret.
 *     Verifying against only one of them rejects half of all genuine events,
 *     so every configured candidate is tried.
 *  2. THE BODY MAY HAVE BEEN RE-SERIALISED in transit. The signature is over
 *     the bytes Modem Pay sent, so the raw bytes are checked first, but a
 *     canonical `JSON.stringify(JSON.parse(body))` is checked too — it costs
 *     one more HMAC and recovers deliveries that would otherwise be dropped.
 *
 * Secrets are `.trim()`ed because a key pasted out of a dashboard very often
 * carries a trailing newline, and HMAC does not complain about it — it just
 * silently never matches, which is a miserable afternoon to debug.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headerValue: string | null | undefined,
  candidates: SignatureCandidate[],
): SignatureVerdict {
  // Digests from `crypto` are lower-case hex; accept either case from the wire.
  const presented = (headerValue ?? "").trim().toLowerCase();

  const bodies: Array<{ form: SignedForm; text: string }> = [{ form: "raw", text: rawBody }];
  const canonical = restringify(rawBody);
  if (canonical !== null && canonical !== rawBody) {
    bodies.push({ form: "restringified", text: canonical });
  }

  const verdict: SignatureVerdict = { ok: false, routing: null, form: null };

  for (const candidate of candidates) {
    const secret = (candidate.secret ?? "").trim();
    if (!secret) continue;
    for (const body of bodies) {
      const expected = hexHmacSha512(secret, body.text);
      const matched = timingSafeStringEqual(expected, presented);
      // Deliberately no `break`. Every candidate and every body form is always
      // tried, so how long the call takes never reveals which key or which
      // encoding matched — and the first match is the one reported.
      if (matched && !verdict.ok) {
        verdict.ok = true;
        verdict.routing = candidate.routing;
        verdict.form = body.form;
      }
    }
  }

  return verdict;
}

// ----------------------------------------------------------- event normalising

/**
 * Modem Pay's webhook envelope is not one fixed shape. Observed across working
 * integrations: the event name arrives as `event` or as `type`, and the body
 * as `payload` or as `data`. Tolerating both is cheaper than guessing wrong.
 */
export type WebhookOutcome = "succeeded" | "failed" | "unknown";

export type NormalisedEvent = {
  /** Provider's event id, when the envelope carries a distinguishable one. */
  eventId: string | null;
  /** Name as sent, lower-cased. Empty string when absent. */
  eventName: string;
  /** Payment status as sent, lower-cased. Empty string when absent. */
  statusText: string;
  outcome: WebhookOutcome;
  paymentIntentId: string | null;
  /** As the wire gives it: MAJOR units. Converted in ./modempay.ts. */
  amountMajor: number | null;
  /**
   * What we asked for, from `metadata.amount_minor` — already bututs, because
   * we are the ones who put it there (see buildCheckoutBody).
   *
   * This exists so a payment can still be checked against its price when our
   * own record of it is missing — a create that wrote the intent and then
   * failed to write the record, say. Without it the only expected amount is
   * the one in our database, and a payment we have no record of would be
   * credited with nothing to compare it to.
   */
  expectedAmountMinor: number | null;
  /** From `metadata.uid` — tier one of resolving who paid. */
  uid: string | null;
  purpose: string | null;
  customerEmail: string | null;
};

const SUCCESS_EVENTS = new Set([
  "charge.succeeded",
  "payment_intent.succeeded",
  "payment.succeeded",
  "checkout.completed",
]);

const SUCCESS_STATUSES = new Set(["completed", "successful", "success", "succeeded", "paid"]);

const FAILURE_EVENTS = new Set([
  "charge.failed",
  "charge.cancelled",
  "charge.canceled",
  "charge.expired",
  "payment_intent.failed",
  "payment_intent.cancelled",
  "payment_intent.canceled",
  "payment_intent.expired",
  "payment.failed",
  "payment.cancelled",
  "payment.canceled",
  "payment.expired",
  "checkout.failed",
  "checkout.cancelled",
  "checkout.canceled",
  "checkout.expired",
]);

const FAILURE_STATUSES = new Set(["failed", "cancelled", "canceled", "expired", "declined"]);

export function normaliseWebhookEvent(body: unknown): NormalisedEvent {
  const envelope = asRecord(body) ?? {};
  const eventName = (asString(envelope.event) ?? asString(envelope.type) ?? "").toLowerCase();
  const payload = asRecord(envelope.payload) ?? asRecord(envelope.data) ?? envelope;

  const metadata = asRecord(payload.metadata) ?? {};
  const statusText = (asString(payload.status) ?? asString(envelope.status) ?? "").toLowerCase();

  const paymentIntentId =
    asString(payload.payment_intent_id) ??
    asString(payload.paymentIntentId) ??
    asString(payload.intent_id) ??
    // Only as a last resort: on some envelopes the payload IS the intent, and
    // then its `id` is the intent id. Never preferred over an explicit field.
    asString(payload.id);

  return {
    eventId: extractEventId(envelope, paymentIntentId),
    eventName,
    statusText,
    outcome: classify(eventName, statusText),
    paymentIntentId,
    amountMajor: asNumber(payload.amount),
    // Metadata values come back as strings even when they went out as
    // numbers, so this is parsed rather than read.
    expectedAmountMinor: asIntegerish(metadata.amount_minor),
    uid: asString(metadata.uid),
    purpose: asString(metadata.purpose),
    customerEmail: asString(payload.customer_email) ?? asString(payload.customerEmail),
  };
}

/**
 * Failure wins ties on purpose.
 *
 * An envelope naming a success event but carrying `status: "failed"` is not a
 * payment, and when the two disagree the cautious reading is the only one that
 * cannot hand out something nobody paid for.
 */
function classify(eventName: string, statusText: string): WebhookOutcome {
  if (FAILURE_EVENTS.has(eventName) || FAILURE_STATUSES.has(statusText)) return "failed";
  if (SUCCESS_EVENTS.has(eventName) || SUCCESS_STATUSES.has(statusText)) return "succeeded";
  return "unknown";
}

/**
 * The provider's event id, but only when it is safe to use as an idempotency
 * key.
 *
 * A top-level `id` that is really the PAYMENT INTENT id would make two
 * genuinely different events for the same payment — say `pending` then
 * `succeeded` — collide, and the second would be discarded as a replay. That
 * is the shape of a payment that is never credited. So an `id` equal to the
 * intent id is refused here, and the caller falls back to hashing the body,
 * which is unique per delivery and cannot collide that way.
 */
function extractEventId(envelope: Record<string, unknown>, paymentIntentId: string | null): string | null {
  const explicit = asString(envelope.event_id) ?? asString(envelope.eventId);
  if (explicit) return explicit;
  const id = asString(envelope.id);
  if (id && id !== paymentIntentId) return id;
  return null;
}

/**
 * The idempotency key for a delivery.
 *
 * The provider's event id is preferred, so that a retry which re-serialises
 * the body is still recognised as the same event. Without one, the sha256 of
 * the exact bytes is used: identical for a true retry, different for any other
 * event.
 */
export function webhookEventKey(rawBody: string, eventId: string | null): string {
  return eventId ? `evt_${eventId}` : `raw_${sha256Hex(rawBody)}`;
}

// --------------------------------------------------------- fulfilment decision

/** What the server has recorded about a payment it created. */
export type PaymentRecord = {
  paymentIntentId: string;
  uid: string | null;
  purpose: string | null;
  /** What we asked the shopper for, in bututs. */
  amountMinor: number | null;
  status: "pending" | "succeeded" | "failed";
  /** True once the thing paid for has actually been granted. */
  fulfilled: boolean;
  needsReview: boolean;
};

export type PaymentPatch = {
  status: "pending" | "succeeded" | "failed";
  fulfilled: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  event: string;
  uid?: string | null;
  purpose?: string | null;
  /** Set when the provider is the authority on the amount. */
  amountMinor?: number;
  customerEmail?: string | null;
};

export type FulfilmentDecision = {
  /** Fields to write onto `payments/{paymentIntentId}`. Null writes nothing. */
  patch: PaymentPatch | null;
  /** Whether the caller must now grant what was paid for. */
  credit: boolean;
  /** Recorded on the payment and logged. Plain English, for a human. */
  reason: string;
};

/**
 * Amounts agree to within one butut (D0.01).
 *
 * Both sides are integers here precisely so this is an integer comparison; the
 * tolerance exists for the provider's own major-unit rounding, not for ours.
 */
export function amountsAgree(expectedMinor: number, reportedMinor: number): boolean {
  return Math.abs(expectedMinor - reportedMinor) <= 1;
}

export type FulfilmentInput = {
  event: NormalisedEvent;
  /** The payment we created, as last written. Null when nothing matches. */
  current: PaymentRecord | null;
  /** Who paid, after all three resolution tiers. Null when unresolved. */
  resolvedUid: string | null;
  /** Provider's amount in bututs, converted at the API boundary. */
  reportedAmountMinor: number | null;
  /**
   * What the payment was supposed to cost, when our own record does not say.
   * Taken from the metadata we attached at checkout — preferably as the
   * provider's transaction endpoint reports it back, not as the delivery
   * claims.
   */
  expectedAmountMinor?: number | null;
  /** Authoritative purpose/email, when a transaction lookup supplied them. */
  resolvedPurpose?: string | null;
  resolvedEmail?: string | null;
};

/**
 * Should this event move money's worth of product, and what gets written?
 *
 * Pure so it can be read and tested on its own. Every branch that is not an
 * unambiguous success either does nothing or parks the payment for a human —
 * `needsReview` is always preferable to activating something on a guess.
 */
export function decideFulfilment(input: FulfilmentInput): FulfilmentDecision {
  const { event, current, resolvedUid, reportedAmountMinor } = input;

  const base = {
    event: event.eventName || event.statusText || "unknown",
    uid: resolvedUid ?? current?.uid ?? null,
    purpose: input.resolvedPurpose ?? event.purpose ?? current?.purpose ?? null,
    customerEmail: input.resolvedEmail ?? event.customerEmail ?? null,
  };

  if (event.outcome === "unknown") {
    // Not ours to act on. The caller still answers 200 so retries stop.
    return { patch: null, credit: false, reason: `Unhandled event "${base.event}"` };
  }

  if (event.outcome === "failed") {
    if (current?.fulfilled) {
      // A late `expired` after a real success must never revoke the thing the
      // person already paid for and received.
      return { patch: null, credit: false, reason: "Already fulfilled; ignoring a later failure" };
    }
    return {
      patch: { ...base, status: "failed", fulfilled: false, needsReview: false, reviewReason: null },
      credit: false,
      reason: `Payment ${event.statusText || "failed"}`,
    };
  }

  // --- succeeded -----------------------------------------------------------

  if (current?.fulfilled) {
    // Belt to the event ledger's braces: even if two different idempotency
    // keys describe the same success (a webhook and a return-page check, say),
    // the credit happens once.
    return { patch: null, credit: false, reason: "Already fulfilled" };
  }

  if (!resolvedUid) {
    return {
      patch: {
        ...base,
        status: "succeeded",
        fulfilled: false,
        needsReview: true,
        reviewReason: "Could not establish who paid",
      },
      credit: false,
      reason: "Paid, but nobody could be matched to it — held for review",
    };
  }

  // Our own record first; the metadata we attached at checkout is the fallback
  // for a payment we somehow have no record of.
  const expectedMinor = current?.amountMinor ?? input.expectedAmountMinor ?? null;

  // Nothing is auto-activated on an amount nobody can corroborate. Either we
  // never knew the price (no record and no usable metadata) or the provider
  // did not tell us what was paid — and "someone paid an unknown amount" is
  // not grounds for handing over a D200 consultation. It is held, not lost:
  // the money is in the account and a human releases it.
  if (expectedMinor === null || reportedAmountMinor === null) {
    return {
      patch: {
        ...base,
        status: "succeeded",
        fulfilled: false,
        needsReview: true,
        reviewReason:
          expectedMinor === null
            ? "No record of what this payment was for, so there is nothing to check the amount against"
            : "The provider reported no amount, so the payment could not be checked",
        ...(reportedAmountMinor !== null ? { amountMinor: reportedAmountMinor } : {}),
      },
      credit: false,
      reason: "Paid, but the amount could not be corroborated — held for review",
    };
  }

  if (!amountsAgree(expectedMinor, reportedAmountMinor)) {
    return {
      patch: {
        ...base,
        status: "succeeded",
        fulfilled: false,
        needsReview: true,
        reviewReason: `Expected ${expectedMinor} bututs, provider reported ${reportedAmountMinor}`,
        amountMinor: reportedAmountMinor,
      },
      credit: false,
      reason: "Paid a different amount than asked — held for review",
    };
  }

  return {
    patch: {
      ...base,
      status: "succeeded",
      fulfilled: true,
      needsReview: false,
      reviewReason: null,
      amountMinor: reportedAmountMinor,
    },
    credit: true,
    reason: "Paid in full",
  };
}

// ------------------------------------------------------------------- payouts

/**
 * Networks Modem Pay will transfer out to, as an allow-list.
 *
 * Payouts are not wired up yet — provider session fees come with bookings —
 * but the allow-list belongs with the rest of the protocol so that whoever
 * builds `POST /v1/transfers` cannot quietly send a network name the API will
 * reject (or, worse, one it accepts and misroutes).
 */
export const PAYOUT_NETWORKS = ["wave", "afrimoney", "aps", "qmoney"] as const;

export type PayoutNetwork = (typeof PAYOUT_NETWORKS)[number];

export function isPayoutNetwork(value: string): value is PayoutNetwork {
  return (PAYOUT_NETWORKS as readonly string[]).includes(value);
}

// -------------------------------------------------------------------- helpers

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * A whole number of bututs, or null.
 *
 * Stricter than asNumber on purpose: this reads an amount we are going to
 * compare a real payment against, and "200.5 bututs" or a negative figure is
 * not a price we ever set — it is a sign the metadata was tampered with or
 * mangled, and the right answer then is to have no expected amount at all and
 * let the payment be held for review.
 */
function asIntegerish(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
