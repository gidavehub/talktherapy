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
import { getAuth } from "firebase-admin/auth";
import {
  MODEM_PAY_BASE_URL,
  buildCheckoutBody,
  decideFulfilment,
  isTransferEvent,
  normaliseTransferEvent,
  normaliseWebhookEvent,
  readTransferResponse,
  paymentMethodsFor,
  readCheckoutResponse,
  verifyWebhookSignature,
  webhookEventKey,
  SIGNATURE_HEADER,
} from "../../app/lib/payments/modempay-protocol";
import { AI_PURPOSE, AI_TIERS, tierAlreadyHeld, tierForPurpose, type AiTierId } from "../../app/lib/models";
import { bookSlot, cancelBooking } from "./bookings";
import {
  activeConsultation,
  consultationStillGrantable,
  consultationToCredit,
  createPendingPayment,
  creditConsultation,
  creditSession,
  customerFor,
  db,
  entitlementRef,
  readPayment,
  recordAndApply,
  resolvePayer,
  sessionCharge,
  sessionToCredit,
  startConsultation,
  type ConsultationGrant,
} from "./payments";
import type { PaymentRecord } from "../../app/lib/payments/modempay-protocol";
import {
  applyTransferEvent,
  checkPayout as checkPayoutStatus,
  earningsFor,
  requestPayout as reservePayout,
  savePayoutAccount as savePayoutAccountFor,
  type TransferClient,
  type TransferLookup,
} from "./payouts";

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

/**
 * Start paying for a conversation with Talk — the D200 initial consultation,
 * or the longer one.
 *
 * Its own function rather than a branch of startSessionPayment: that one
 * prices from a booking, and two pricing authorities in one function is how a
 * client ends up naming its own price. The client sends a TIER NAME and
 * nothing else; the amount comes from AI_TIERS, here.
 */
export const startConsultationPayment = onCall(
  { ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to pay for your consultation.");

    const tier: AiTierId = request.data?.tier === "extended" ? "extended" : "initial";
    const { amountMinor, label, blurb } = AI_TIERS[tier];

    // A payment from a few minutes ago may have gone through without anybody
    // hearing about it yet — a lost webhook, a checkout finished in another
    // tab. Settle those FIRST, so somebody who has paid is never asked to pay
    // again because the news was late.
    await reconcilePendingConsultations(uid);

    // Already holding one that covers this: paying again would be taken and
    // then held for a refund. Better never to take it. (Holding the first and
    // buying the longer one is an upgrade, and goes ahead.)
    const held = await activeConsultation(uid);
    if (held && tierAlreadyHeld(held.tier, tier)) {
      throw new HttpsError("failed-precondition", "Your consultation is already paid for.");
    }

    const customer = await customerFor(uid);
    const paymentMethods = paymentMethodsFor(amountMinor);
    const body = buildCheckoutBody({
      amountMajor: toMajor(amountMinor),
      title: label,
      description: blurb,
      customerEmail: customer.email,
      customerName: customer.name,
      paymentMethods,
      metadata: {
        uid,
        purpose: AI_PURPOSE[tier],
        amount_minor: String(amountMinor),
        tier,
      },
      // Back to Talk, which picks up where it left off. The intent id is not
      // known until the gateway answers, so it cannot ride in this URL; the
      // page keeps it in sessionStorage instead.
      // A small page that closes itself if the checkout was opened as a tab
      // of Talk (which is still waiting there), and otherwise takes them back.
      returnUrl: `${appUrl()}/paid`,
      cancelUrl: `${appUrl()}/?payment=cancelled`,
      callbackUrl: WEBHOOK_URL,
    });

    let checkout;
    try {
      checkout = readCheckoutResponse(
        await modemPay("/v1/payments", { method: "POST", body: JSON.stringify(body) }),
      );
    } catch (error) {
      console.error("startConsultationPayment failed", error);
      throw new HttpsError("unavailable", "Could not start the payment. Please try again.");
    }

    await createPendingPayment({
      paymentIntentId: checkout.paymentIntentId,
      uid,
      purpose: AI_PURPOSE[tier],
      amountMinor,
      customerEmail: customer.email,
      paymentMethods,
      bookingId: null,
    });

    return {
      paymentIntentId: checkout.paymentIntentId,
      paymentLink: checkout.paymentLink,
      amountMinor,
      currency: "GMD",
      tier,
    };
  },
);

