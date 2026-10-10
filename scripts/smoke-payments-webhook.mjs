/**
 * The payment webhook, over HTTP, against the real database.
 *
 *   node scripts/smoke-payments-webhook.mjs [webhookUrl]
 *
 * Defaults to the DEPLOYED Cloud Function. The webhook lives in Firebase
 * Functions, not in the Next app: that is where the merchant key is (Secret
 * Manager), and it is publicly reachable without deploying a website.
 *
 * Signs with MODEM_PAY_SECRET_KEY from the environment or .env.local, which
 * must be the same value the function reads from Secret Manager.
 *
 * scripts/test-modempay-webhook.mjs proves the signature, idempotency and
 * amount logic as pure functions. This proves the parts that only exist when
 * the thing is actually running: that the route reads the raw body before
 * anything parses it, that the Admin SDK can reach Firestore, that the
 * record-and-fulfil transaction commits, and that a replay is refused by the
 * ledger rather than by luck.
 *
 * It writes to the live database, so it cleans up after itself: the payment
 * and every event ledger entry it creates are deleted at the end, and the ids
 * are prefixed `pi_smoke_` so anything left behind by a crash is obvious.
 *
 * There is no sign-in here on purpose. The webhook has no session — the
 * signature IS its authentication — which is exactly why it is the one part
 * of the payment flow that can be tested honestly without an account.
 */

import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const WEBHOOK =
  process.argv[2] || "https://us-east4-talk-therapy-509209.cloudfunctions.net/modemWebhook";

/**
 * The same secret the running server verifies with.
 *
 * Read out of .env.local when it is not in the environment, because that file
 * is where `next dev` got it from — if the two disagree, every delivery is
 * rejected and the failure looks like a bug in the verifier rather than a
 * mismatched key.
 */
function signingSecret() {
  const fromEnv = (process.env.MODEM_PAY_SECRET_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("MODEM_PAY_SECRET_KEY="));
    return (line ?? "").slice("MODEM_PAY_SECRET_KEY=".length).trim();
  } catch {
    return "";
  }
}

const SECRET = signingSecret();
const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";

if (!SECRET) {
  console.error(
    "Set MODEM_PAY_SECRET_KEY to the same value the dev server is running with,\n" +
      "or the signature cannot match and every delivery is rejected.",
  );
  process.exitCode = 2;
}

const INTENT = `pi_smoke_${randomUUID().slice(0, 8)}`;
const UID = "smoke-payments-uid";
const AMOUNT_MAJOR = 200;
const AMOUNT_MINOR = 200_00;

