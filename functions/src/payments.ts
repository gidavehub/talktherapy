/**
 * The Firestore half of payments, inside Cloud Functions.
 *
 * The subtle half — signature verification, event shapes, the amount guard —
 * is NOT here. It lives in ../../app/lib/payments/modempay-protocol.ts and is
 * compiled into this bundle, so the function and the app share one copy of
 * the code that a hundred assertions in scripts/test-modempay-webhook.mjs are
 * written against. What is below is the mechanical part: reads, writes, and
 * one transaction.
 *
 * No service-account key is loaded anywhere in here. A Cloud Function runs as
 * the project's own service account, so `admin.initializeApp()` with no
 * arguments is already privileged — which is the whole reason the Modem Pay
 * secret belongs on this side rather than on a web host.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import type {
  FulfilmentDecision,
  PaymentRecord,
} from "../../app/lib/payments/modempay-protocol";

/**
 * The project, pinned.
 *
 * In Cloud Functions `initializeApp()` with no arguments works out the
 * project for itself. Run on a developer's machine it does not: it falls back
 * to that machine's Application Default Credentials, and on this one those
 * belong to a DIFFERENT project (quota project swipe-8bb22). The booking
 * transaction then read and wrote another project's Firestore without a single
 * error — every slot "no longer offered", every provider missing — which looks
 * exactly like a booking bug and is not one.
 *
 * GCLOUD_PROJECT is what the runtime sets, so deployed behaviour is unchanged.
 * Locally it is pinned, so the worst case is a loud permission error rather
 * than a quiet conversation with somebody else's database.
 */
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });

export const db = () => getFirestore();

const PAYMENTS = "payments";
const PAYMENT_EVENTS = "paymentEvents";
const BOOKINGS = "bookings";
const USERS = "users";

export const CURRENCY = "GMD";

// ------------------------------------------------------------------ records

export async function readPayment(paymentIntentId: string): Promise<PaymentRecord | null> {
  const snap = await db().collection(PAYMENTS).doc(paymentIntentId).get();
  return snap.exists ? toRecord(paymentIntentId, snap.data() ?? {}) : null;
}

function toRecord(paymentIntentId: string, data: FirebaseFirestore.DocumentData): PaymentRecord {
  const status = data.status;
  return {
    paymentIntentId,
    uid: typeof data.uid === "string" ? data.uid : null,
    purpose: typeof data.purpose === "string" ? data.purpose : null,
    amountMinor: typeof data.amountMinor === "number" ? data.amountMinor : null,
    status: status === "succeeded" || status === "failed" ? status : "pending",
    fulfilled: data.fulfilled === true,
    needsReview: data.needsReview === true,
  };
}

/**
 * Write the payment before the shopper is sent anywhere.
 *
 * The expected amount recorded here is what the webhook later checks the
 * gateway's figure against. With no record there is nothing to check a payment
 * against, and the only safe handling of an unrecognised one is to park it for
 * a human.
 */
export async function createPendingPayment(input: {
  paymentIntentId: string;
  uid: string;
  purpose: string;
  amountMinor: number;
  customerEmail: string | null;
  paymentMethods: string[];
  bookingId: string | null;
}): Promise<void> {
  const now = Date.now();
  await db().collection(PAYMENTS).doc(input.paymentIntentId).set({
    paymentIntentId: input.paymentIntentId,
    provider: "modempay",
    uid: input.uid,
    purpose: input.purpose,
    amountMinor: input.amountMinor,
    currency: CURRENCY,
    paymentMethods: input.paymentMethods,
    status: "pending",
    event: null,
    fulfilled: false,
    needsReview: false,
    reviewReason: null,
    customerEmail: input.customerEmail,
    bookingId: input.bookingId,
    createdAt: now,
    updatedAt: now,
  });
}

// ------------------------------------------------------ record-and-fulfil

export type RecordAndApplyResult = {
  outcome: "applied" | "duplicate" | "nothing-to-do";
  decision: FulfilmentDecision;
};

/**
 * Record the event and apply its decision together, or do neither.
 *
 * THE ORDER IS THE WHOLE POINT. Recording the event first and crediting after
 * lost real money in another of these projects: the credit failed, the record
 * had already committed, and the gateway's retry saw the event as handled and
 * skipped it. The payment was taken and nothing was ever delivered.
 *
 * `credit` runs inside the same transaction, so whatever it writes shares the
 * fate of the event record. It may only WRITE — by the time it runs the
 * transaction has already written, and Firestore refuses a read after a write.
 */
