/**
 * A test payment for the owner's own account — and only that account.
 *
 *   node scripts/test-payment.mjs                     what it holds now
 *   node scripts/test-payment.mjs grant               as if D200 was just paid
 *   node scripts/test-payment.mjs grant --extended    as if D500 was just paid
 *   node scripts/test-payment.mjs grant --lapse-in 5m start window of 5 minutes, not 7 days
 *   node scripts/test-payment.mjs clear               back to unpaid
 *
 * Writes exactly what a real Modem Pay payment writes (creditConsultation,
 * then grantClaim in functions/src): the `entitlements/{uid}` record and the
 * copy of it on the account's sign-in token. So everything after it is the
 * real thing — the start window lapses, the first conversation starts the
 * clock, the clock runs out — and can be tested end to end.
 *
 * No `payments/{id}` record is written: no money moved, and none should show
 * up as if it had. The fake payment id starts with "test-" so it can never
 * be mistaken for one from Modem Pay.
 *
 * --lapse-in shortens the 7-day window to start in, so lapsing can be tested
 * without waiting a week. It accepts 30s, 5m, 2h, 3d.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

/** The one account this script will touch. */
const OWNER = "davelabs01@gmail.com";

// Mirrors AI_TIERS and AI_ENTITLEMENT_VALID_MS in app/lib/models.ts.
const TIERS = {
  initial: { amountMinor: 200_00, durationSec: 8 * 60 },
  extended: { amountMinor: 500_00, durationSec: 20 * 60 },
};
const VALID_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE = 1.5;

const app = initializeApp({ credential: cert(KEY), projectId: PROJECT }, "test-payment");
const auth = getAuth(app);
const db = getFirestore(app);

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "status";
const tier = args.includes("--extended") ? "extended" : "initial";

function duration(text) {
  const match = /^(\d+)(s|m|h|d)$/.exec(text ?? "");
  if (!match) throw new Error(`--lapse-in takes a length like 30s, 5m, 2h or 3d, not "${text}".`);
  return Number(match[1]) * { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[match[2]];
}

function until(at, now) {
  const left = Math.round((at - now) / 1000);
  if (left <= 0) return `${new Date(at).toLocaleString()} (passed)`;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const parts = h >= 24 ? [`${Math.floor(h / 24)}d ${h % 24}h`] : [h && `${h}h`, m && `${m}m`, `${s}s`];
  return `${new Date(at).toLocaleString()} (in ${parts.filter(Boolean).join(" ")})`;
}

/** Same rule as entitlementActive in app/lib/models.ts. */
function state(e, now) {
  if (!e || e.status !== "granted") return "UNPAID";
  if (e.expiresAt <= now) return "LAPSED — never started in time; the page asks for payment again";
  if (e.endsAt != null && e.endsAt <= now) return "USED UP — the conversation's time ran out";
  return e.startedAt == null ? "PAID, not started" : "PAID, conversation running";
}

async function claims(uid, next) {
  const user = await auth.getUser(uid);
  // Other claims are kept: setCustomUserClaims replaces the whole set.
  const others = { ...user.customClaims };
  for (const key of ["aiTier", "aiExpiresAt", "aiEndsAt"]) delete others[key];
  await auth.setCustomUserClaims(uid, { ...others, ...next });
}

const user = await auth.getUserByEmail(OWNER);
const uid = user.uid;
const ref = db.collection("entitlements").doc(uid);

if (command === "grant") {
  const grantedAt = Date.now();
  const lapseAt = args.indexOf("--lapse-in");
  const expiresAt = grantedAt + (lapseAt >= 0 ? duration(args[lapseAt + 1]) : VALID_MS);
  await ref.set({
    uid,
    aiTier: tier,
    durationLimitSec: TIERS[tier].durationSec,
    status: "granted",
    paymentIntentId: `test-${grantedAt}`,
    amountMinor: TIERS[tier].amountMinor,
    grantedAt,
    expiresAt,
    startedAt: null,
    endsAt: null,
    updatedAt: grantedAt,
  });
  await claims(uid, { aiTier: tier, aiExpiresAt: expiresAt });
} else if (command === "clear") {
  await ref.delete();
  await claims(uid, {});
} else if (command !== "status") {
  console.error(`Unknown command "${command}". Use grant, clear, or nothing for the status.`);
  process.exit(1);
}

const now = Date.now();
const e = (await ref.get()).data() ?? null;
const held = (await auth.getUser(uid)).customClaims ?? {};
console.log(`${OWNER}  ${state(e, now)}`);
if (e) {
  const talkFor = TIERS[e.aiTier]?.durationSec ?? 0;
  console.log(`  consultation   ${e.aiTier} — ${talkFor / 60} minutes, D${e.amountMinor / 100}`);
  console.log(`  payment        ${e.paymentIntentId}`);
  console.log(`  start before   ${until(e.expiresAt, now)}`);
  console.log(`  started        ${e.startedAt ? new Date(e.startedAt).toLocaleString() : "not yet — the first conversation starts the clock"}`);
  console.log(
    `  ends           ${e.endsAt ? until(e.endsAt, now) : `${(talkFor * GRACE) / 60} minutes after it starts (sooner if the start window closes first)`}`,
  );
}
console.log(`  token claims   ${held.aiTier ? `${held.aiTier}${held.aiEndsAt ? ", clock running" : ""}` : "none"}`);
