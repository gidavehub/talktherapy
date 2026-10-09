/**
 * Talk Cloud Functions (project: talk-therapy-509209).
 *
 * Deploy (as davelabs01@gmail.com):
 *   cd functions && npm run build && firebase deploy --only functions
 *
 * THE MODEM PAY SECRET LIVES HERE, in Google Secret Manager, and nowhere else.
 * Not in the Next app, not on the web host. A web host holds the public
 * Firebase config and nothing more; anything holding a merchant key or writing
 * with admin rights runs in this file, as the project's own service account.
 *
 * modemWebhook gives Modem Pay a public URL that works whether or not the web
 * app is deployed anywhere:
 *
 *   https://us-east4-talk-therapy-509209.cloudfunctions.net/modemWebhook
 *
 * Set the secrets before the first deploy:
 *   firebase functions:secrets:set MODEM_PAY_SECRET_KEY
 *   firebase functions:secrets:set MODEM_PAY_WEBHOOK_SECRET
 *
 * Modem Pay signs with a DIFFERENT key depending on routing — the merchant
 * secret key for the per-intent callback_url this sets on every payment, the
 * webhook signing secret for a webhook registered in the dashboard — and
 * nothing in the delivery says which. Both are tried. That also means the
 * per-intent route works with the merchant key alone, so payments can go live
 * before a dashboard webhook exists.
 */

import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import {
  MODEM_PAY_BASE_URL,
  buildCheckoutBody,
  decideFulfilment,
  normaliseWebhookEvent,
  paymentMethodsFor,
  readCheckoutResponse,
  verifyWebhookSignature,
  webhookEventKey,
  SIGNATURE_HEADER,
} from "../../app/lib/payments/modempay-protocol";
import { bookSlot, cancelBooking } from "./bookings";
import {
  createPendingPayment,
  creditSession,
  customerFor,
  readPayment,
  recordAndApply,
  resolvePayer,
  sessionCharge,
  sessionToCredit,
} from "./payments";

export {
  companionTurn,
  companionGreet,
  companionSpeak,
  companionPresent,
  companionSummarize,
} from "./companion";

const MODEM_PAY_SECRET_KEY = defineSecret("MODEM_PAY_SECRET_KEY");
const MODEM_PAY_WEBHOOK_SECRET = defineSecret("MODEM_PAY_WEBHOOK_SECRET");

/** Matches the other projects in this account. */
const REGION = "us-east4";

/**
 * Callables are invoked by the PUBLIC internet, by design — the browser calls
 * them, and Firebase checks the caller's ID token inside the function.
 *
 * Stated explicitly rather than left to the default, because the default is
 * only applied when a function is CREATED. checkPayment's first create failed
 * in a Cloud Build race and the retry UPDATED it instead, without the public
 * invoker binding — so Google's edge answered every call with a 401 before
 * the function ran, and a paid session whose webhook was slow could never
 * reconcile. Every deploy now sets it, whichever path the deploy takes.
 */
const CALLABLE = { region: REGION, invoker: "public" as const };

/** This function's own public URL — what every payment's callback_url is set to. */
const WEBHOOK_URL = `https://${REGION}-talk-therapy-509209.cloudfunctions.net/modemWebhook`;

/** Where the shopper's browser comes back to. */
function appUrl(): string {
  return (process.env.APP_BASE_URL || "https://talk-therapy-509209.web.app").replace(/\/+$/, "");
}

// ---------------------------------------------------------------- Dalasi

/**
 * Bututs to Dalasi — the ONE place minor units become major.
 *
 * Modem Pay's `amount` is Dalasi despite its SDK's type comment claiming minor
 * units. Getting this wrong charges a hundredth of the intended price, which
 * is the kind of mistake nobody notices until the month's takings are counted.
 */
const toMajor = (minor: number) => Math.round(minor) / 100;
const toMinor = (major: number) => Math.round(major * 100);