/**
 * Put the consultation where the AI functions can see it.
 *
 * Those functions run as talk-ai, which can read NOTHING in the database — on
 * purpose, and scripts/verify-service-accounts.mjs fails if it ever can. What
 * they can read is the caller's ID token, so the entitlement rides there too,
 * as a custom claim. `entitlements/{uid}` stays the source of truth; this is
 * the copy a database-blind function can check.
 *
 * Set AFTER the fulfilment transaction commits, never inside it: it is not a
 * Firestore write and cannot share the transaction's fate. A failure here is
 * logged, and claimConsultation below repairs it from the source of truth.
 * Existing claims are kept: setCustomUserClaims replaces the whole set.
 */
async function grantClaim(
  grant: Pick<ConsultationGrant, "uid" | "tier" | "expiresAt"> & { endsAt?: number | null },
): Promise<boolean> {
  try {
    const user = await getAuth().getUser(grant.uid);
    const { aiEndsAt: _previous, ...others } = (user.customClaims ?? {}) as Record<string, unknown>;
    void _previous;
    await getAuth().setCustomUserClaims(grant.uid, {
      ...others,
      aiTier: grant.tier,
      aiExpiresAt: grant.expiresAt,
      // Only once the conversation has started. Without it the AI functions
      // refuse, which is what makes the page call claimConsultation — the
      // one place the clock is started.
      ...(grant.endsAt ? { aiEndsAt: grant.endsAt } : {}),
    });
    return true;
  } catch (error) {
    console.error(`grantClaim: could not set the consultation claim for ${grant.uid}`, error);
    return false;
  }
}

/**
 * Begin — or carry on — the conversation somebody has paid for.
 *
 * The page calls this right before every conversation. The first call starts
 * the clock (startConsultation: 8 minutes becomes a window of 12, wall-clock);
 * every later one returns the same end, so a reload cannot stretch it. It
 * then puts that end on the account as a claim and returns, and the page
 * mints a fresh token — so the token the conversation uses is never older
 * than the claim it needs. It is also the repair for a claim that did not
 * stick: one extra round trip instead of somebody who paid being locked out.
 */
export const claimConsultation = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const held = await startConsultation(uid);
  if (!held) return { ok: false as const };

  const claimed = await grantClaim({ uid, tier: held.tier, expiresAt: held.expiresAt, endsAt: held.endsAt });
  if (!claimed) throw new HttpsError("unavailable", "Could not unlock your consultation. Please try again.");
  return { ok: true as const, tier: held.tier, endsAt: held.endsAt };
});

/**
 * "I have paid — has it arrived?" without knowing which payment.
 *
 * For the tab the checkout sends people back to, which never learned the
 * payment's id: it settles any recent consultation payment of theirs that
 * the gateway says succeeded, and says whether a consultation is now held.
 */
export const reconcileConsultation = onCall(
  { ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    const { held: needsReview } = await reconcilePendingConsultations(uid);
    const held = await activeConsultation(uid);
    return { paid: Boolean(held), tier: held?.tier ?? null, needsReview };
  },
);

/**
 * Settle this person's recent, unsettled consultation payments against what
 * the gateway says. Each goes through the same reconcile as checkPayment, so
 * none can be credited twice.
 */
async function reconcilePendingConsultations(uid: string): Promise<{ held: boolean }> {
  const since = Date.now() - 2 * 60 * 60 * 1000;
  const snap = await db().collection("payments").where("uid", "==", uid).where("fulfilled", "==", false).limit(20).get();
  let held = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.needsReview === true) held = true;
    if (!tierForPurpose(typeof data.purpose === "string" ? data.purpose : null)) continue;
    if (data.status !== "pending" || typeof data.createdAt !== "number" || data.createdAt < since) continue;
    const record = await readPayment(doc.id);
    if (record) {
      const result = await reconcile(doc.id, record);
      if (result.needsReview) held = true;
    }
  }
  return { held };
}

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

    return reconcile(paymentIntentId, record);
  },
);

