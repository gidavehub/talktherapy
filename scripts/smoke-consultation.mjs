/**
 * Paying for a conversation with Talk, against the DEPLOYED functions.
 *
 *   node scripts/smoke-consultation.mjs
 *
 * The D200 initial consultation, end to end, minus a real wallet:
 *   1. startConsultationPayment opens a real payment at Modem Pay, priced by
 *      the SERVER — a price sent by the client is ignored.
 *   2. A signed delivery for a paid consultation grants it: entitlements/{uid}
 *      is written, and the paid claim is set on the account, so the AI
 *      functions (which cannot read the database) can see it on the token.
 *   3. A second purchase while one is held is refused before any money moves.
 *   4. claimConsultation repairs a claim from the entitlement.
 *   5. The AI functions answer 402 to somebody who has not paid — when the
 *      gate is on (CONSULTATION_GATE in functions/.env) — and let a payer in.
 *
 * IT CREATES ONE REAL PAYMENT INTENT AND NEVER PAYS IT — a row in the Modem
 * Pay dashboard titled "Initial consultation", and nothing else; no money
 * moves (see scripts/check-modempay-live.mjs for the same rule). The paid
 * consultation in step 2 is a separate, made-up intent id, delivered and
 * signed exactly as Modem Pay would. Everything written is removed at the end,
 * including the claim on the `smoke-tests` account.
 */

import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { BASE, idTokenFor } from "./lib/functions.mjs";

const UID = "smoke-tests";
const SECRET = (() => {
  const fromEnv = (process.env.MODEM_PAY_SECRET_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("MODEM_PAY_SECRET_KEY="));
  return (line ?? "").slice("MODEM_PAY_SECRET_KEY=".length).trim();
})();
const GATE_ON = /^CONSULTATION_GATE=on\s*$/m.test(readFileSync("functions/.env", "utf8"));

const db = getFirestore();
let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

/** A callable, over HTTP, as the Firebase SDK sends it. */
async function callable(name, data, token) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, result: json.result, error: json.error };
}

async function deliver(raw) {
  const res = await fetch(`${BASE}/modemWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-modem-signature": createHmac("sha512", SECRET).update(raw, "utf8").digest("hex"),
    },
    body: raw,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Did a request get past the consultation gate? Summarize is the cheapest door. */
async function gateAnswer(token) {
  const res = await fetch(`${BASE}/companionSummarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ summary: "", turns: [] }),
  });
  return res.status;
}

const created = { payments: [], events: [] };
const racers = [];

