/**
 * What a payment actually buys.
 *
 * `recordAndApply` in ./store.ts takes a `credit` callback and runs it inside
 * the same transaction that records the event. That is the whole design: the
 * thing paid for and the record of having handled the payment land together,
 * or neither does. Recording first and crediting after is what lost real money
 * in another of the owner's projects — the credit failed, and the provider's
 * retry saw the record and skipped it.
 *
 * ONE CONSTRAINT, and it is easy to trip over: by the time the callback runs,
 * the transaction has already written. Firestore refuses a read after a write,
 * so a credit may only WRITE. Anything that needs checking has to be checked
 * before `recordAndApply` is called — which is what `sessionToCredit` below is
 * for.
 */

import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { COLLECTIONS } from "@/lib/models";

export type CreditFn = (tx: Transaction, record: { uid: string | null }) => void;

/**
 * Check, before any transaction starts, that this payment really is for a
 * session the payer has.
 *
 * Returns null — meaning "credit nothing" — rather than throwing, because a
 * payment that cannot be matched to a session is not an error the gateway can
 * fix by retrying. It is recorded, held for review by `decideFulfilment`, and
 * a person sorts it out with the money already safely received.
 */
export async function sessionToCredit(input: {
  bookingId: string | null;
  payerUid: string | null;
  amountMinor: number | null;
}): Promise<{ bookingId: string } | null> {
  if (!input.bookingId || !input.payerUid) return null;

  const snap = await adminDb().collection(COLLECTIONS.bookings).doc(input.bookingId).get();
  if (!snap.exists) return null;

  const data = snap.data() ?? {};
  // The payer must be the patient on that booking. Not merely a participant:
  // a provider paying their own client's fee is not a thing, and if it ever
  // is, it should be built deliberately rather than fall out of a loose check.
  if (data.patientId !== input.payerUid) return null;

  // A cancelled session must not be quietly marked paid. If money arrived for
  // one, that is a refund conversation, not an activation.
  if (data.status === "cancelled") return null;

  // The amount was already checked against the expected figure by
  // `decideFulfilment`; this is the second half of the same guard, against the
  // booking rather than against the payment record.
  if (
    typeof data.amountMinor === "number" &&
    input.amountMinor !== null &&
    Math.abs(data.amountMinor - input.amountMinor) > 1
  ) {
    return null;
  }

  return { bookingId: input.bookingId };
}

/**
 * Mark the session paid, and confirm it.
 *
 * `set(..., { merge: true })` rather than `update`, deliberately: an update of
 * a document that has since been deleted throws, which would fail the whole
 * transaction and leave the gateway retrying a payment it has already taken
 * for ever. Merging writes the fields and moves on.
 *
 * `pending` becomes `confirmed` here and nowhere else — paying is what turns a
 * request for a time into an appointment both sides can rely on.
 */
export function creditSession(bookingId: string, paymentIntentId: string): CreditFn {
  return (tx) => {
    tx.set(
      adminDb().collection(COLLECTIONS.bookings).doc(bookingId),
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
