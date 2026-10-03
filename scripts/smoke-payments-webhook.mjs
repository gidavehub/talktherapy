/**
 * The payment webhook, over HTTP, against the real database.
 *
 *   node scripts/smoke-payments-webhook.mjs [baseUrl]
 *
 * Signs with MODEM_PAY_SECRET_KEY from the environment, or from .env.local —
 * whatever the running server verifies with.
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

const BASE = process.argv[2] || "http://localhost:3017";

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
const URL_PATH = "/api/payments/modem/webhook";

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
  const res = await fetch(`${BASE}${URL_PATH}`, {
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
  const raw = body();
  const first = await deliver(raw);
  check(first.status === 200, `answered 200 (got ${first.status})`);
  check(first.json.acted === true, `acted on it: ${first.json.reason ?? "(no reason)"}`);

  const after = (await db.collection("payments").doc(INTENT).get()).data() ?? {};
  check(after.status === "succeeded", `the payment reads succeeded (got ${after.status})`);
  check(after.fulfilled === true, "and fulfilled");
  check(after.needsReview === false, "with nothing held for review");
  check(after.uid === UID, "credited to the uid in the metadata");

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
  // The amount still travelled in the metadata, so this one IS checkable and
  // should be credited. The uncheckable case is covered as a unit test.
  check(orphanDoc.status === "succeeded", `recorded as paid (got ${orphanDoc.status})`);
  check(orphanDoc.amountMinor === AMOUNT_MINOR, `at the amount from the metadata (got ${orphanDoc.amountMinor})`);

  // ---- clean up -----------------------------------------------------------
  const events = await db.collection("paymentEvents").where("paymentIntentId", "in", [INTENT, orphan]).get();
  await Promise.all([
    db.collection("payments").doc(INTENT).delete(),
    db.collection("payments").doc(orphan).delete(),
    ...events.docs.map((d) => d.ref.delete()),
  ]);
  console.log(`\nCleaned up: 2 payments, ${events.size} event records`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
