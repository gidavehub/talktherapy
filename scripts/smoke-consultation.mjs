/**
 * Paying for a conversation with Talk, against the DEPLOYED functions.
 *
 *   node scripts/smoke-consultation.mjs
 *
 * The D200 initial consultation, end to end, minus a real wallet:
 *   1. startConsultationPayment opens a real payment at Modem Pay, priced by
 *      the SERVER — a price sent by the client is ignored.
 *   2. A paid consultation grants it: entitlements/{uid} is written, and the
 *      paid claim is set on the account, so the AI functions (which cannot
 *      read the database) can see it on the token. Since 2026-10-11 the
 *      webhook acts on a "succeeded" only when Modem Pay's own record says
 *      paid, so a made-up payment can no longer go through it — this proves
 *      that it refuses one, then grants through the SAME compiled server code
 *      the webhook runs once Modem Pay has vouched (paidAsModemPayReports).
 *   3. A second purchase while one is held is refused before any money moves.
 *   4. claimConsultation repairs a claim from the entitlement.
 *   5. The AI functions answer 402 to somebody who has not paid — when the
 *      gate is on (CONSULTATION_GATE in functions/.env) — and let a payer in.
 *
 * IT CREATES ONE REAL PAYMENT INTENT AND NEVER PAYS IT — a row in the Modem
 * Pay dashboard titled "Initial consultation", and nothing else; no money
 * moves (see scripts/check-modempay-live.mjs for the same rule). The paid
 * consultation in step 2 is a separate, made-up intent id. Everything
 * written is removed at the end,
 * including the claim on the `smoke-tests` account.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
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
      // As Modem Pay signs a callback_url delivery: keyed by SHA-256 of the merchant key.
      "x-modem-signature": createHmac("sha512", createHash("sha256").update(SECRET, "utf8").digest("hex"))
        .update(raw, "utf8")
        .digest("hex"),
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

  console.log("\nA made-up \"paid\" delivery, correctly signed, is not believed");
  const paidIntent = await seedPayment(UID, "ai_initial", 200_00);
  const forged = await deliver(paymentBody(paidIntent, UID, "ai_initial", 200));
  check(forged.status === 500, `the webhook asks for it again rather than granting (got ${forged.status})`);
  check(!(await db.collection("entitlements").doc(UID).get()).exists, "and nothing is granted");

  console.log("\nA paid consultation arrives (as the webhook applies one Modem Pay has vouched for)");
  const delivered = await paidAsModemPayReports(paidIntent, UID, "ai_initial", 200);
  check(delivered.acted === true, `acted on: ${delivered.reason}`);

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
  const upgraded = await paidAsModemPayReports(upgrade, UID, "ai_extended", 500);
  check(upgraded.acted === true, `acted on: ${upgraded.reason}`);
  const longer = (await db.collection("entitlements").doc(UID).get()).data() ?? {};
  check(longer.aiTier === "extended" && longer.paymentIntentId === upgrade, `now holds the longer one (${longer.aiTier})`);
  const upgradeDoc = (await db.collection("payments").doc(upgrade).get()).data() ?? {};
  check(upgradeDoc.fulfilled === true && upgradeDoc.needsReview === false, "and that payment is fulfilled, not held");

  console.log("\nTwo payments settling at the same instant — one granted, one held");
  const RACER = `smoke-race-${randomUUID().slice(0, 6)}`;
  racers.push(RACER);
  const [a, b] = await Promise.all([seedPayment(RACER, "ai_initial", 200_00), seedPayment(RACER, "ai_initial", 200_00)]);
  await Promise.all([paidAsModemPayReports(a, RACER, "ai_initial", 200), paidAsModemPayReports(b, RACER, "ai_initial", 200)]);
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

/** The compiled server code the webhook runs after its checks. */
const payments = await import("../functions/lib/functions/src/payments.js");
const protocol = await import("../functions/lib/app/lib/payments/modempay-protocol.js");

/**
 * What modemWebhook does with a delivery once its signature has passed and
 * Modem Pay's own record says the payment is paid — the same compiled code,
 * in the same order (functions/src/index.ts, after the PAID_STATUSES gate),
 * minus the HTTP. Keep the two in step.
 */
async function paidAsModemPayReports(intent, uid, purpose, amountMajor) {
  const raw = paymentBody(intent, uid, purpose, amountMajor);
  const event = protocol.normaliseWebhookEvent(JSON.parse(raw));
  const amountMinor = amountMajor * 100;
  const consultation = await payments.consultationToCredit({ purpose, payerUid: uid, amountMinor, paymentIntentId: intent });
  const { outcome, decision } = await payments.recordAndApply({
    eventKey: protocol.webhookEventKey(raw, event.eventId),
    paymentIntentId: intent,
    eventName: event.eventName || event.statusText || "unknown",
    signatureRouting: "smoke-vouched",
    reads: consultation ? [payments.entitlementRef(consultation.uid)] : [],
    decide: (current, [held]) =>
      protocol.decideFulfilment({
        event,
        current,
        resolvedUid: uid,
        reportedAmountMinor: amountMinor,
        expectedAmountMinor: event.expectedAmountMinor,
        resolvedPurpose: purpose,
        resolvedEmail: null,
        grantable: Boolean(consultation && (!held || payments.consultationStillGrantable(held, consultation, intent))),
      }),
    credit: consultation ? payments.creditConsultation(consultation, intent) : undefined,
  });
  if (outcome === "applied" && decision.credit && consultation) {
    // grantClaim, as the webhook does it: keep other claims, no end time yet,
    // and a claim that cannot be set (no such account) is logged, not fatal.
    try {
      const user = await getAuth().getUser(consultation.uid);
      const { aiEndsAt: _previous, ...others } = user.customClaims ?? {};
      void _previous;
      await getAuth().setCustomUserClaims(consultation.uid, { ...others, aiTier: consultation.tier, aiExpiresAt: consultation.expiresAt });
    } catch {
      // As grantClaim: the entitlement is what counts; claimConsultation repairs the claim.
    }
  }
  return { acted: outcome === "applied", reason: decision.reason };
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