export async function recordAndApply(input: {
  eventKey: string;
  paymentIntentId: string;
  eventName: string;
  signatureRouting: string | null;
  decide: (current: PaymentRecord | null) => FulfilmentDecision;
  credit?: (tx: Transaction) => void;
}): Promise<RecordAndApplyResult> {
  const store = db();
  const eventRef = store.collection(PAYMENT_EVENTS).doc(input.eventKey);
  const paymentRef = store.collection(PAYMENTS).doc(input.paymentIntentId);

  return store.runTransaction(async (tx) => {
    const seen = await tx.get(eventRef);
    if (seen.exists) {
      return {
        outcome: "duplicate" as const,
        decision: { patch: null, credit: false, reason: "Event already handled" },
      };
    }

    const paymentSnap = await tx.get(paymentRef);
    const current = paymentSnap.exists
      ? toRecord(input.paymentIntentId, paymentSnap.data() ?? {})
      : null;
    const decision = input.decide(current);
    const now = Date.now();

    // Recorded even when the decision writes nothing, so an unknown or
    // unmatched event is not re-processed on every retry.
    tx.create(eventRef, {
      eventKey: input.eventKey,
      paymentIntentId: input.paymentIntentId,
      eventName: input.eventName,
      signatureRouting: input.signatureRouting,
      applied: decision.patch !== null,
      credited: decision.credit,
      reason: decision.reason,
      receivedAt: now,
    });

    if (!decision.patch) return { outcome: "nothing-to-do" as const, decision };

    tx.set(
      paymentRef,
      {
        paymentIntentId: input.paymentIntentId,
        ...stripUndefined(decision.patch as Record<string, unknown>),
        currency: CURRENCY,
        updatedAt: now,
        ...(paymentSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );

    if (decision.credit && input.credit) input.credit(tx);

    return { outcome: "applied" as const, decision };
  });
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

// ------------------------------------------------------------ who paid, what

export type ResolvedPayer = { uid: string | null; source: string; email: string | null };

/**
 * Who paid, in three tiers, refusing rather than guessing at the end.
 *
 * Crediting the wrong account is worse than crediting none, so an unresolved
 * payment is recorded as succeeded with `needsReview` and a human sorts it out
 * with the money already safely received.
 */
export async function resolvePayer(input: {
  metadataUid: string | null;
  authoritativeUid: string | null;
  email: string | null;
}): Promise<ResolvedPayer> {
  if (input.metadataUid) {
    return { uid: input.metadataUid, source: "metadata", email: input.email };
  }
  if (input.authoritativeUid) {
    return { uid: input.authoritativeUid, source: "transaction", email: input.email };
  }

  if (input.email) {
    // Our own users collection rather than Auth's getUserByEmail, because Auth
    // guarantees one match by construction and so could never report the
    // ambiguity this exists to detect. Two is enough to refuse.
    const snap = await db()
      .collection(USERS)
      .where("email", "==", input.email.toLowerCase())
      .limit(2)
      .get();
    if (snap.size === 1) {
      return { uid: snap.docs[0].id, source: "email", email: input.email };
    }
  }

  return { uid: null, source: "unresolved", email: input.email };
}

/**
 * Check, BEFORE any transaction opens, that this payment really is for a
 * session the payer has. A credit may only write, so everything that needs
 * reading has to be read here.
 */
export async function sessionToCredit(input: {
  bookingId: string | null;
  payerUid: string | null;
  amountMinor: number | null;
}): Promise<string | null> {
  if (!input.bookingId || !input.payerUid) return null;

  const snap = await db().collection(BOOKINGS).doc(input.bookingId).get();
  if (!snap.exists) return null;

  const data = snap.data() ?? {};
  // The payer must be the patient on that booking, not merely a participant.
  if (data.patientId !== input.payerUid) return null;
  // Money arriving for a cancelled session is a refund conversation, not an
  // activation.
  if (data.status === "cancelled") return null;
  if (
    typeof data.amountMinor === "number" &&
    input.amountMinor !== null &&
    Math.abs(data.amountMinor - input.amountMinor) > 1
  ) {
    return null;
  }

  return input.bookingId;
}

/**
 * Mark the session paid and confirm it.
 *
 * `set(..., { merge: true })` rather than `update`: an update of a document
 * that has since been deleted throws, which would fail the whole transaction
 * and leave the gateway retrying a payment it has already taken, for ever.
 *
 * `pending` becomes `confirmed` here and nowhere else — paying is what turns a
 * request for a time into an appointment both sides can rely on.
 */
export function creditSession(bookingId: string, paymentIntentId: string) {
  return (tx: Transaction) => {
    tx.set(
      db().collection(BOOKINGS).doc(bookingId),
      {
        paymentStatus: "paid",
        status: "confirmed",
        transactionId: paymentIntentId,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  };
}

/** What a session costs, read from the booking. Never from the request. */
export async function sessionCharge(
  bookingId: string,
  uid: string,
): Promise<{ amountMinor: number } | { error: string }> {
  const snap = await db().collection(BOOKINGS).doc(bookingId).get();
  if (!snap.exists) return { error: "No such session." };

  const data = snap.data() ?? {};
  // Same answer for "not yours" as for "not there", so this cannot be used to
  // discover other people's sessions.
  if (data.patientId !== uid) return { error: "No such session." };
  if (data.status === "cancelled") return { error: "That session was cancelled." };
  if (data.paymentStatus === "paid") return { error: "That session is already paid for." };

  const amountMinor = typeof data.amountMinor === "number" ? data.amountMinor : 0;
  if (amountMinor <= 0) return { error: "That session has no fee set." };

  return { amountMinor };
}

/** Email and name from the user's own document — never from the request. */
export async function customerFor(uid: string): Promise<{ email: string | null; name: string | null }> {
  const snap = await db().collection(USERS).doc(uid).get();
  const data = snap.data() ?? {};
  return {
    email: typeof data.email === "string" ? data.email : null,
    name: typeof data.displayName === "string" ? data.displayName : null,
  };
}

export { FieldValue };