const db = getFirestore(
  initializeApp({ credential: cert(KEY), projectId: process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209" }, "smoke"),
);

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

/** Exactly the bytes we sign — never a re-stringified object. */
const body = (extra) =>
  JSON.stringify({
    event: "charge.succeeded",
    event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    data: {
      payment_intent_id: INTENT,
      status: "paid",
      amount: AMOUNT_MAJOR,
      customer_email: "smoke@example.gm",
      metadata: { uid: UID, purpose: "ai_initial", amount_minor: String(AMOUNT_MINOR) },
    },
    ...extra,
  });

async function deliver(raw, signature) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-modem-signature": signature ?? createHmac("sha512", SECRET).update(raw, "utf8").digest("hex"),
    },
    body: raw,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if (!SECRET) return;

  // The payment as `create` would have recorded it before the redirect. Written
  // directly rather than through the create route, which needs a signed-in
  // user; what is under test here is the webhook.
  await db.collection("payments").doc(INTENT).set({
    paymentIntentId: INTENT,
    provider: "modempay",
    uid: UID,
    purpose: "ai_initial",
    amountMinor: AMOUNT_MINOR,
    currency: "GMD",
    paymentMethods: ["wallet", "card"],
    status: "pending",
    event: null,
    fulfilled: false,
    needsReview: false,
    reviewReason: null,
    customerEmail: "smoke@example.gm",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  console.log(`A signed delivery for ${INTENT}`);
  console.log(`  → ${WEBHOOK}`);
  const raw = body();
  const first = await deliver(raw);
  check(first.status === 200, `answered 200 (got ${first.status})`);
  check(first.json.acted === true, `acted on it: ${first.json.reason ?? "(no reason)"}`);

  const after = (await db.collection("payments").doc(INTENT).get()).data() ?? {};
  check(after.status === "succeeded", `the payment reads succeeded (got ${after.status})`);
  check(after.fulfilled === true, "and fulfilled");
  check(after.needsReview === false, "with nothing held for review");
  check(after.uid === UID, "credited to the uid in the metadata");

  // What the D200 actually buys. Before this was checked, an ai_initial
  // payment was marked fulfilled here while granting nothing at all.
  const granted = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  check(granted.status === "granted" && granted.aiTier === "initial", `the consultation is granted (got ${granted.status}/${granted.aiTier})`);
  check(granted.paymentIntentId === INTENT, "by this payment");
  check(granted.amountMinor === AMOUNT_MINOR && granted.durationLimitSec === 480, "at the tier's price and length, not the request's");
  const window = (granted.expiresAt ?? 0) - (granted.grantedAt ?? 0);
  check(window === 7 * 24 * 60 * 60 * 1000, `a week to start it (${Math.round(window / 86_400_000)} days)`);
  check(granted.startedAt === null && granted.endsAt === null, "and its clock not started until the conversation is");

  console.log("\nThe same delivery again");
  const replay = await deliver(raw);
  check(replay.status === 200, `still 200, so the provider stops retrying (got ${replay.status})`);
  check(replay.json.acted === false, `refused as a duplicate: ${replay.json.reason}`);

  console.log("\nA tampered signature");
  const forged = await deliver(raw, "f".repeat(128));
  check(forged.status === 400, `rejected with 400 (got ${forged.status})`);

  console.log("\nA tampered body under a valid-for-the-original signature");
  const tamperedBody = raw.replace(`"amount":${AMOUNT_MAJOR}`, '"amount":1');
  check(tamperedBody !== raw, "(the body really differs)");
  const tampered = await deliver(
    tamperedBody,
    createHmac("sha512", SECRET).update(raw, "utf8").digest("hex"),
  );
  check(tampered.status === 400, `rejected with 400 (got ${tampered.status})`);

  console.log("\nAn event we do not handle");
  // No `status` field: a status of "paid" counts as a success whatever the
  // event is called, which is deliberate tolerance for Modem Pay's shapes —
  // so leaving it in would have tested the success path again under a
  // misleading name.
  const unknownRaw = JSON.stringify({
    event: "customer.updated",
    event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    data: { payment_intent_id: INTENT, metadata: { uid: UID } },
  });
  const unknown = await deliver(unknownRaw);
  check(unknown.status === 200, `answered 200 (got ${unknown.status})`);
  check(unknown.json.acted === false, `and did nothing: ${unknown.json.reason}`);
  check(
    (unknown.json.reason ?? "").includes("Unhandled"),
    `named as unhandled rather than guessed at: ${unknown.json.reason}`,
  );

  console.log("\nA payment nobody has a record of");
  const orphan = `pi_smoke_${randomUUID().slice(0, 8)}`;
  const orphanRaw = body().replace(new RegExp(INTENT, "g"), orphan);
  const held = await deliver(orphanRaw);
  check(held.status === 200, `answered 200 (got ${held.status})`);
  const orphanDoc = (await db.collection("payments").doc(orphan).get()).data() ?? {};
  // The amount still travelled in the metadata, so this one IS checkable.
  check(orphanDoc.status === "succeeded", `recorded as paid (got ${orphanDoc.status})`);
  check(orphanDoc.amountMinor === AMOUNT_MINOR, `at the amount from the metadata (got ${orphanDoc.amountMinor})`);
  // But the same person already holds a consultation from the first payment,
  // so this one is a second purchase of the same thing: held for a refund,
  // never a second grant, never "fulfilled" with nothing delivered.
  check(orphanDoc.fulfilled === false && orphanDoc.needsReview === true, "a second purchase is held for review, not granted again");
  const still = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  check(still.paymentIntentId === INTENT, "and the consultation they have is untouched");

  console.log("\nA payment for nothing we sell");
  const mystery = `pi_smoke_${randomUUID().slice(0, 8)}`;
  const mysteryRaw = body()
    .replace(new RegExp(INTENT, "g"), mystery)
    .replace('"purpose":"ai_initial"', '"purpose":"mystery"')
    .replace(`"uid":"${UID}"`, '"uid":"smoke-payments-nothing"');
  check(mysteryRaw.includes('"purpose":"mystery"'), "(the purpose really differs)");
  const nothing = await deliver(mysteryRaw);
  check(nothing.status === 200, `answered 200 (got ${nothing.status})`);
  const mysteryDoc = (await db.collection("payments").doc(mystery).get()).data() ?? {};
  check(mysteryDoc.status === "succeeded", `recorded as paid (got ${mysteryDoc.status})`);
  check(
    mysteryDoc.fulfilled === false && mysteryDoc.needsReview === true,
    `held for a human, not marked fulfilled with nothing delivered (${mysteryDoc.reviewReason})`,
  );

  console.log("\nA transfer event — never read as a payment");
  // Its status is "completed", which the payment reader calls a success: read
  // as a payment it would have recorded money arriving for an id that is not
  // a payment at all.
  const transferId = `tr_smoke_${randomUUID().slice(0, 8)}`;
  const transfer = await deliver(
    JSON.stringify({
      event: "transfer.succeeded",
      event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
      data: { id: transferId, transfer_reference: transferId, status: "completed", amount: 1700, metadata: { payout_id: "po_smoke_none" } },
    }),
  );
  check(transfer.status === 200, `answered 200 (got ${transfer.status})`);
  check(/payout/i.test(transfer.json.reason ?? ""), `handled as a payout: ${transfer.json.reason}`);
  const asPayment = await db.collection("payments").doc(transferId).get();
  check(!asPayment.exists, "and no payment record was made for it");

  // ---- a session fee, which must confirm the booking ----------------------
  console.log("\nA session fee");
  const sessionIntent = `pi_smoke_${randomUUID().slice(0, 8)}`;
  const bookingRef = db.collection("bookings").doc();
  const startsAt = Date.now() + 6 * 24 * 60 * 60_000;

  await bookingRef.set({
    patientId: UID,
    providerId: "smoke-provider",
    participants: [UID, "smoke-provider"],
    slotId: "irrelevant",
    startsAt,
    endsAt: startsAt + 45 * 60_000,
    status: "pending",
    paymentStatus: "unpaid",
    amountMinor: AMOUNT_MINOR,
    currency: "GMD",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await db.collection("payments").doc(sessionIntent).set({
    paymentIntentId: sessionIntent,
    provider: "modempay",
    uid: UID,
    purpose: "session_fee",
    amountMinor: AMOUNT_MINOR,
    currency: "GMD",
    status: "pending",
    fulfilled: false,
    needsReview: false,
    bookingId: bookingRef.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const sessionRaw = JSON.stringify({
    event: "charge.succeeded",
    event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    data: {
      payment_intent_id: sessionIntent,
      status: "paid",
      amount: AMOUNT_MAJOR,
      metadata: {
        uid: UID,
        purpose: "session_fee",
        amount_minor: String(AMOUNT_MINOR),
        booking_id: bookingRef.id,
      },
    },
  });

  const paidSession = await deliver(sessionRaw);
  check(paidSession.status === 200, `answered 200 (got ${paidSession.status})`);
  check(paidSession.json.acted === true, `acted on it: ${paidSession.json.reason}`);

  const session = (await bookingRef.get()).data() ?? {};
  check(session.paymentStatus === "paid", `the session reads paid (got ${session.paymentStatus})`);
  check(
    session.status === "confirmed",
    `and confirmed — paying is what makes it an appointment (got ${session.status})`,
  );
  check(session.transactionId === sessionIntent, "and points at the payment that settled it");

  // ---- clean up -----------------------------------------------------------
  const events = await db
    .collection("paymentEvents")
    .where("paymentIntentId", "in", [INTENT, orphan, mystery, sessionIntent])
    .get();
  await Promise.all([
    db.collection("payments").doc(INTENT).delete(),
    db.collection("payments").doc(orphan).delete(),
    db.collection("payments").doc(mystery).delete(),
    db.collection("payments").doc(sessionIntent).delete(),
    db.collection("entitlements").doc(UID).delete(),
    bookingRef.delete(),
    ...events.docs.map((d) => d.ref.delete()),
  ]);
  console.log(`\nCleaned up: 4 payments, 1 consultation, 1 booking, ${events.size} event records`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
