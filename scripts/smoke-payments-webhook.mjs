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
 *
 * SINCE 2026-10-11 a delivery saying "succeeded" is acted on only if Modem
 * Pay itself reports that payment as paid. So this can no longer make the
 * webhook grant anything with a made-up payment — and it now proves exactly
 * that: a correctly signed "succeeded" for a payment Modem Pay never took is
 * answered with a retry and credits nothing. What the webhook does with a
 * REAL paid delivery (grant, hold a second purchase, confirm a session) is
 * decided by decideFulfilment, which scripts/test-modempay-webhook.mjs
 * proves as pure functions.
 *
 * Signs the way Modem Pay signs a callback_url delivery: HMAC-SHA512, keyed
 * by SHA-256 of the merchant secret key.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
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
/** Modem Pay's callback key: SHA-256 of the merchant secret key, as hex. */
const HASHED = SECRET ? createHash("sha256").update(SECRET, "utf8").digest("hex") : "";
const signWith = (key, raw) => createHmac("sha512", key).update(raw, "utf8").digest("hex");
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
      "x-modem-signature": signature ?? signWith(HASHED, raw),
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

  console.log(`A correctly signed "succeeded" for ${INTENT}, a payment Modem Pay never took`);
  console.log(`  → ${WEBHOOK}`);
  const raw = body();
  const first = await deliver(raw);
  check(first.status === 500, `answered 500 so a real one would be retried, not 200 (got ${first.status})`);
  check(/confirm|not report/i.test(first.json.error ?? ""), `because Modem Pay does not vouch for it: ${first.json.error}`);
  const after = (await db.collection("payments").doc(INTENT).get()).data() ?? {};
  check(after.status === "pending" && after.fulfilled === false, `the payment is untouched (${after.status}, fulfilled=${after.fulfilled})`);
  const granted = await db.collection("entitlements").doc(UID).get();
  check(!granted.exists, "and nothing was granted");

  console.log("\nThe same delivery again");
  const replay = await deliver(raw);
  check(replay.status === 500, `still not acted on (got ${replay.status})`);
  check(!(await db.collection("entitlements").doc(UID).get()).exists, "still nothing granted");

  console.log("\nSigned with the raw merchant key (what this code used to expect)");
  const rawKeyed = await deliver(raw, signWith(SECRET, raw));
  check(rawKeyed.status === 500, `signature accepted, payment still not vouched for (got ${rawKeyed.status})`);

  console.log("\nSigned with the old placeholder webhook secret");
  const placeholder = await deliver(raw, signWith("not-set-yet", raw));
  check(placeholder.status === 400, `rejected with 400 (got ${placeholder.status})`);

  console.log("\nA tampered signature");
  const forged = await deliver(raw, "f".repeat(128));
  check(forged.status === 400, `rejected with 400 (got ${forged.status})`);

  console.log("\nA tampered body under a valid-for-the-original signature");
  const tamperedBody = raw.replace(`"amount":${AMOUNT_MAJOR}`, '"amount":1');
  check(tamperedBody !== raw, "(the body really differs)");
  const tampered = await deliver(tamperedBody, signWith(HASHED, raw));
  check(tampered.status === 400, `rejected with 400 (got ${tampered.status})`);

  console.log("\nAn event we do not handle");
  // No `status` field: a status of "paid" counts as a success whatever the
  // event is called, so leaving it in would test the success gate again.
  const unknownRaw = JSON.stringify({
    event: "customer.updated",
    event_id: `evt_smoke_${randomUUID().slice(0, 8)}`,
    data: { payment_intent_id: INTENT, metadata: { uid: UID } },
  });
  const unknown = await deliver(unknownRaw);
  check(unknown.status === 200, `answered 200 (got ${unknown.status})`);
  check(unknown.json.acted === false, `and did nothing: ${unknown.json.reason}`);
  check((unknown.json.reason ?? "").includes("Unhandled"), `named as unhandled rather than guessed at: ${unknown.json.reason}`);

  console.log("\nA transfer event — never read as a payment");
  // Its status is "completed", which the payment reader calls a success.
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
  check(!(await db.collection("payments").doc(transferId).get()).exists, "and no payment record was made for it");

  // ---- clean up -----------------------------------------------------------
  const events = await db.collection("paymentEvents").where("paymentIntentId", "in", [INTENT]).get();
  await Promise.all([
    db.collection("payments").doc(INTENT).delete(),
    db.collection("entitlements").doc(UID).delete(),
    ...events.docs.map((d) => d.ref.delete()),
  ]);
  console.log(`\nCleaned up: 1 payment, ${events.size} event records`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
