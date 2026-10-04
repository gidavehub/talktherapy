/**
 * Booking a session, over HTTP, against the real database.
 *
 *   node scripts/smoke-bookings.mjs [baseUrl]
 *
 * What is actually under test is the transaction in
 * app/lib/server/bookings.ts — specifically that TWO PEOPLE CANNOT TAKE THE
 * SAME HOUR. That is not provable by reading the code, and it is the failure
 * that matters: the second patient would find out when nobody joined.
 *
 * Needs `next dev` running with TALK_DEV_ALLOW_ANON_AI=1 (it is in
 * .env.local), which makes an unauthenticated request arrive as the uid
 * `dev-anonymous`. That bypass is development-only — NODE_ENV is "production"
 * in every build — so this cannot be pointed at a deployment.
 *
 * Writes to the live database and cleans up after itself: the slots it
 * creates are prefixed `smoke-`, and every booking it makes is deleted at the
 * end.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const BASE = process.argv[2] || "http://localhost:3000";
const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

/** A seeded sample provider: verified, so the transaction will accept them. */
const PROVIDER = "sample-awa-jallow";
const PATIENT = "dev-anonymous";

const db = getFirestore(
  initializeApp({ credential: cert(KEY), projectId: PROJECT }, "smoke-bookings"),
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

async function main() {
  const startsAt = Date.now() + 3 * 24 * 60 * 60_000;
  const slotId = `smoke-${startsAt}`;

  await slots().doc(slotId).set({
    providerId: PROVIDER,
    startsAt,
    endsAt: startsAt + 45 * 60_000,
    status: "open",
    bookingId: null,
  });

  const created = [];

  console.log("Taking a free hour");
  const first = await post("/api/bookings/create", {
    providerId: PROVIDER,
    slotId,
    note: "Smoke test booking.",
  });
  check(first.status === 200, `answered 200 (got ${first.status}: ${first.json.error ?? "ok"})`);
  if (first.json.bookingId) created.push(first.json.bookingId);

  const bookingSnap = first.json.bookingId
    ? await db.collection("bookings").doc(first.json.bookingId).get()
    : null;
  const booking = bookingSnap?.data() ?? {};
  check(booking.patientId === PATIENT, "recorded against the person who booked it");
  check(
    Array.isArray(booking.participants) && booking.participants.length === 2,
    "carries both uids, so one query serves either side",
  );
  check(booking.status === "pending" && booking.paymentStatus === "unpaid", "pending and unpaid");
  check(booking.startsAt === startsAt, "at the time the SLOT said, not a time the client sent");

  // The fee has to come from the provider's profile. A client that could name
  // its own price would book a D3,000 session for a dalasi.
  const fee = (await db.collection("providerProfiles").doc(PROVIDER).get()).data()?.sessionRateMinor;
  check(booking.amountMinor === fee, `priced from the provider's profile (${booking.amountMinor} vs ${fee})`);

  const afterFirst = (await slots().doc(slotId).get()).data() ?? {};
  check(afterFirst.status === "booked", `the hour is marked taken (got ${afterFirst.status})`);
  check(afterFirst.bookingId === first.json.bookingId, "and points at the booking that took it");

  console.log("\nThe same hour again — the one that matters");
  const second = await post("/api/bookings/create", { providerId: PROVIDER, slotId, note: "" });
  check(second.status === 409, `refused with 409 (got ${second.status})`);
  check(
    typeof second.json.error === "string" && second.json.error.includes("taken"),
    `and says so plainly: ${second.json.error}`,
  );
  if (second.json.bookingId) created.push(second.json.bookingId);
  check(!second.json.bookingId, "no second booking was created");

  console.log("\nAn hour that does not exist");
  const ghost = await post("/api/bookings/create", { providerId: PROVIDER, slotId: "nope", note: "" });
  check(ghost.status === 409, `refused with 409 (got ${ghost.status})`);

  console.log("\nAn hour in the past");
  const pastId = `smoke-past-${Date.now()}`;
  await slots().doc(pastId).set({
    providerId: PROVIDER,
    startsAt: Date.now() - 60 * 60_000,
    endsAt: Date.now() - 15 * 60_000,
    status: "open",
    bookingId: null,
  });
  const past = await post("/api/bookings/create", { providerId: PROVIDER, slotId: pastId, note: "" });
  check(past.status === 409, `refused with 409 (got ${past.status})`);
  check(
    typeof past.json.error === "string" && past.json.error.includes("passed"),
    `for the right reason: ${past.json.error}`,
  );

  console.log("\nCancelling");
  const cancelled = await post("/api/bookings/cancel", { bookingId: first.json.bookingId });
  check(cancelled.status === 200, `answered 200 (got ${cancelled.status})`);

  const afterCancel = (await slots().doc(slotId).get()).data() ?? {};
  check(afterCancel.status === "open", `the hour goes back on the calendar (got ${afterCancel.status})`);
  check(afterCancel.bookingId === null, "and no longer points at a booking");

  const cancelledBooking = (await db.collection("bookings").doc(first.json.bookingId).get()).data() ?? {};
  check(cancelledBooking.status === "cancelled", "the session reads cancelled");

  console.log("\nCancelling somebody else's session");
  const theirs = await db.collection("bookings").add({
    patientId: "someone-else",
    providerId: PROVIDER,
    participants: ["someone-else", PROVIDER],
    slotId: "irrelevant",
    startsAt,
    endsAt: startsAt + 45 * 60_000,
    status: "pending",
    paymentStatus: "unpaid",
    amountMinor: 0,
    currency: "GMD",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  created.push(theirs.id);
  const notYours = await post("/api/bookings/cancel", { bookingId: theirs.id });
  check(notYours.status === 404, `refused with 404, the same answer as "no such session" (got ${notYours.status})`);
  const stillThere = (await theirs.get()).data() ?? {};
  check(stillThere.status === "pending", "and left it alone");

  // ---- clean up -----------------------------------------------------------
  await Promise.all([
    slots().doc(slotId).delete(),
    slots().doc(pastId).delete(),
    ...created.map((id) => db.collection("bookings").doc(id).delete()),
  ]);
  console.log(`\nCleaned up: 2 slots, ${created.length} bookings`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
