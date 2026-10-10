/**
 * Paying providers, against the real database — with a FAKE transfer.
 *
 *   cd functions && npm run build && cd .. && node scripts/smoke-payouts.mjs
 *
 * No money moves: the transfer call is passed in to functions/src/payouts.ts,
 * and here it is a stand-in that answers as Modem Pay would (accepted,
 * refused, no answer). Everything else is the real thing — the transactions,
 * the reservations, the releases — run against live Firestore and cleaned up.
 *
 * What it proves:
 *   - only paid, finished, past-the-hold sessions are paid, at 85%;
 *   - a session is paid once, even with two withdrawals racing;
 *   - a refusal puts the sessions back; an unclear answer does NOT, and
 *     asking again reuses the same idempotency key, so it can never pay twice;
 *   - a "succeeded" arriving after a payout was released takes its sessions
 *     back, and flags it for a person if one was paid again meanwhile.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= KEY;
process.env.GCLOUD_PROJECT ||= PROJECT;

const payouts = await import("../functions/lib/functions/src/payouts.js");

const db = getFirestore(initializeApp({ credential: cert(KEY), projectId: PROJECT }, "smoke-payouts"));
const PROVIDER = "smoke-payouts-provider";
const PATIENT = "smoke-payouts-patient";
const DAY = 24 * 60 * 60 * 1000;
const CALLBACK = "https://example.test/hook";

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};
const created = { bookings: [], payouts: new Set() };

/** A fake transfer that records what it was asked, and answers as told. */
function fakeTransfer(answer) {
  const calls = [];
  const fn = async (body, key) => {
    calls.push({ body, key });
    return typeof answer === "function" ? answer(body, key) : answer;
  };
  fn.calls = calls;
  return fn;
}

async function session(id, extra) {
  const ref = db.collection("bookings").doc(`smoke-po-${id}-${Date.now()}`);
  created.bookings.push(ref.id);
  await ref.set({
    patientId: PATIENT,
    providerId: PROVIDER,
    participants: [PATIENT, PROVIDER],
    slotId: "irrelevant",
    startsAt: Date.now() - 2 * DAY - 45 * 60_000,
    endsAt: Date.now() - 2 * DAY,
    status: "confirmed",
    paymentStatus: "paid",
    amountMinor: 800_00,
    currency: "GMD",
    payoutId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  });
  return ref.id;
}
const booking = async (id) => (await db.collection("bookings").doc(id).get()).data() ?? {};
const payout = async (id) => (await db.collection("payouts").doc(id).get()).data() ?? {};

