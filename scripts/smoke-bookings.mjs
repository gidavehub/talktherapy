/**
 * Booking a session, over HTTP, against the real database.
 *
 *   cd functions && npm run build && cd .. && node scripts/smoke-bookings.mjs
 *
 * What is actually under test is the transaction in
 * app/lib/server/bookings.ts — specifically that TWO PEOPLE CANNOT TAKE THE
 * SAME HOUR. That is not provable by reading the code, and it is the failure
 * that matters: the second patient would find out when nobody joined.
 *
 * Calls the booking transaction DIRECTLY, in process, rather than over HTTP.
 * The callables that wrap it (bookSession / cancelSession) only verify a
 * caller and pass the arguments through, and reaching them needs a signed-in
 * account. The transaction is where the thinking is, and this way it can be
 * tested honestly without one.
 *
 * Run `npm run build` in functions/ first — this imports the compiled output.
 *
 * Writes to the live database and cleans up after itself: the slots it
 * creates are prefixed `smoke-`, and every booking it makes is deleted at the
 * end.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

// The transaction under test uses the functions' DEFAULT app, which takes its
// credentials from Application Default Credentials. On this machine those are
// another project's, so without this the test talks to a different Firestore
// and every assertion fails for a reason that has nothing to do with booking.
// Set BEFORE the import below, which is when that app is created.
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= KEY;
process.env.GCLOUD_PROJECT ||= PROJECT;

/** The real transaction, as deployed. */
const { bookSlot, cancelBooking } = await import("../functions/lib/functions/src/bookings.js");

/** A seeded sample provider: verified, so the transaction will accept them. */
const PROVIDER = "sample-awa-jallow";
const PATIENT = "smoke-bookings-uid";
const MINOR = "smoke-bookings-minor-uid";

const db = getFirestore(
  initializeApp({ credential: cert(KEY), projectId: PROJECT }, "smoke-bookings"),
);

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

const slots = () => db.collection("availability").doc(PROVIDER).collection("slots");

/**
 * The same shape the old HTTP test used, so the assertions below read the
 * same: an outcome and a reason. The callables map these onto HttpsError
 * codes — `aborted` for a taken time, `not-found` for somebody else's.
 */
async function book(providerId, slotId, note = "", patientId = PATIENT) {
  const result = await bookSlot({ patientId, providerId, slotId, note });
  return { status: result.ok ? 200 : 409, json: result.ok ? result : { error: result.reason } };
}

async function cancel(bookingId, uid = PATIENT) {
  const result = await cancelBooking(uid, bookingId);
  return {
    status: result.ok ? 200 : result.reason === "No such session." ? 404 : 409,
    json: result.ok ? {} : { error: result.reason },
  };
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
  const first = await book(PROVIDER, slotId, "Smoke test booking.");
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
  check(booking.patientMinor === false, "an adult's session carries no under-18 flag");

  // The fee has to come from the provider's profile. A client that could name
  // its own price would book a D3,000 session for a dalasi.
  const fee = (await db.collection("providerProfiles").doc(PROVIDER).get()).data()?.sessionRateMinor;
  check(booking.amountMinor === fee, `priced from the provider's profile (${booking.amountMinor} vs ${fee})`);

  const afterFirst = (await slots().doc(slotId).get()).data() ?? {};
  check(afterFirst.status === "booked", `the hour is marked taken (got ${afterFirst.status})`);
  check(afterFirst.bookingId === first.json.bookingId, "and points at the booking that took it");

  console.log("\nThe same hour again — the one that matters");
  const second = await book(PROVIDER, slotId);
  check(second.status === 409, `refused with 409 (got ${second.status})`);
  check(
    typeof second.json.error === "string" && second.json.error.includes("taken"),
    `and says so plainly: ${second.json.error}`,
  );
  if (second.json.bookingId) created.push(second.json.bookingId);
  check(!second.json.bookingId, "no second booking was created");

  console.log("\nAn hour that does not exist");
  const ghost = await book(PROVIDER, "nope");
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
  const past = await book(PROVIDER, pastId);
  check(past.status === 409, `refused with 409 (got ${past.status})`);
  check(
    typeof past.json.error === "string" && past.json.error.includes("passed"),
    `for the right reason: ${past.json.error}`,
  );

  console.log("\nCancelling");
  if (!first.json.bookingId) {
    // Without this, a failed first booking turned into a crash below that
    // skipped the cleanup and left smoke- slots in the live database.
    check(false, "nothing was booked, so there is nothing to cancel");
    await slots().doc(slotId).delete().catch(() => {});
    await slots().doc(pastId).delete().catch(() => {});
    process.exitCode = 1;
    return;
  }
  const cancelled = await cancel(first.json.bookingId);
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
  const notYours = await cancel(theirs.id);
  check(notYours.status === 404, `refused with 404, the same answer as "no such session" (got ${notYours.status})`);
  const stillThere = (await theirs.get()).data() ?? {};
  check(stillThere.status === "pending", "and left it alone");

  console.log("\nSomebody under 18");
  // The flag a provider trusts is the one the server stamps from the patient's
  // own record — and the session waits for a parent or guardian's form.
  const minorRef = db.collection("users").doc(MINOR);
  await minorRef.set({
    uid: MINOR,
    role: "patient",
    intake: { ageRange: "under-18", minor: true },
    consents: { guardianConsent: false },
  });
  const minorSlotId = `smoke-minor-${startsAt}`;
  await slots().doc(minorSlotId).set({
    providerId: PROVIDER,
    startsAt: startsAt + 60 * 60_000,
    endsAt: startsAt + 105 * 60_000,
    status: "open",
    bookingId: null,
  });
  const unsigned = await book(PROVIDER, minorSlotId, "", MINOR);
  if (unsigned.json.bookingId) created.push(unsigned.json.bookingId);
  check(unsigned.status === 409, `refused before a guardian has signed (got ${unsigned.status})`);
  check(
    typeof unsigned.json.error === "string" && unsigned.json.error.includes("guardian"),
    `and says why: ${unsigned.json.error}`,
  );
  const stillOpen = (await slots().doc(minorSlotId).get()).data() ?? {};
  check(stillOpen.status === "open", "the hour stays free for them");

  await minorRef.update({ "consents.guardianConsent": true });
  const signed = await book(PROVIDER, minorSlotId, "", MINOR);
  if (signed.json.bookingId) created.push(signed.json.bookingId);
  check(signed.status === 200, `booked once the form is signed (got ${signed.status}: ${signed.json.error ?? "ok"})`);
  const minorBooking = signed.json.bookingId
    ? ((await db.collection("bookings").doc(signed.json.bookingId).get()).data() ?? {})
    : {};
  check(minorBooking.patientMinor === true, "the session tells the provider they are under 18");

  // ---- clean up -----------------------------------------------------------
  await Promise.all([
    slots().doc(slotId).delete(),
    slots().doc(pastId).delete(),
    slots().doc(minorSlotId).delete(),
    minorRef.delete(),
    ...created.map((id) => db.collection("bookings").doc(id).delete()),
  ]);
  console.log(`\nCleaned up: 3 slots, 1 user, ${created.length} bookings`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
