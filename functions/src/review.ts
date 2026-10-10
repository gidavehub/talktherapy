/**
 * What a person decides about the things held for them.
 *
 * Three kinds, each parked by the code that refused to guess:
 *  - a PAYMENT held for review (an amount that did not match, a payer nobody
 *    could identify, a second purchase, nothing to deliver);
 *  - a PAYOUT flagged (a provider possibly paid twice, a reversal, a refusal
 *    on Talk's side);
 *  - a SESSION a patient said did not happen.
 *
 * Every decision is written onto the item with who made it and when, so the
 * record shows a person decided it — not the code, and not nobody.
 */

import { db, creditConsultation, creditSession, type ConsultationGrant } from "./payments";
import { AI_ENTITLEMENT_VALID_MS, tierForPurpose } from "../../app/lib/models";

export type ReviewDecision =
  /** Payment: deliver what was paid for — the consultation, or the session. */
  | "grant"
  /** Payment: refunded in the Modem Pay dashboard; nothing to deliver. */
  | "refunded"
  /** Payout: looked at and dealt with. */
  | "acknowledged"
  /** Session: it happened, or the provider is owed regardless — release the fee. */
  | "pay-provider"
  /** Session: it did not happen — the provider is not paid; the patient is owed a refund. */
  | "refund-patient";

type Reviewed = { by: string; at: number; decision: ReviewDecision; note: string };

export async function resolveReview(
  adminUid: string,
  input: { kind: string; id: string; decision: string; note: string },
): Promise<{ ok: true; grant?: ConsultationGrant } | { ok: false; reason: string }> {
  const review: Reviewed = {
    by: adminUid,
    at: Date.now(),
    decision: input.decision as ReviewDecision,
    note: input.note.trim().slice(0, 500),
  };

  if (input.kind === "payment") {
    if (input.decision !== "grant" && input.decision !== "refunded") return { ok: false, reason: "Grant or refund." };
    const ref = db().collection("payments").doc(input.id);
    return db().runTransaction(async (tx) => {
      const payment = (await tx.get(ref)).data();
      if (!payment) return { ok: false as const, reason: "No such payment." };
      if (payment.fulfilled === true) return { ok: false as const, reason: "Already delivered." };
      if (input.decision === "refunded") {
        tx.update(ref, { needsReview: false, review, updatedAt: review.at });
        return { ok: true as const };
      }
      // Grant: deliver what it bought, exactly as the webhook would have.
      const uid = typeof payment.uid === "string" ? payment.uid : null;
      if (!uid) return { ok: false as const, reason: "Nobody is matched to this payment — it cannot be granted." };
      const tier = tierForPurpose(typeof payment.purpose === "string" ? payment.purpose : null);
      if (tier) {
        const grant = { uid, tier, grantedAt: review.at, expiresAt: review.at + AI_ENTITLEMENT_VALID_MS };
        creditConsultation(grant, input.id)(tx);
        tx.update(ref, { fulfilled: true, needsReview: false, review, updatedAt: review.at });
        return { ok: true as const, grant };
      }
      if (payment.purpose === "session_fee" && typeof payment.bookingId === "string") {
        creditSession(payment.bookingId, input.id)(tx);
        tx.update(ref, { fulfilled: true, needsReview: false, review, updatedAt: review.at });
        return { ok: true as const };
      }
      return { ok: false as const, reason: "This payment is not for anything Talk sells — refund it." };
    });
  }

  if (input.kind === "payout") {
    if (input.decision !== "acknowledged") return { ok: false, reason: "Acknowledge it." };
    const ref = db().collection("payouts").doc(input.id);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "No such payout." };
    await ref.update({ needsReview: false, review, updatedAt: review.at });
    return { ok: true };
  }

  if (input.kind === "session") {
    if (input.decision !== "pay-provider" && input.decision !== "refund-patient") {
      return { ok: false, reason: "Pay the provider or refund the patient." };
    }
    const ref = db().collection("bookings").doc(input.id);
    return db().runTransaction(async (tx) => {
      const booking = (await tx.get(ref)).data();
      if (!booking) return { ok: false as const, reason: "No such session." };
      if (booking.disputed !== true) return { ok: false as const, reason: "Nothing to decide on this session." };
      tx.update(
        ref,
        input.decision === "pay-provider"
          ? { disputed: false, review, updatedAt: review.at }
          : // Out of the provider's earnings for good; the refund itself is
            // made in the Modem Pay dashboard, and recorded as owed here.
            { disputed: false, status: "no_show", refundDue: true, review, updatedAt: review.at },
      );
      return { ok: true as const };
    });
  }

  return { ok: false, reason: "Unknown kind." };
}