async function modemPay(path: string, init: RequestInit = {}) {
  const key = MODEM_PAY_SECRET_KEY.value().trim();
  if (!key) throw new HttpsError("failed-precondition", "Payments are not configured.");

  const res = await fetch(`${MODEM_PAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Left null; the raw text goes in the error, which is what a gateway error
    // page actually looks like and is worth having in a log.
  }
  if (!res.ok) throw new Error(`Modem Pay ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return body;
}

/** What the transaction endpoint says — the authority on amount and metadata. */
async function fetchTransaction(id: string) {
  try {
    const body = (await modemPay(`/v1/transactions/${encodeURIComponent(id)}`, { method: "GET" })) as
      | Record<string, unknown>
      | null;
    const data = (body?.data ?? body ?? {}) as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const amount = typeof data.amount === "number" ? data.amount : null;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const int = (v: unknown) => {
      const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
      return Number.isInteger(n) && n > 0 ? n : null;
    };

    return {
      status: String(data.status ?? "").toLowerCase(),
      amountMinor: amount === null ? null : toMinor(amount),
      expectedAmountMinor: int(metadata.amount_minor),
      uid: str(metadata.uid),
      purpose: str(metadata.purpose),
      bookingId: str(metadata.booking_id),
      customerEmail: str(data.customer_email) ?? str(data.customerEmail),
    };
  } catch (error) {
    console.warn("Modem Pay transaction lookup failed:", (error as Error).message);
    return null;
  }
}

// ------------------------------------------------------------------ booking

/**
 * Take a time with a provider.
 *
 * Here rather than in the web app because booking writes with admin rights: a
 * booking and the slot it takes have to change together, and a patient cannot
 * write a provider's slots. See ./bookings.ts.
 *
 * The client sends who and which slot, and nothing else that matters — the
 * time comes from the slot and the fee from the provider's profile, both read
 * inside the transaction.
 */
export const bookSession = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to book a session.");

  const providerId = String(request.data?.providerId ?? "").trim();
  const slotId = String(request.data?.slotId ?? "").trim();
  const note = String(request.data?.note ?? "");

  if (!providerId || !slotId) throw new HttpsError("invalid-argument", "Missing provider or time.");
  if (providerId === uid) {
    throw new HttpsError("invalid-argument", "You cannot book a session with yourself.");
  }

  const result = await bookSlot({ patientId: uid, providerId, slotId, note });
  if (!result.ok) {
    // "Somebody else just took that time" is a race the person can resolve by
    // picking again, not a malformed request.
    throw new HttpsError("aborted", result.reason);
  }

  return { bookingId: result.bookingId, startsAt: result.startsAt, endsAt: result.endsAt };
});

/**
 * Give a session back, and put the hour on the provider's calendar again.
 *
 * Either side may cancel, and neither has to explain. Somebody who cannot face
 * a session today should not have to ask permission to say so.
 */
export const cancelSession = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const bookingId = String(request.data?.bookingId ?? "").trim();
  if (!bookingId) throw new HttpsError("invalid-argument", "Missing booking.");

  const result = await cancelBooking(uid, bookingId);
  if (!result.ok) {
    // Same answer for "not yours" as for "not there", so this cannot be used
    // to discover whether two other people have a session together.
    throw new HttpsError(
      result.reason === "No such session." ? "not-found" : "failed-precondition",
      result.reason,
    );
  }

  return { cancelled: true };
});

// --------------------------------------------------------- start a payment

/**
 * Start paying for a booked session.
 *
 * Callable, so Firebase verifies the caller's ID token before this runs and
 * the browser needs no CORS of its own.
 *
 * THE PRICE IS NEVER SENT BY THE CLIENT. It was fixed when the booking was
 * made, from the provider's own profile, and is read back out of the booking
 * here. A client that could name its own price would book a D3,000 session for
 * a dalasi.
 */