async function main() {
  await db.collection("users").doc(PROVIDER).set({ uid: PROVIDER, role: "provider" });
  await db.collection("users").doc(PATIENT).set({ uid: PATIENT, role: "patient" });

  console.log("Where to be paid");
  const none = await payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "accepted", reference: "x", state: "pending" }), { callbackUrl: CALLBACK });
  check(!none.ok && /where to send/i.test(none.reason), `no account yet: ${none.reason}`);
  const patient = await payouts.savePayoutAccount(PATIENT, { network: "wave", accountNumber: "7000000", beneficiaryName: "Fatou" });
  check(!patient.ok, `a patient is not paid out: ${patient.reason}`);
  const bad = await payouts.savePayoutAccount(PROVIDER, { network: "wave", accountNumber: "12345", beneficiaryName: "Awa Jallow" });
  check(!bad.ok, `a number that is not a wallet: ${bad.reason}`);
  const badNet = await payouts.savePayoutAccount(PROVIDER, { network: "paypal", accountNumber: "7000000", beneficiaryName: "Awa Jallow" });
  check(!badNet.ok, `a network Modem Pay does not pay to: ${badNet.reason}`);
  const saved = await payouts.savePayoutAccount(PROVIDER, { network: "Wave", accountNumber: "+220 700 1234", beneficiaryName: "  Awa   Jallow " });
  check(saved.ok && saved.account.accountHint === "••• 1234", `saved, shown masked (${saved.ok && saved.account.accountHint})`);
  const stored = (await db.collection("payoutAccounts").doc(PROVIDER).get()).data() ?? {};
  check(stored.accountNumber === "7001234" && stored.network === "wave" && stored.beneficiaryName === "Awa Jallow", "stored as Modem Pay takes it");
  const changes = await db.collection("payoutAccounts").doc(PROVIDER).collection("changes").get();
  check(changes.size >= 1, "and the change is kept");

  console.log("\nWithdrawing — only what is earned, at 85%");
  const a = await session("a", {});
  const b = await session("b", { amountMinor: 1_200_00 });
  const held = await session("held", { endsAt: Date.now() - 60_000 });
  const cancelled = await session("cancelled", { status: "cancelled" });
  const unpaid = await session("unpaid", { paymentStatus: "unpaid" });

  const accept = fakeTransfer({ kind: "accepted", reference: "tr_smoke_1", state: "pending" });
  const first = await payouts.requestPayout(PROVIDER, accept, { callbackUrl: CALLBACK });
  check(first.ok && first.amountMinor === 680_00 + 1_020_00, `D800 + D1,200 sessions pay D1,700 (got ${first.amountMinor})`);
  if (first.ok) created.payouts.add(first.payoutId);
  check(first.ok && first.status === "pending", `pending at the gateway (${first.status})`);
  const call = accept.calls[0];
  check(call && call.key === first.payoutId, "the idempotency key IS the payout's id");
  check(call && call.body.amount === 1700 && !("data" in call.body), "sent bare, in Dalasi");
  check(call && call.body.account_number === "7001234" && call.body.metadata.payout_id === first.payoutId, "to the wallet, carrying our payout id");
  check((await booking(a)).payoutId === first.payoutId && (await booking(b)).payoutId === first.payoutId, "both sessions now belong to this payout");
  check(!(await booking(held)).payoutId && !(await booking(cancelled)).payoutId && !(await booking(unpaid)).payoutId, "held, cancelled and unpaid sessions untouched");
  const again = await payouts.requestPayout(PROVIDER, accept, { callbackUrl: CALLBACK });
  check(!again.ok && /nothing to withdraw/i.test(again.reason), `asking again pays nothing twice: ${again.ok ? "PAID" : again.reason}`);

  console.log("\nThe gateway says it failed — the sessions come back");
  await payouts.applyTransferEvent({ eventName: "transfer.failed", reference: "tr_smoke_1", payoutId: first.payoutId, outcome: "failed" });
  check((await payout(first.payoutId)).status === "failed", "the payout reads failed");
  check(!(await booking(a)).payoutId && !(await booking(b)).payoutId, "and its sessions are back in the balance");

  console.log("\nRefused outright — nothing sent, sessions back");
  const refused = await payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "refused", message: "gateway 400" }), { callbackUrl: CALLBACK });
  if (refused.ok) created.payouts.add(refused.payoutId);
  check(refused.ok && refused.status === "failed", `recorded as failed (${refused.ok && refused.status})`);
  check(!(await booking(a)).payoutId, "and the sessions are free again");

  console.log("\nNo clear answer — the sessions are NOT released");
  const silent = await payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "unknown", message: "no answer: timeout" }), { callbackUrl: CALLBACK });
  if (silent.ok) created.payouts.add(silent.payoutId);
  check(silent.ok && silent.status === "uncertain", `uncertain (${silent.ok && silent.status})`);
  check((await booking(a)).payoutId === silent.payoutId, "the sessions stay with it — the money may have gone");
  const blocked = await payouts.requestPayout(PROVIDER, accept, { callbackUrl: CALLBACK });
  check(!blocked.ok, "so they cannot be withdrawn again meanwhile");
  const retry = fakeTransfer({ kind: "accepted", reference: "tr_smoke_2", state: "completed" });
  const checked = silent.ok ? await payouts.checkPayout(PROVIDER, silent.payoutId, retry, async () => null, CALLBACK) : null;
  check(retry.calls[0]?.key === (silent.ok && silent.payoutId), "asking again uses the SAME key — it cannot pay twice");
  check(checked?.ok && checked.status === "completed", `and it settles: ${checked?.ok && checked.status}`);
  const stranger = silent.ok ? await payouts.checkPayout("someone-else", silent.payoutId, retry, async () => null, CALLBACK) : null;
  check(stranger && !stranger.ok, "nobody else can ask about it");

  console.log("\nTwo withdrawals racing — one session, paid once");
  const c = await session("c", {});
  const d = await session("d", {});
  const racers = await Promise.all([
    payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "accepted", reference: "tr_r1", state: "pending" }), { callbackUrl: CALLBACK }),
    payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "accepted", reference: "tr_r2", state: "pending" }), { callbackUrl: CALLBACK }),
  ]);
  racers.filter((r) => r.ok).forEach((r) => created.payouts.add(r.payoutId));
  const paidOut = racers.filter((r) => r.ok).reduce((n, r) => n + r.amountMinor, 0);
  check(paidOut === 2 * 680_00, `exactly the two new sessions were paid out, once (${paidOut})`);
  const owners = new Set([(await booking(c)).payoutId, (await booking(d)).payoutId]);
  check(owners.size === 1 && !owners.has(null), "both belong to a single payout");

  console.log("\nSucceeded after being released — taken back, flagged if paid again");
  const winner = racers.find((r) => r.ok);
  if (winner) {
    await payouts.applyTransferEvent({ eventName: "transfer.failed", reference: null, payoutId: winner.payoutId, outcome: "failed" });
    const rebook = await payouts.requestPayout(PROVIDER, fakeTransfer({ kind: "accepted", reference: "tr_r3", state: "pending" }), { callbackUrl: CALLBACK });
    if (rebook.ok) created.payouts.add(rebook.payoutId);
    await payouts.applyTransferEvent({ eventName: "transfer.succeeded", reference: null, payoutId: winner.payoutId, outcome: "succeeded" });
    const late = await payout(winner.payoutId);
    check(late.status === "completed", "the late success is recorded");
    check(late.needsReview === true, "and flagged: those sessions were paid again meanwhile");
  }
}

try {
  await main();
} finally {
  const extra = await db.collection("payouts").where("providerId", "==", PROVIDER).get();
  extra.docs.forEach((d) => created.payouts.add(d.id));
  const changes = await db.collection("payoutAccounts").doc(PROVIDER).collection("changes").get();
  await Promise.all([
    ...created.bookings.map((id) => db.collection("bookings").doc(id).delete()),
    ...[...created.payouts].map((id) => db.collection("payouts").doc(id).delete()),
    ...changes.docs.map((d) => d.ref.delete()),
    db.collection("payoutAccounts").doc(PROVIDER).delete(),
    db.collection("users").doc(PROVIDER).delete(),
    db.collection("users").doc(PATIENT).delete(),
  ]);
  console.log(`\nCleaned up: ${created.bookings.length} sessions, ${created.payouts.size} payouts, the account and two users`);
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}
