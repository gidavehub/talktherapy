/**
 * Where payments are recorded: `payments/{paymentIntentId}`.
 *
 * Written only here, only with the Admin SDK. firestore.rules lets the owner
 * read their own payment and lets no client write any of it, so this file is
 * the entire write path for payment state.
 *
 * THE ORDER OF OPERATIONS IN `recordAndApply` IS THE WHOLE POINT. The obvious
 * implementation — record the event id, then credit the account — lost real
 * money in another of the owner's projects: the credit failed after the record
 * had already committed, and the provider's retry looked at the record, saw
 * the event as handled, and skipped it. The payment was taken and nothing was
 * ever delivered. So the record and the credit go in ONE transaction: either
 * both land or neither does, and a retry of a failed attempt finds no record
 * and does the work.
 */

import "server-only";
import { adminDb } from "@/lib/server/admin";
import { CURRENCY } from "@/lib/money";
import type { FulfilmentDecision, PaymentRecord } from "./modempay-protocol";
import type { ProviderName } from "./provider";

/** `payments/{paymentIntentId}` — one document per payment intent. */
const PAYMENTS = "payments";

/**
 * `paymentEvents/{eventKey}` — the idempotency ledger.
 *
 * One document per webhook delivery acted on, keyed by the provider's event id
 * or a hash of the raw body. Its only job is to exist.
 */
const PAYMENT_EVENTS = "paymentEvents";

export type RecordAndApplyResult = {
  outcome: "applied" | "duplicate" | "nothing-to-do";
  decision: FulfilmentDecision;
};

/**
 * Write the payment we are about to send someone to pay.
 *
 * Done BEFORE the shopper is redirected, because the expected amount recorded
 * here is what the webhook later compares the provider's figure against. With
 * no record there is nothing to check a payment against, and the only safe
 * handling of an unrecognised payment is to park it for a human.
 */
export async function createPendingPayment(input: {
  paymentIntentId: string;
  provider: ProviderName;
  uid: string;
  purpose: string;
  amountMinor: number;
  customerEmail: string | null;
  paymentMethods: string[];
}): Promise<void> {
  const now = Date.now();
  await adminDb()
    .collection(PAYMENTS)
    .doc(input.paymentIntentId)
    .set({
      paymentIntentId: input.paymentIntentId,
      provider: input.provider,
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
      createdAt: now,
      updatedAt: now,
    });
}

export async function readPayment(paymentIntentId: string): Promise<PaymentRecord | null> {
  const snap = await adminDb().collection(PAYMENTS).doc(paymentIntentId).get();
  return snap.exists ? toRecord(paymentIntentId, snap.data() ?? {}) : null;
}

/**
 * Record this event and apply its decision together, or do neither.
 *
 * `decide` is called with the payment as it stands inside the transaction, so
 * the decision is made against state nobody can have changed underneath it.
 * `credit` runs inside the same transaction too — whatever it writes shares the
 * fate of the event record.
 */
export async function recordAndApply(input: {
  eventKey: string;
  paymentIntentId: string;
  eventName: string;
  /** Which secret verified the signature, kept for diagnosing routing. */
  signatureRouting: string | null;
  decide: (current: PaymentRecord | null) => FulfilmentDecision;
  /**
   * Grants the thing paid for. Enlisted in the same transaction, so it cannot
   * succeed while the event record fails or vice versa.
   */
  credit?: (
    tx: import("firebase-admin/firestore").Transaction,
    record: PaymentRecord,
  ) => void | Promise<void>;
}): Promise<RecordAndApplyResult> {
  const db = adminDb();
  const eventRef = db.collection(PAYMENT_EVENTS).doc(input.eventKey);
  const paymentRef = db.collection(PAYMENTS).doc(input.paymentIntentId);

  return db.runTransaction(async (tx) => {
    // Reading the ledger inside the transaction gives a clean duplicate
    // signal; `tx.create` below then also refuses at commit if the document
    // appeared in between. Both guards, because this is the one that matters.
    const seen = await tx.get(eventRef);
    if (seen.exists) {
      return {
        outcome: "duplicate" as const,
        decision: { patch: null, credit: false, reason: "Event already handled" },
      };
    }

    const paymentSnap = await tx.get(paymentRef);
    const current = paymentSnap.exists ? toRecord(input.paymentIntentId, paymentSnap.data() ?? {}) : null;
    const decision = input.decide(current);

    const now = Date.now();

    // The event is recorded even when the decision writes nothing, so that an
    // unknown or unmatched event is not re-processed on every retry.
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

    if (!decision.patch) {
      return { outcome: "nothing-to-do" as const, decision };
    }

    // `merge` so a payment we never created (an unmatched one held for review)
    // still produces a readable document rather than failing the write.
    tx.set(
      paymentRef,
      {
        paymentIntentId: input.paymentIntentId,
        ...stripUndefined(decision.patch),
        currency: CURRENCY,
        updatedAt: now,
        ...(paymentSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );

    if (decision.credit && input.credit) {
      await input.credit(tx, {
        paymentIntentId: input.paymentIntentId,
        uid: decision.patch.uid ?? current?.uid ?? null,
        purpose: decision.patch.purpose ?? current?.purpose ?? null,
        amountMinor: decision.patch.amountMinor ?? current?.amountMinor ?? null,
        status: decision.patch.status,
        fulfilled: decision.patch.fulfilled,
        needsReview: decision.patch.needsReview,
      });
    }

    return { outcome: "applied" as const, decision };
  });
}

function toRecord(paymentIntentId: string, data: Record<string, unknown>): PaymentRecord {
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

/** Firestore rejects `undefined`; the patch type uses optional fields. */
function stripUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