export const startSessionPayment = onCall(
  { ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to pay for a session.");

    const bookingId = String(request.data?.bookingId ?? "").trim();
    if (!bookingId) throw new HttpsError("invalid-argument", "Missing session.");

    const charge = await sessionCharge(bookingId, uid);
    if ("error" in charge) throw new HttpsError("not-found", charge.error);

    const customer = await customerFor(uid);
    const paymentMethods = paymentMethodsFor(charge.amountMinor);

    const body = buildCheckoutBody({
      amountMajor: toMajor(charge.amountMinor),
      title: "Session with your provider",
      description: "One session, by video, inside Talk.",
      customerEmail: customer.email,
      customerName: customer.name,
      paymentMethods,
      metadata: {
        uid,
        purpose: "session_fee",
        // The expected amount travels with the payment, so a mismatch is
        // detectable even if our own record of it is somehow missing.
        amount_minor: String(charge.amountMinor),
        booking_id: bookingId,
      },
      returnUrl: `${appUrl()}/sessions?paid=1`,
      cancelUrl: `${appUrl()}/sessions`,
      // Per-intent. Deliveries to it are signed with the MERCHANT SECRET KEY
      // rather than the webhook signing secret — see the note at the top.
      callbackUrl: WEBHOOK_URL,
    });

    let checkout;
    try {
      checkout = readCheckoutResponse(
        await modemPay("/v1/payments", { method: "POST", body: JSON.stringify(body) }),
      );
    } catch (error) {
      // The gateway's message can carry account details, so it is logged and
      // not returned.
      console.error("startSessionPayment failed", error);
      throw new HttpsError("unavailable", "Could not start the payment. Please try again.");
    }

    await createPendingPayment({
      paymentIntentId: checkout.paymentIntentId,
      uid,
      purpose: "session_fee",
      amountMinor: charge.amountMinor,
      customerEmail: customer.email,
      paymentMethods,
      bookingId,
    });

    return {
      paymentIntentId: checkout.paymentIntentId,
      paymentLink: checkout.paymentLink,
      amountMinor: charge.amountMinor,
      currency: "GMD",
    };
  },
);

// ------------------------------------------------------------ reconciliation

/**
 * What happened to my payment?
 *
 * Polled by the page the shopper lands on. It also reconciles: if the gateway
 * says a payment succeeded but no webhook has arrived, this credits it
 * instead. Webhooks get lost, and somebody who has paid and is staring at a
 * spinner is not an acceptable outcome.
 *
 * Safe to run alongside the webhook because both go through the same single
 * transaction, and `decideFulfilment` refuses to credit a payment that is
 * already fulfilled. Whichever arrives first wins; the other finds it done.
 */
export const checkPayment = onCall(
  { ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const paymentIntentId = String(request.data?.paymentIntentId ?? "").trim();
    if (!paymentIntentId) throw new HttpsError("invalid-argument", "Missing payment.");

    const record = await readPayment(paymentIntentId);
    // Same answer for "not yours" and "does not exist".
    if (!record || record.uid !== uid) throw new HttpsError("not-found", "No such payment.");
    if (record.fulfilled) {
      return { status: record.status, fulfilled: true, needsReview: record.needsReview };
    }

    const authoritative = await fetchTransaction(paymentIntentId);
    if (!authoritative) {
      return { status: record.status, fulfilled: false, needsReview: record.needsReview, reconciled: false };
    }

    const succeeded = ["completed", "successful", "success", "succeeded", "paid"].includes(
      authoritative.status,
    );
    if (!succeeded) {
      return { status: record.status, fulfilled: false, needsReview: record.needsReview, reconciled: true };
    }

    const payer = await resolvePayer({
      metadataUid: authoritative.uid,
      authoritativeUid: authoritative.uid,
      email: authoritative.customerEmail,
    });
    const bookingId = await sessionToCredit({
      bookingId: authoritative.bookingId,
      payerUid: payer.uid,
      amountMinor: authoritative.amountMinor,
    });

    const { decision } = await recordAndApply({
      // A different key from the webhook's on purpose: the two are independent
      // observations of the same payment, and `fulfilled` — not the key — is
      // what keeps the credit to exactly once.
      eventKey: `verify_${paymentIntentId}`,
      paymentIntentId,
      eventName: "verify.reconciled",
      signatureRouting: null,
      decide: (current) =>
        decideFulfilment({
          event: {
            eventId: null,
            eventName: "verify.reconciled",
            statusText: "succeeded",
            outcome: "succeeded",
            paymentIntentId,
            amountMajor: null,
            expectedAmountMinor: authoritative.expectedAmountMinor,
            uid: authoritative.uid,
            bookingId: authoritative.bookingId,
            purpose: authoritative.purpose,
            customerEmail: authoritative.customerEmail,
          },
          current,
          resolvedUid: payer.uid,
          reportedAmountMinor: authoritative.amountMinor,
          expectedAmountMinor: authoritative.expectedAmountMinor,
          resolvedPurpose: authoritative.purpose,
          resolvedEmail: payer.email,
        }),
      credit: bookingId ? creditSession(bookingId, paymentIntentId) : undefined,
    });

    return {
      status: decision.patch?.status ?? record.status,
      fulfilled: decision.patch?.fulfilled ?? record.fulfilled,
      needsReview: decision.patch?.needsReview ?? record.needsReview,
      reconciled: true,
      reason: decision.reason,
    };
  },
);

