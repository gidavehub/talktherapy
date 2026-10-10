/**
 * Staff decisions on what is held for review, against the real database.
 *
 *   cd functions && npm run build && cd .. && node scripts/smoke-review.mjs
 *
 * Runs functions/src/review.ts directly (the resolveReview callable only adds
 * the staff check and the account claim). Everything it writes is removed.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= KEY;
process.env.GCLOUD_PROJECT ||= PROJECT;

const { resolveReview } = await import("../functions/lib/functions/src/review.js");
const db = getFirestore(initializeApp({ credential: cert(KEY), projectId: PROJECT }, "smoke-review"));
const ADMIN = "smoke-review-admin";
const PAYER = "smoke-review-payer";
const stamp = Date.now();
const ids = { payments: [`pi_smoke_rev_a_${stamp}`, `pi_smoke_rev_b_${stamp}`], payout: `po_smoke_rev_${stamp}`, booking: `bk_smoke_rev_${stamp}`, booking2: `bk_smoke_rev2_${stamp}` };

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};
const get = async (c, id) => (await db.collection(c).doc(id).get()).data() ?? {};

async function main() {
  const base = { uid: PAYER, purpose: "ai_initial", amountMinor: 200_00, status: "succeeded", fulfilled: false, needsReview: true, reviewReason: "test", updatedAt: stamp };
  await db.collection("payments").doc(ids.payments[0]).set(base);
  await db.collection("payments").doc(ids.payments[1]).set(base);
  await db.collection("payouts").doc(ids.payout).set({ providerId: "p", amountMinor: 1, status: "reversed", needsReview: true, updatedAt: stamp });
  const session = { patientId: PAYER, providerId: "p", participants: [PAYER, "p"], paymentStatus: "paid", status: "confirmed", amountMinor: 800_00, disputed: true, startsAt: stamp - 3_600_000, endsAt: stamp - 1_800_000, updatedAt: stamp };
  await db.collection("bookings").doc(ids.booking).set(session);
  await db.collection("bookings").doc(ids.booking2).set(session);

  console.log("A held consultation payment, granted");
  const granted = await resolveReview(ADMIN, { kind: "payment", id: ids.payments[0], decision: "grant", note: "amount checked in Modem Pay" });
  check(granted.ok && granted.grant?.tier === "initial", "granted, as the initial consultation");
  const p0 = await get("payments", ids.payments[0]);
  check(p0.fulfilled === true && p0.needsReview === false && p0.review?.by === ADMIN, "marked delivered, with who decided");
  const ent = await get("entitlements", PAYER);
  check(ent.aiTier === "initial" && ent.paymentIntentId === ids.payments[0], "the consultation is theirs");
  const twice = await resolveReview(ADMIN, { kind: "payment", id: ids.payments[0], decision: "grant", note: "" });
  check(!twice.ok, `granting twice is refused: ${twice.ok ? "GRANTED" : twice.reason}`);

  console.log("\nA held payment, refunded");
  const refunded = await resolveReview(ADMIN, { kind: "payment", id: ids.payments[1], decision: "refunded", note: "duplicate, refunded" });
  const p1 = await get("payments", ids.payments[1]);
  check(refunded.ok && p1.needsReview === false && p1.fulfilled === false && p1.review?.decision === "refunded", "off the queue, not delivered, recorded");

  console.log("\nA flagged payout, dealt with");
  const ack = await resolveReview(ADMIN, { kind: "payout", id: ids.payout, decision: "acknowledged", note: "re-sent by hand" });
  check(ack.ok && (await get("payouts", ids.payout)).needsReview === false, "off the queue");

  console.log("\nA disputed session");
  const pay = await resolveReview(ADMIN, { kind: "session", id: ids.booking, decision: "pay-provider", note: "provider showed the call log" });
  const b1 = await get("bookings", ids.booking);
  check(pay.ok && b1.disputed === false && b1.status === "confirmed", "it happened: the fee goes back to the provider");
  const refund = await resolveReview(ADMIN, { kind: "session", id: ids.booking2, decision: "refund-patient", note: "" });
  const b2 = await get("bookings", ids.booking2);
  check(refund.ok && b2.status === "no_show" && b2.refundDue === true, "it did not: out of the provider's earnings, refund owed");
  const wrong = await resolveReview(ADMIN, { kind: "session", id: ids.booking, decision: "grant", note: "" });
  check(!wrong.ok, "a decision that does not fit is refused");
}

try {
  await main();
} finally {
  await Promise.all([
    ...ids.payments.map((id) => db.collection("payments").doc(id).delete()),
    db.collection("payouts").doc(ids.payout).delete(),
    db.collection("bookings").doc(ids.booking).delete(),
    db.collection("bookings").doc(ids.booking2).delete(),
    db.collection("entitlements").doc(PAYER).delete(),
  ]);
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}