/**
 * Ask the gateway about one of our payments and, if it succeeded, record and
 * fulfil it — through the same single transaction as the webhook, so either
 * may arrive first and the credit still happens once.
 */
async function reconcile(paymentIntentId: string, record: PaymentRecord) {
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
  // Our own record of what this was for outranks the metadata.
  const consultation = bookingId
    ? null
    : await consultationToCredit({
        purpose: record.purpose ?? authoritative.purpose,
        payerUid: payer.uid,
        amountMinor: authoritative.amountMinor,
        paymentIntentId,
      });

  const { outcome, decision } = await recordAndApply({
    // A different key from the webhook's on purpose: the two are independent
    // observations of the same payment, and `fulfilled` — not the key — is
    // what keeps the credit to exactly once.
    eventKey: `verify_${paymentIntentId}`,
    paymentIntentId,
    eventName: "verify.reconciled",
    signatureRouting: null,
    reads: consultation ? [entitlementRef(consultation.uid)] : [],
    decide: (current, [held]) =>
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
        // Nothing to deliver is held for a human, never marked fulfilled —
        // and nor is a second payment for a consultation already held,
        // judged inside the transaction where two cannot race.
        grantable: Boolean(
          bookingId || (consultation && (!held || consultationStillGrantable(held, consultation, paymentIntentId))),
        ),
      }),
    credit: bookingId
      ? creditSession(bookingId, paymentIntentId)
      : consultation
        ? creditConsultation(consultation, paymentIntentId)
        : undefined,
  });

  if (outcome === "applied" && decision.credit && consultation) await grantClaim(consultation);

  return {
    status: decision.patch?.status ?? record.status,
    fulfilled: decision.patch?.fulfilled ?? record.fulfilled,
    needsReview: decision.patch?.needsReview ?? record.needsReview,
    reconciled: true,
    reason: decision.reason,
  };
}

// ------------------------------------------------------------------ payouts

/**
 * The transfer call, as the modem-pay SDK makes it (resources/transfer.js):
 * the body bare, the idempotency key as a header.
 *
 * What matters most is telling "refused" from "no idea". A 4xx is a refusal
 * — nothing was sent, and the sessions can go back into the balance. A
 * timeout, a 5xx, a 409 or a 429 might have sent it: those are "unknown",
 * and the payout is asked about again with the same key, never released.
 */