// ------------------------------------------------------------------ webhook

/**
 * Modem Pay's webhook. The only thing that may mark a payment paid.
 *
 * NO AUTHENTICATION, deliberately: Modem Pay cannot hold a Firebase ID token.
 * The signature IS the authentication, and nothing here trusts a single field
 * of the body until it has verified.
 *
 * THE RAW BYTES MATTER. The HMAC is over exactly what was sent, so this reads
 * `req.rawBody` and parses by hand afterwards. Any re-encoding of a parsed
 * object is a different byte sequence with a different digest.
 *
 * Status codes are chosen around the gateway retrying without a 200:
 *   405 — anything but POST.
 *   400 — ONLY a signature that does not verify. Retrying will not help.
 *   500 — our own failure. We WANT the retry.
 *   200 — everything else, including events not acted on: unknown types,
 *         duplicates, unmatched payments. A retry reaches the same conclusion.
 */
export const modemWebhook = onRequest(
  { region: REGION, secrets: [MODEM_PAY_SECRET_KEY, MODEM_PAY_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST").status(405).json({ error: "Use POST." });
      return;
    }

    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body ?? {});

    const verdict = verifyWebhookSignature(raw, req.get(SIGNATURE_HEADER), [
      { routing: "merchant-secret-key", secret: MODEM_PAY_SECRET_KEY.value() },
      { routing: "webhook-signing-secret", secret: MODEM_PAY_WEBHOOK_SECRET.value() },
    ]);

    if (!verdict.ok) {
      console.warn("modemWebhook: signature matched neither the merchant key nor the webhook secret");
      res.status(400).json({ error: "Invalid signature." });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(200).json({ received: true, acted: false, reason: "Body was not JSON" });
      return;
    }

    const event = normaliseWebhookEvent(parsed);
    if (!event.paymentIntentId) {
      res.status(200).json({ received: true, acted: false, reason: "No payment intent id" });
      return;
    }

    // Always fetched on a claimed success: the amount check is only worth
    // something against a figure the delivered payload could not have been
    // wrong about.
    const authoritative = event.outcome === "succeeded" ? await fetchTransaction(event.paymentIntentId) : null;

    const payer = await resolvePayer({
      metadataUid: event.uid,
      authoritativeUid: authoritative?.uid ?? null,
      email: authoritative?.customerEmail ?? event.customerEmail,
    });

    const amountMinor =
      authoritative?.amountMinor ?? (event.amountMajor === null ? null : toMinor(event.amountMajor));

    // Checked BEFORE the transaction: a credit may only write.
    const bookingId = await sessionToCredit({
      bookingId: authoritative?.bookingId ?? event.bookingId,
      payerUid: payer.uid,
      amountMinor,
    });

    try {
      const { outcome, decision } = await recordAndApply({
        eventKey: webhookEventKey(raw, event.eventId),
        paymentIntentId: event.paymentIntentId,
        eventName: event.eventName || event.statusText || "unknown",
        signatureRouting: verdict.routing,
        decide: (current) =>
          decideFulfilment({
            event,
            current,
            resolvedUid: payer.uid,
            reportedAmountMinor: amountMinor,
            expectedAmountMinor: authoritative?.expectedAmountMinor ?? event.expectedAmountMinor,
            resolvedPurpose: authoritative?.purpose ?? null,
            resolvedEmail: payer.email,
          }),
        credit: bookingId ? creditSession(bookingId, event.paymentIntentId) : undefined,
      });

      console.log(
        `modemWebhook: ${event.paymentIntentId} ${outcome} (${decision.reason}) ` +
          `via ${verdict.routing}/${verdict.form}, payer ${payer.source}`,
      );

      res.status(200).json({ received: true, acted: outcome === "applied", reason: decision.reason });
    } catch (error) {
      // Our own fault, most likely Firestore. A 500 is the only code that makes
      // the gateway deliver this again — and because the event record and the
      // fulfilment share one transaction, nothing partial was left behind.
      console.error(`modemWebhook: failed to apply ${event.paymentIntentId}`, error);
      res.status(500).json({ error: "Could not record the payment. Please retry." });
    }
  },
);
