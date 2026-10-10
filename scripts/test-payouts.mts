/**
 * Unit test for paying providers: what is owed (app/lib/payouts.ts) and the
 * transfer shapes Modem Pay speaks (app/lib/payments/modempay-protocol.ts).
 *
 *   cd functions && npm run build && cd .. && node scripts/test-payouts.mts
 *
 * Runs the COMPILED copies in functions/lib — the ones the Cloud Functions
 * actually execute. (Node's own TypeScript runner cannot follow payouts.ts's
 * import of ./money, which has no file extension.)
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PAYOUT_HOLD_MS,
  earningState,
  maskWallet,
  sessionShareMinor,
  summariseEarnings,
  walletNumber,
} = require("../functions/lib/app/lib/payouts.js") as typeof import("../app/lib/payouts.ts");
const {
  buildTransferBody,
  isTransferEvent,
  normaliseTransferEvent,
  normaliseWebhookEvent,
  readTransferResponse,
} = require("../functions/lib/app/lib/payments/modempay-protocol.js") as typeof import("../app/lib/payments/modempay-protocol.ts");

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const session = (extra: Partial<Parameters<typeof earningState>[0]> = {}) => ({
  id: "bk",
  amountMinor: 800_00,
  paymentStatus: "paid",
  status: "confirmed",
  endsAt: NOW - 2 * DAY,
  payoutId: null,
  ...extra,
});

console.log("What a provider is owed");
check(sessionShareMinor({ amountMinor: 800_00 }) === 680_00, "a D800 session pays the provider D680 (85%)");
check(earningState(session(), NOW) === "available", "paid, over, past the hold: available");
check(earningState(session({ endsAt: NOW - 60_000 }), NOW) === "held", "ended a minute ago: held");
check(earningState(session({ endsAt: NOW + DAY }), NOW) === "held", "not happened yet: held");
check(earningState(session({ endsAt: NOW - PAYOUT_HOLD_MS }), NOW) === "available", "exactly at the end of the hold: available");
check(earningState(session({ paymentStatus: "unpaid" }), NOW) === "none", "never paid for: nothing owed");
check(earningState(session({ status: "cancelled" }), NOW) === "none", "cancelled: nothing owed");
check(earningState(session({ status: "no_show" }), NOW) === "none", "a no-show: nothing owed");
check(earningState(session({ payoutId: "po_1" }), NOW) === "withdrawn", "already in a payout: never twice");

const summary = summariseEarnings(
  [
    session({ id: "a" }),
    session({ id: "b", amountMinor: 1_200_00 }),
    session({ id: "c", endsAt: NOW - 60_000 }),
    session({ id: "d", payoutId: "po_1" }),
    session({ id: "e", status: "cancelled" }),
  ],
  NOW,
);
check(summary.availableMinor === 680_00 + 1_020_00, `available is the two finished sessions (${summary.availableMinor})`);
check(summary.heldMinor === 680_00 && summary.withdrawnMinor === 680_00, "held and withdrawn counted apart");
check(summary.available.map((b) => b.id).join() === "a,b", "and exactly those two are the ones a payout would claim");

console.log("\nGambian wallet numbers");
for (const [raw, want] of [
  ["7000000", "7000000"],
  ["700 0000", "7000000"],
  ["+220 700 0000", "7000000"],
  ["2207000000", "7000000"],
  ["00220 7000000", "7000000"],
  ["700000", null],
  ["70000000", null],
  ["seven", null],
] as const) {
  check(walletNumber(raw) === want, `"${raw}" → ${want}`);
}
check(maskWallet("7001234") === "••• 1234", "masked to the last four");

console.log("\nThe transfer call — sent bare, unlike a payment");
const body = buildTransferBody({
  amountMajor: 1700,
  network: "wave",
  accountNumber: "7000000",
  beneficiaryName: "Awa Jallow",
  narration: "Talk — your sessions",
  metadata: { payout_id: "po_1", provider_id: "p1" },
  callbackUrl: "https://example.test/hook",
});
check(!("data" in body), "not wrapped in { data } (the SDK sends transfers bare)");
check(body.amount === 1700 && body.currency === "GMD", "amount in Dalasi, GMD");
check(body.account_number === "7000000" && body.network === "wave", "to the wallet, on its network");

console.log("\nReading what Modem Pay says back");
check(readTransferResponse({ transfer_reference: "tr_1", status: "pending" }).reference === "tr_1", "the reference, bare");
check(readTransferResponse({ data: { id: "tr_2", status: "completed" } }).state === "completed", "wrapped in data, completed");
check(readTransferResponse({ data: { id: "tr_3", status: "failed" } }).state === "failed", "failed is failed");
check(readTransferResponse({}).state === "unknown", "nothing said: unknown, not success");

console.log("\nTransfer events are never read as payments");
const succeeded = {
  event: "transfer.succeeded",
  payload: { id: "tr_1", transfer_reference: "tr_1", status: "completed", metadata: { payout_id: "po_1" } },
};
check(isTransferEvent(succeeded), "a transfer event is recognised");
check(normaliseWebhookEvent(succeeded).outcome === "succeeded", "(read as a payment it WOULD look like a success — why it is routed first)");
const ev = normaliseTransferEvent(succeeded);
check(ev.outcome === "succeeded" && ev.payoutId === "po_1" && ev.reference === "tr_1", "read as a transfer: our payout, its reference");
check(normaliseTransferEvent({ event: "transfer.failed", data: { id: "tr_1" } }).outcome === "failed", "failed");
check(
  normaliseTransferEvent({ event: "transfer.succeeded", data: { id: "tr_1", status: "failed" } }).outcome === "failed",
  "a success event that says failed is failed — the cautious reading",
);
check(isTransferEvent({ event: "charge.succeeded", data: { payment_intent_id: "pi_1", metadata: { uid: "u" } } }) === false, "a payment is not a transfer");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