const modemTransfer: TransferClient = async (body, idempotencyKey) => {
  const key = MODEM_PAY_SECRET_KEY.value().trim();
  if (!key) return { kind: "refused", message: "Payments are not configured." };
  let res: Response;
  try {
    res = await fetch(`${MODEM_PAY_BASE_URL}/v1/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    return { kind: "unknown", message: `no answer: ${(error as Error).message}` };
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Kept as text for the log.
  }
  if (res.ok) return { kind: "accepted", ...readTransferResponse(parsed) };
  // Logged, not returned: a gateway error can carry account details.
  console.error(`Modem Pay transfer ${idempotencyKey} answered ${res.status}: ${text.slice(0, 300)}`);
  if (res.status >= 500 || [408, 409, 425, 429].includes(res.status)) {
    return { kind: "unknown", message: `gateway ${res.status}` };
  }
  return { kind: "refused", message: `gateway ${res.status}` };
};

const modemTransferLookup: TransferLookup = async (reference) => {
  try {
    const body = await modemPay(`/v1/transfers/${encodeURIComponent(reference)}`, { method: "GET" });
    return { state: readTransferResponse(body).state };
  } catch (error) {
    console.warn("Modem Pay transfer lookup failed:", (error as Error).message);
    return null;
  }
};

async function requireProvider(uid: string): Promise<void> {
  const role = (await db().collection("users").doc(uid).get()).data()?.role;
  if (role !== "provider") throw new HttpsError("permission-denied", "Only providers are paid out.");
}

/**
 * Where a provider is paid. Through here and nowhere else — the browser
 * cannot write it — so it is checked, and every change is kept.
 */
export const savePayoutAccount = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const result = await savePayoutAccountFor(uid, {
    network: request.data?.network,
    accountNumber: request.data?.accountNumber,
    beneficiaryName: request.data?.beneficiaryName,
  });
  if (!result.ok) throw new HttpsError("invalid-argument", result.reason);
  return result.account;
});

/**
 * Withdraw what a provider has earned: every session paid for, over, and
 * past the hold, less the platform's share — to their own wallet.
 */
export const requestPayout = onCall({ ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await requireProvider(uid);
  const result = await reservePayout(uid, modemTransfer, { callbackUrl: WEBHOOK_URL });
  if (!result.ok) throw new HttpsError("failed-precondition", result.reason);
  return result;
});

/** What a provider has earned — counted exactly as a withdrawal would count it. */
export const providerEarnings = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await requireProvider(uid);
  return earningsFor(uid);
});

/** Where does this payout stand? Asks again, safely, when the answer was unclear. */
export const checkPayout = onCall({ ...CALLABLE, secrets: [MODEM_PAY_SECRET_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const payoutId = String(request.data?.payoutId ?? "").trim();
  if (!payoutId) throw new HttpsError("invalid-argument", "Missing payout.");
  const result = await checkPayoutStatus(uid, payoutId, modemTransfer, modemTransferLookup, WEBHOOK_URL);
  if (!result.ok) throw new HttpsError("not-found", result.reason);
  return result;
});

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

    // A transfer is not a payment, and must never be read as one: its status
    // is "completed", which the payment reader would call a success.
    if (isTransferEvent(parsed)) {
      try {
        const reason = await applyTransferEvent(normaliseTransferEvent(parsed));
        console.log(`modemWebhook: transfer — ${reason}`);
        res.status(200).json({ received: true, acted: true, reason });
      } catch (error) {
        console.error("modemWebhook: failed to apply a transfer event", error);
        res.status(500).json({ error: "Could not record the transfer. Please retry." });
      }
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
    // What the payment was for: our own record first — the server wrote it
    // when the payment began — then the transaction's metadata, then the
    // delivery's.
    const recorded = bookingId ? null : await readPayment(event.paymentIntentId);
    const consultation =
      bookingId || event.outcome !== "succeeded"
        ? null
        : await consultationToCredit({
            purpose: recorded?.purpose ?? authoritative?.purpose ?? event.purpose,
            payerUid: payer.uid,
            amountMinor,
            paymentIntentId: event.paymentIntentId,
          });

    try {
      const { outcome, decision } = await recordAndApply({
        eventKey: webhookEventKey(raw, event.eventId),
        paymentIntentId: event.paymentIntentId,
        eventName: event.eventName || event.statusText || "unknown",
        signatureRouting: verdict.routing,
        reads: consultation ? [entitlementRef(consultation.uid)] : [],
        decide: (current, [held]) =>
          decideFulfilment({
            event,
            current,
            resolvedUid: payer.uid,
            reportedAmountMinor: amountMinor,
            expectedAmountMinor: authoritative?.expectedAmountMinor ?? event.expectedAmountMinor,
            resolvedPurpose: authoritative?.purpose ?? null,
            resolvedEmail: payer.email,
            grantable: Boolean(
              bookingId ||
                (consultation &&
                  (!held || consultationStillGrantable(held, consultation, event.paymentIntentId ?? ""))),
            ),
          }),
        credit: bookingId
          ? creditSession(bookingId, event.paymentIntentId)
          : consultation
            ? creditConsultation(consultation, event.paymentIntentId)
            : undefined,
      });

      if (outcome === "applied" && decision.credit && consultation) await grantClaim(consultation);

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