async function main() {
  if (!SECRET) {
    console.error("MODEM_PAY_SECRET_KEY is not in the environment or .env.local.");
    process.exitCode = 2;
    return;
  }

  // A clean account to start from — a crashed earlier run may have left a claim.
  await getAuth().setCustomUserClaims(UID, null);
  await db.collection("entitlements").doc(UID).delete();
  const unpaid = await idTokenFor();

  console.log("Nothing paid yet");
  const none = await callable("claimConsultation", {}, unpaid);
  check(none.result?.ok === false, `there is no consultation to claim (got ${JSON.stringify(none.result ?? none.error)})`);
  const shut = await gateAnswer(unpaid);
  check(
    GATE_ON ? shut === 402 : shut !== 402,
    GATE_ON ? `the AI functions answer 402 (got ${shut})` : `the gate is OFF in functions/.env, so they let them in (got ${shut})`,
  );

  console.log("\nStarting the D200 payment — at Modem Pay, for real, never paid");
  const started = await callable("startConsultationPayment", { tier: "initial", amountMinor: 1, amount: 1 }, unpaid);
  const intent = started.result?.paymentIntentId;
  check(Boolean(intent), `a payment intent came back (${intent ?? JSON.stringify(started.error)})`);
  check(/^https:\/\//.test(started.result?.paymentLink ?? ""), "with a checkout link to send them to");
  check(started.result?.amountMinor === 200_00, `priced by the server at D200, not the D0.01 the client sent (got ${started.result?.amountMinor})`);
  if (intent) {
    created.payments.push(intent);
    const record = (await db.collection("payments").doc(intent).get()).data() ?? {};
    check(record.purpose === "ai_initial" && record.amountMinor === 200_00, `recorded as an initial consultation at D200 (${record.purpose}, ${record.amountMinor})`);
    check(record.uid === UID && record.bookingId === null && record.fulfilled === false, "for this account, with no booking, not yet fulfilled");
  }

  console.log("\nA paid consultation arrives (signed, as Modem Pay would)");
  const paidIntent = await seedPayment(UID, "ai_initial", 200_00);
  const delivered = await deliver(paymentBody(paidIntent, UID, "ai_initial", 200));
  check(delivered.status === 200 && delivered.json.acted === true, `the webhook acted on it: ${delivered.json.reason}`);

  const granted = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  check(granted.status === "granted" && granted.aiTier === "initial", "the consultation is granted");
  check(granted.startedAt === null, "its clock has not started — nothing has been said yet");
  const user = await getAuth().getUser(UID);
  check(user.customClaims?.aiTier === "initial", `the paid claim is on the account (${JSON.stringify(user.customClaims)})`);
  check(user.customClaims?.aiEndsAt === undefined, "with no end time until the conversation begins");

  const notStarted = await idTokenFor();
  const before = await gateAnswer(notStarted);
  check(
    GATE_ON ? before === 402 : before !== 402,
    GATE_ON ? `paid but not begun: 402 until the clock starts (got ${before})` : `gate off: let in (got ${before})`,
  );

  console.log("\nBeginning the conversation starts the clock — once");
  const begun = await callable("claimConsultation", {}, notStarted);
  check(begun.result?.ok === true, `claimConsultation begins it (got ${JSON.stringify(begun.result ?? begun.error)})`);
  const running = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  const span = (running.endsAt ?? 0) - (running.startedAt ?? 0);
  check(span === 8 * 60 * 1000 * 1.5, `8 minutes is held to a 12-minute window (${span / 60_000} min)`);
  const claims = (await getAuth().getUser(UID)).customClaims ?? {};
  check(claims.aiEndsAt === running.endsAt, "and the end is on the account");
  await new Promise((r) => setTimeout(r, 1200));
  const again = await callable("claimConsultation", {}, notStarted);
  check(again.result?.endsAt === running.endsAt, "beginning again cannot stretch it — the same end comes back");

  const paid = await idTokenFor();
  check((await getAuth().verifyIdToken(paid)).aiEndsAt === running.endsAt, "a fresh ID token carries the end");
  const open = await gateAnswer(paid);
  check(open !== 402, `the AI functions let a payer in (got ${open})`);

  console.log("\nPaying twice");
  const twice = await callable("startConsultationPayment", { tier: "initial" }, paid);
  check(
    twice.error?.status === "FAILED_PRECONDITION",
    `the same consultation again is refused before any money moves: ${twice.error?.message ?? JSON.stringify(twice.result)}`,
  );

  console.log("\nThe longer one, while holding the first — an upgrade, granted");
  const upgrade = await seedPayment(UID, "ai_extended", 500_00);
  const upgraded = await deliver(paymentBody(upgrade, UID, "ai_extended", 500));
  check(upgraded.json.acted === true, `acted on: ${upgraded.json.reason}`);
  const longer = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  check(longer.aiTier === "extended" && longer.paymentIntentId === upgrade, `now holds the longer one (${longer.aiTier})`);
  const upgradeDoc = (await db.collection("payments").doc(upgrade).get()).data() ?? {};
  check(upgradeDoc.fulfilled === true && upgradeDoc.needsReview === false, "and that payment is fulfilled, not held");

  console.log("\nTwo payments settling at the same instant — one granted, one held");
  const RACER = `smoke-race-${randomUUID().slice(0, 6)}`;
  racers.push(RACER);
  const [a, b] = await Promise.all([seedPayment(RACER, "ai_initial", 200_00), seedPayment(RACER, "ai_initial", 200_00)]);
  await Promise.all([deliver(paymentBody(a, RACER, "ai_initial", 200)), deliver(paymentBody(b, RACER, "ai_initial", 200))]);
  const [da, dbb] = await Promise.all([a, b].map(async (id) => (await db.collection("payments").doc(id).get()).data() ?? {}));
  const fulfilled = [da, dbb].filter((d) => d.fulfilled === true).length;
  const heldForReview = [da, dbb].filter((d) => d.fulfilled === false && d.needsReview === true).length;
  check(fulfilled === 1 && heldForReview === 1, `exactly one granted, the other held for a refund (${fulfilled} granted, ${heldForReview} held)`);
  const raced = (await db.collection("entitlements").doc(RACER).get()).data() ?? {};
  check([a, b].includes(raced.paymentIntentId), "the consultation belongs to the one that was granted");

  console.log("\nA tab that never learned the payment's id");
  const asked = await callable("reconcileConsultation", {}, paid);
  check(asked.result?.paid === true, `reconcileConsultation says it is paid (got ${JSON.stringify(asked.result ?? asked.error)})`);

  console.log("\nRepairing a claim that did not stick");
  await getAuth().setCustomUserClaims(UID, null);
  const repaired = await callable("claimConsultation", {}, unpaid);
  check(repaired.result?.ok === true && repaired.result?.tier === "extended", `claimConsultation puts it back (got ${JSON.stringify(repaired.result ?? repaired.error)})`);
  check((await getAuth().getUser(UID)).customClaims?.aiEndsAt !== undefined, "end time and all");
}

/** A pending consultation payment, as startConsultationPayment would have recorded it. */
async function seedPayment(uid, purpose, amountMinor) {
  const id = `pi_smoke_${randomUUID().slice(0, 8)}`;
  created.payments.push(id);
  await db.collection("payments").doc(id).set({
    paymentIntentId: id,
    provider: "modempay",
    uid,
    purpose,
    amountMinor,
    currency: "GMD",
    paymentMethods: ["wallet", "card"],
    status: "pending",
    event: null,
    fulfilled: false,
    needsReview: false,
    reviewReason: null,
    customerEmail: null,
    bookingId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

/** Exactly what Modem Pay would deliver for a successful payment. */
function paymentBody(intent, uid, purpose, amountMajor) {
  return JSON.stringify({
    event: "charge.succeeded",
    event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    data: {
      payment_intent_id: intent,
      status: "paid",
      amount: amountMajor,
      metadata: { uid, purpose, amount_minor: String(amountMajor * 100), tier: purpose.slice(3) },
    },
  });
}

try {
  await main();
} finally {
  // ---- clean up, whatever happened -----------------------------------------
  const events = created.payments.length
    ? await db.collection("paymentEvents").where("paymentIntentId", "in", created.payments).get()
    : { docs: [], size: 0 };
  await Promise.all([
    ...created.payments.map((id) => db.collection("payments").doc(id).delete()),
    ...events.docs.map((d) => d.ref.delete()),
    db.collection("entitlements").doc(UID).delete(),
    ...racers.map((uid) => db.collection("entitlements").doc(uid).delete()),
    getAuth().setCustomUserClaims(UID, null),
  ]);
  console.log(`\nCleaned up: ${created.payments.length} payments, ${events.size} event records, the consultation and the claim`);
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : process.exitCode;
}
