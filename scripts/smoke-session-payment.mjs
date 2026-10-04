/**
 * Paying for a session, end to end, with the simulated gateway.
 *
 *   node scripts/smoke-session-payment.mjs [baseUrl]
 *
 * Needs `next dev` running with PAYMENTS_PROVIDER=simulated and
 * TALK_DEV_ALLOW_ANON_AI=1 (both are in .env.local). The simulated provider
 * settles instantly, so the whole paid-session flow can be walked with no
 * merchant account and no network — which is the point of its existing.
 *
 * What this proves, none of which is visible by reading the code:
 *
 *   - the fee is taken from the BOOKING, not from the request;
 *   - paying marks that session paid AND confirmed, in one transaction;
 *   - a second settlement of the same payment credits nothing twice;
 *   - somebody else's session cannot be paid for, or even seen.
 *
 * Writes to the live database and cleans up after itself.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const BASE = process.argv[2] || "http://localhost:3000";
const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

const PROVIDER = "sample-awa-jallow";
const PATIENT = "dev-anonymous";

const db = getFirestore(
  initializeApp({ credential: cert(KEY), projectId: PROJECT }, "smoke-session-payment"),
);

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

const slots = () => db.collection("availability").doc(PROVIDER).collection("slots");

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const startsAt = Date.now() + 5 * 24 * 60 * 60_000;
  const slotId = `smoke-pay-${startsAt}`;
  const created = [];

  await slots().doc(slotId).set({
    providerId: PROVIDER,
    startsAt,
    endsAt: startsAt + 45 * 60_000,
    status: "open",
    bookingId: null,
  });

  const booked = await post("/api/bookings/create", {
    providerId: PROVIDER,
    slotId,
    note: "Payment smoke test.",
  });
  if (booked.status !== 200) {
    check(false, `could not book a session to pay for: ${booked.json.error}`);
    await slots().doc(slotId).delete();
    process.exitCode = 1;
    return;
  }
  const bookingId = booked.json.bookingId;
  created.push(bookingId);

  const fee = (await db.collection("providerProfiles").doc(PROVIDER).get()).data()
    ?.sessionRateMinor;

  console.log("Starting the payment");
  const start = await post("/api/payments/modem/create", {
    purpose: "session_fee",
    bookingId,
    // Ignored on purpose — the price must come from the booking.
    amountMinor: 1,
  });
  check(start.status === 200, `answered 200 (got ${start.status}: ${start.json.error ?? "ok"})`);
  check(start.json.amountMinor === fee, `priced from the booking (${start.json.amountMinor} vs ${fee})`);
  check(typeof start.json.paymentLink === "string", "handed back a checkout link");

  const intentId = start.json.paymentIntentId;
  const payment = (await db.collection("payments").doc(intentId).get()).data() ?? {};
  check(payment.purpose === "session_fee", `recorded as a session fee (got ${payment.purpose})`);
  check(payment.amountMinor === fee, "with the expected amount, for the webhook to check against");
  check(payment.uid === PATIENT, `against the person who booked (got ${payment.uid})`);

  console.log("\nSettling it");
  // The return page polls this. With the simulated gateway the payment has
  // already succeeded, so this is the path that credits.
  const verified = await get(`/api/payments/modem/verify?payment_intent_id=${intentId}`);
  check(verified.status === 200, `answered 200 (got ${verified.status})`);
  check(verified.json.fulfilled === true, `fulfilled: ${verified.json.reason ?? ""}`);
  check(verified.json.needsReview === false, "nothing held for review");

  const afterPay = (await db.collection("bookings").doc(bookingId).get()).data() ?? {};
  check(afterPay.paymentStatus === "paid", `the session reads paid (got ${afterPay.paymentStatus})`);
  check(afterPay.status === "confirmed", `and confirmed (got ${afterPay.status})`);
  check(afterPay.transactionId === intentId, "and points at the payment that settled it");

  console.log("\nSettling the same payment again");
  const again = await get(`/api/payments/modem/verify?payment_intent_id=${intentId}`);
  check(again.status === 200, `still 200 (got ${again.status})`);
  check(again.json.fulfilled === true, "still reads paid, and credited nothing twice");

  console.log("\nPaying for it twice");
  const twice = await post("/api/payments/modem/create", { purpose: "session_fee", bookingId });
  check(twice.status === 404, `refused (got ${twice.status})`);
  check(
    typeof twice.json.error === "string" && twice.json.error.includes("already paid"),
    `and says why: ${twice.json.error}`,
  );

  console.log("\nPaying for somebody else's session");
  const theirs = await db.collection("bookings").add({
    patientId: "someone-else",
    providerId: PROVIDER,
    participants: ["someone-else", PROVIDER],
    slotId: "irrelevant",
    startsAt,
    endsAt: startsAt + 45 * 60_000,
    status: "pending",
    paymentStatus: "unpaid",
    amountMinor: 80000,
    currency: "GMD",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  created.push(theirs.id);
  const notYours = await post("/api/payments/modem/create", {
    purpose: "session_fee",
    bookingId: theirs.id,
  });
  check(notYours.status === 404, `refused with 404, the same answer as "no such session" (got ${notYours.status})`);
  const untouched = (await theirs.get()).data() ?? {};
  check(untouched.paymentStatus === "unpaid", "and left it unpaid");

  // ---- clean up -----------------------------------------------------------
  const events = await db.collection("paymentEvents").where("paymentIntentId", "==", intentId).get();
  await Promise.all([
    slots().doc(slotId).delete(),
    db.collection("payments").doc(intentId).delete(),
    ...events.docs.map((d) => d.ref.delete()),
    ...created.map((id) => db.collection("bookings").doc(id).delete()),
  ]);
  console.log(`\nCleaned up: 1 slot, 1 payment, ${events.size} event records, ${created.length} bookings`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
