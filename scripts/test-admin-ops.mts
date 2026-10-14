/**
 * Unit test for staff operations' shared rules (app/lib/adminOps.ts): page
 * cursors, date ranges, what staff are shown of a person, a session, a payout
 * or a support request — and what they never are.
 *
 *   cd functions && npm run build && cd .. && node scripts/test-admin-ops.mts
 *
 * Runs the COMPILED copy in functions/lib — the one the adminOps functions
 * actually execute. (Node's own TypeScript runner cannot follow adminOps.ts's
 * imports, which have no file extension.) The staff pages' time helpers
 * (app/components/admin/ops/format.ts) import types only, so Node runs them
 * from source.
 */

import { createRequire } from "node:module";
import * as fmt from "../app/components/admin/ops/format.ts";

const require = createRequire(import.meta.url);
const ops = require("../functions/lib/app/lib/adminOps.js") as typeof import("../app/lib/adminOps.ts");
const { platformFeeMinor } = require("../functions/lib/app/lib/money.js") as typeof import("../app/lib/money.ts");

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ------------------------------------------------------------------ cursors
console.log("\nCursors come back exactly as they went");
const asNumber = { kind: "number", value: 1_790_000_000_123, id: "pi_abc-123" } as const;
const asTime = { kind: "timestamp", seconds: 1_790_000_000, nanos: 123_456_789, id: "Xy9" } as const;
check(same(ops.decodeCursor(ops.encodeCursor(asNumber)), asNumber), "a number position");
check(same(ops.decodeCursor(ops.encodeCursor(asTime)), asTime), "a timestamp keeps its nanoseconds — never rounded to ms");
const tilde = { kind: "number", value: 5, id: "odd~id~here" } as const;
check(same(ops.decodeCursor(ops.encodeCursor(tilde)), tilde), "an id containing the separator");
check(same(ops.decodeCursor(ops.encodeCursor({ kind: "number", value: 0, id: "a" })), { kind: "number", value: 0, id: "a" }), "zero is a value, not a gap");

console.log("\nA cursor this code did not write is refused");
for (const bad of [
  "",
  "x",
  "n~~id",
  "n~abc~id",
  "n~1~",
  "n~1~a/b",
  "t~1~1000000000~id",
  "t~1.5~0~id",
  "t~1~-1~id",
  "t~1~~id",
  "z~1~id",
  `n~1~${"a".repeat(2000)}`,
]) {
  check(ops.decodeCursor(bad) === null, `refuses ${JSON.stringify(bad.length > 30 ? `${bad.slice(0, 20)}…` : bad)}`);
}
check(ops.decodeCursor(123) === null && ops.decodeCursor(null) === null && ops.decodeCursor({}) === null, "refuses anything not a string");

console.log("\nFirestore's order, kept in memory");
const p = (value: number, id: string) => ({ kind: "number", value, id }) as const;
check(ops.comparePositions(p(9e12, "a"), asTime) < 0, "every number sorts before every timestamp, as Firestore orders types");
check(ops.comparePositions(p(1, "z"), p(2, "a")) < 0, "by value first");
check(ops.comparePositions(p(1, "a"), p(1, "b")) < 0, "then by id");
check(ops.comparePositions({ ...asTime, nanos: 1 }, { ...asTime, nanos: 2 }) < 0, "timestamps to the nanosecond");

const items = [5, 4, 4, 3, 2, 1].map((v, i) => ({ v, id: `d${i}` }));
const pos = (x: { v: number; id: string }) => p(x.v, x.id);
const first = ops.pageAfter(items, pos, "desc", null, 2);
check(same(first.items.map((x) => x.id), ["d0", "d2"]), "newest first, ties broken by id descending");
const second = ops.pageAfter(items, pos, "desc", first.next, 2);
check(same(second.items.map((x) => x.id), ["d1", "d3"]), "the next page starts strictly after the cursor");
const last = ops.pageAfter(items, pos, "desc", second.next, 2);
check(same(last.items.map((x) => x.id), ["d4", "d5"]) && last.next === null, "the last page has no cursor");
check(ops.pageAfter(items, pos, "asc", null, 6).next === null, "a page that takes everything has no cursor");
check(same(ops.pageAfter(items, pos, "asc", null, 1).items.map((x) => x.id), ["d5"]), "oldest first when asked");

console.log("\nPage sizes");
check(ops.pageLimit(undefined) === ops.PAGE_LIMIT_DEFAULT, "default when none asked");
check(ops.pageLimit(0) === 1 && ops.pageLimit(-5) === 1, "never fewer than one");
check(ops.pageLimit(5000) === ops.PAGE_LIMIT_MAX, "never more than the most one call may read");
check(ops.pageLimit(10.7) === 10, "whole rows");
check(ops.pageLimit("50") === ops.PAGE_LIMIT_DEFAULT, "a string is not a number");

// ------------------------------------------------------------------- ranges
console.log("\nDate ranges");
check(same(ops.parseRange(undefined), { from: null, to: null }), "none: all time");
check(same(ops.parseRange({ from: 10, to: 20 }), { from: 10, to: 20 }), "two times");
check(same(ops.parseRange({ from: 10 }), { from: 10, to: null }), "open-ended");
check(same(ops.parseRange({ from: 10.9, to: null }), { from: 10, to: null }), "whole milliseconds");
for (const bad of [{ from: 20, to: 10 }, { from: -1 }, { from: "10" }, { to: NaN }, { to: Infinity }, [], "30d", 5]) {
  check(ops.parseRange(bad) === null, `refuses ${JSON.stringify(bad)}`);
}
check(ops.inRange(15, { from: 10, to: 20 }) && ops.inRange(10, { from: 10, to: 20 }) && ops.inRange(20, { from: 10, to: 20 }), "inclusive at both ends");
check(!ops.inRange(null, { from: 10, to: null }) && ops.inRange(null, { from: null, to: null }), "a missing time is only in all time");

const month = { from: NOW - 30 * DAY, to: NOW };
const before = ops.previousRange(month, NOW);
check(before !== null && before.to === month.from - 1, "the previous period ends just before this one starts");
check(before !== null && before.to! - before.from! === month.to - month.from, "and is the same length");
check(ops.previousRange({ from: null, to: NOW }, NOW) === null, "all time has no previous period");
const openEnd = ops.previousRange({ from: NOW - DAY, to: null }, NOW);
check(openEnd !== null && openEnd.to === NOW - DAY - 1 && openEnd.from === NOW - 2 * DAY - 1, "an open end is measured to now");

const day = ops.banjulDay(NOW);
check(day.start === Date.UTC(2026, 9, 14) && day.end === Date.UTC(2026, 9, 15) - 1, "today in Banjul is the UTC day");
check(ops.banjulDay(Date.UTC(2026, 9, 14, 23, 59, 59)).start === day.start, "one second before midnight is still today");

console.log("\nStored times, however they were written");
check(ops.toMillis(1234) === 1234, "a number");
check(ops.toMillis({ toMillis: () => 99 }) === 99, "a Firestore Timestamp");
check(ops.toMillis({ seconds: 2, nanoseconds: 5_000_000 }) === 2005, "a serialised timestamp");
check(ops.toMillis("Wed, 14 Oct 2026 12:00:00 GMT") === NOW, "an Auth date string");
check(ops.toMillis("2026-10-14T12:00:00Z") === NOW, "an ISO string");
check(ops.toMillis("not a date") === null && ops.toMillis(undefined) === null && ops.toMillis(NaN) === null, "nothing usable is null");
check(ops.latest(null, 5, undefined, 9) === 9 && ops.latest(null, undefined) === null, "the latest known time");

// ------------------------------------------------ what staff are never sent
console.log("\nA person, as staff see them: no clinical fields");
const DISCLOSURE = "I have not slept since my brother died";
const userDoc = {
  email: "fatou@example.com",
  displayName: "Fatou Jallow",
  photoURL: null,
  role: "therapist",
  verified: false,
  onboarded: true,
  locale: "fr",
  goals: ["grief"],
  consents: { dataProcessing: true },
  intake: { concerns: ["grief"], concernSummary: DISCLOSURE, minor: false },
  concernSummary: DISCLOSURE,
  phone: "+220 700 0000",
  createdAt: { toMillis: () => NOW - DAY },
  updatedAt: NOW,
};
const safe = ops.safeUser("u1", userDoc);
const safeKeys = Object.keys(safe).sort();
check(
  same(safeKeys, ["uid", ...ops.SAFE_USER_FIELDS].sort()),
  "exactly the allowed fields — an unknown field (a phone number) is not passed along",
);
check(!ops.CLINICAL_KEYS.some((k) => k in safe), "no clinical key survives");
check(!JSON.stringify(safe).includes(DISCLOSURE), "what they disclosed appears nowhere in it");
check(safe.role === "provider", "an old role name is read as provider");
check(safe.locale === "en", "a language TALK does not offer falls back to English");
check(safe.createdAt === NOW - DAY, "a Firestore timestamp becomes ms");
check(!ops.SAFE_USER_FIELDS.some((f) => (ops.CLINICAL_KEYS as readonly string[]).includes(f)), "the field mask itself names no clinical field");

const row = ops.userRow("u1", safe, {
  disabled: true,
  lastSeenAt: NOW,
  entitlement: null,
  bookingCount: 2,
  paymentCount: 1,
});
check(!JSON.stringify(row).includes(DISCLOSURE) && !("intake" in row), "the list row carries none of it either");
const authOnly = ops.userRow("u2", null, {
  authEmail: "new@example.com",
  authName: "New Person",
  authCreatedAt: NOW,
  disabled: false,
  lastSeenAt: null,
  entitlement: null,
  bookingCount: 0,
  paymentCount: 0,
});
check(authOnly.role === null && authOnly.email === "new@example.com" && authOnly.createdAt === NOW, "a sign-in with no profile shows what Auth knows, and no role");

console.log("\nA session, as staff see it: never the patient's note");
check(!(ops.BOOKING_FIELDS as readonly string[]).includes("patientNote"), "the field mask leaves the note behind");
check(!ops.BOOKING_FIELDS.some((f) => (ops.CLINICAL_KEYS as readonly string[]).includes(f)), "and every other clinical field");
const booking = ops.bookingRow(
  "bk1",
  {
    patientId: "pa",
    providerId: "pr",
    startsAt: NOW,
    endsAt: NOW + HOUR,
    status: "cancelled",
    paymentStatus: "paid",
    amountMinor: 80_000,
    patientNote: DISCLOSURE,
    cancelledBy: "pr",
    review: { decision: "refund-patient", by: "admin", at: NOW, note: "Provider confirmed." },
  },
  { patientFirstName: "Fatou", providerName: "Awa Ceesay" },
);
check(!JSON.stringify(booking).includes(DISCLOSURE) && !("patientNote" in booking), "a note handed in by mistake is still not passed on");
check(booking.cancelledBy === "provider" && booking.patient.name === "Fatou", "who cancelled, and the patient by first name");
check(booking.review?.decision === "refund-patient", "a staff decision is shown");
check(
  ops.bookingRow("b", { patientId: "pa", providerId: "pr", cancelledBy: "admin-x" }, { patientFirstName: null, providerName: null })
    .cancelledBy === "staff",
  "cancelled by somebody else: staff",
);
check(ops.firstName("  Fatou   Jallow ") === "Fatou" && ops.firstName("") === null && ops.firstName(null) === null, "first names");

console.log("\nA payout, as staff see it: the wallet masked");
const payout = ops.payoutRow(
  "po1",
  { providerId: "pr", amountMinor: 68_000, bookingIds: ["a", "b"], accountNumber: "7001234", accountHint: "••• 1234", status: "weird" },
  "Awa",
);
check(!JSON.stringify(payout).includes("7001234"), "the full wallet number is not passed on");
check(payout.sessionCount === 2 && payout.status === "pending", "sessions counted; an unknown status is not invented");

console.log("\nAudit details: plain values only");
const meta = ops.auditMetadata({
  from: "patient",
  to: "admin",
  ok: true,
  n: 3,
  nested: { secret: 1 },
  intake: "x",
  long: "y".repeat(1000),
  list: ["a", 1],
  badList: [{ a: 1 }],
});
check(same(Object.keys(meta).sort(), ["from", "list", "long", "n", "ok", "to"]), "nested values and clinical keys are dropped");
check((meta.long as string).length === 300, "long strings are cut short");
check(same(ops.auditMetadata(null), {}) && same(ops.auditMetadata([1]), {}), "nothing usable is nothing");
check(ops.auditRow("a", { actorId: "script", action: "user.set_role" }, null).actorName === "Script", "the grant-admin script is named as such");
check(ops.auditActionLabel("user.disable") === "Turned off an account", "known actions in plain words");
check(ops.auditActionLabel("content.publish_page") === "content publish page", "unknown ones shown as written");
check(
  ["site_content.publish", "site_media.delete", "provider_application.approve"].every((a) => ops.auditActionLabel(a) !== a.replace(/[._]/g, " ")),
  "what the other staff functions write is in plain words too",
);
check(ops.actionMatches("user.disable", "user") && ops.actionMatches("user.disable", "user.") && ops.actionMatches("user.disable", "user.disable"), "an action filter matches its family");
check(!ops.actionMatches("username.change", "user") && !ops.actionMatches(undefined, "user") && ops.actionMatches("x", undefined), "and nothing that merely starts the same");
check(ops.targetMatches("users/u1", "users/") && !ops.targetMatches("supportRequests/1", "users/"), "a target filter is a path prefix");
check(ops.targetMatches("users/u1", "users") && ops.targetMatches("users/u1", "users/u1"), "a collection, or one whole path");
check(!ops.targetMatches("users/u12", "users/u1") && ops.targetMatches("users/u1/x", "users/u1"), "one account's link never finds another account whose id it starts");

console.log("\nClaims and sign-ins");
check(
  same(ops.knownClaims({ admin: true, aiTier: "initial", aiExpiresAt: 5, aiEndsAt: null, role: "god", custom: 1 }), {
    admin: true,
    aiTier: "initial",
    aiExpiresAt: 5,
    aiEndsAt: null,
  }),
  "known claims only — nothing unknown is shown",
);
check(ops.knownClaims({ admin: "true" }).admin === false, "only a real true is staff");
check(ops.signInMethodLabel("google.com") === "Google" && ops.signInMethodLabel("password") === "Email and password", "sign-in methods in words");

console.log("\nPaid conversations");
const ent = { aiTier: "initial", status: "granted", amountMinor: 20_000, grantedAt: NOW - DAY, expiresAt: NOW + DAY, startedAt: null, endsAt: null };
check(ops.entitlementSummary(ent, NOW)?.active === true, "paid and not yet started: active");
check(ops.entitlementSummary({ ...ent, startedAt: NOW - HOUR, endsAt: NOW - 1 }, NOW)?.active === false, "run out: not active");
check(ops.entitlementSummary({ ...ent, expiresAt: NOW - 1 }, NOW)?.active === false, "lapsed: not active");
check(ops.entitlementSummary({ ...ent, status: "revoked" }, NOW)?.active === false, "anything but granted: not active");
check(ops.entitlementSummary({ aiTier: "platinum" }, NOW) === null && ops.entitlementSummary(undefined, NOW) === null, "nothing held is null");

// -------------------------------------------------------------------- roles
console.log("\nRoles");
check(ops.wouldLeaveNoAdmin(["a"], "a", "patient"), "demoting the only member of staff is refused");
check(!ops.wouldLeaveNoAdmin(["a", "b"], "a", "patient"), "while another remains, it is not");
check(!ops.wouldLeaveNoAdmin([], "a", "admin"), "making somebody staff never leaves nobody");
check(ops.verifiedForRole("provider", false) === false && ops.verifiedForRole("provider", true) === true, "a provider is verified only while their listing is live");
check(ops.verifiedForRole("patient", false) && ops.verifiedForRole("admin", false), "everyone else is trivially verified");
check(ops.isSettableRole("admin") && !ops.isSettableRole("org_admin") && !ops.isSettableRole("root"), "only patient, provider or staff can be given here");

console.log("\nPeople filters and search");
const base = { disabled: false, role: "patient", verified: true, onboarded: false } as const;
check(ops.userMatchesStatus(base, "active") && !ops.userMatchesStatus(base, "disabled"), "active / turned off");
check(ops.userMatchesStatus({ ...base, disabled: true }, "disabled"), "turned off");
check(ops.userMatchesStatus({ ...base, role: "provider", verified: false }, "unverified"), "a provider awaiting approval");
check(!ops.userMatchesStatus({ ...base, role: "patient", verified: false }, "unverified"), "a patient is never 'awaiting approval'");
check(ops.userMatchesStatus(base, "not_onboarded") && !ops.userMatchesStatus({ ...base, onboarded: true }, "not_onboarded"), "not yet talked to TALK");
const variants = ops.nameSearchVariants("  fatou   jallow ");
check(variants.includes("Fatou jallow") && variants.includes("Fatou Jallow") && variants.includes("fatou jallow"), "a name typed in lower case is tried capitalised");
check(ops.nameSearchVariants("   ").length === 0, "nothing typed, nothing tried");
check(ops.looksLikeUid("kD2sQ9xPz1aBcDeFgHiJkLmNoP12") && !ops.looksLikeUid("Fatou Jallow"), "an account id is told from a name");

// ----------------------------------------------------------------- sessions
console.log("\nSession tabs");
const at = (startsAt: number, extra: Record<string, unknown> = {}) => ({
  startsAt,
  endsAt: startsAt + 45 * 60_000,
  status: "confirmed",
  ...extra,
});
const sessions = [
  at(NOW + 2 * HOUR), // later today: upcoming and today
  at(NOW + 3 * DAY), // upcoming
  at(NOW - 20 * 60_000), // in progress: today, neither upcoming nor past
  at(NOW - 3 * HOUR), // earlier today, over: today and past
  at(NOW - 5 * DAY, { status: "completed" }), // past
  at(NOW - 5 * DAY, { status: "no_show", disputed: true }), // past and disputed
  at(NOW + DAY, { status: "cancelled" }), // cancelled, not over
  at(NOW - 10 * DAY, { status: "cancelled" }), // cancelled, over
  at(Date.UTC(2026, 9, 13, 23, 30), {}), // yesterday, ran past midnight: past
];
const counts = ops.countBookingViews(sessions, NOW);
check(same(counts, { upcoming: 2, today: 3, past: 4, cancelled: 2, disputed: 1 }), `counted directly: ${JSON.stringify(counts)}`);
check(!ops.bookingInView(sessions[6], "upcoming", NOW) && ops.bookingInView(sessions[6], "cancelled", NOW), "a cancelled session is in its own tab only");
check(ops.bookingInView(sessions[2], "today", NOW) && !ops.bookingInView(sessions[2], "past", NOW), "one in progress is today's, not past");

const windowStart = ops.banjulDay(NOW).start - ops.OPEN_SESSION_REACH_MS;
const derived = ops.deriveBookingCounts({
  window: sessions.filter((s) => s.startsAt >= windowStart),
  now: NOW,
  endedTotal: sessions.filter((s) => s.endsAt < NOW).length,
  cancelledTotal: sessions.filter((s) => s.status === "cancelled").length,
  disputedTotal: sessions.filter((s) => (s as { disputed?: boolean }).disputed === true).length,
});
check(same(derived, counts), "counted from Firestore's totals and the recent window: the same numbers");

const all = { from: null, to: null };
check(same(ops.bookingWindow("upcoming", all, NOW), { range: { from: NOW, to: null }, direction: "asc" }), "upcoming: from now, soonest first");
check(same(ops.bookingWindow("today", all, NOW), { range: { from: day.start, to: day.end }, direction: "asc" }), "today: the Banjul day, in order");
check(same(ops.bookingWindow("past", all, NOW), { range: { from: null, to: NOW }, direction: "desc" }), "past: to now, most recent first");
check(same(ops.bookingWindow("all", month, NOW), { range: month, direction: "desc" }), "all: the range asked for");
check(ops.bookingWindow("upcoming", { from: null, to: NOW - DAY }, NOW) === null, "upcoming within a range that ended yesterday: nothing to read");
check(same(ops.bookingWindow("today", { from: NOW, to: null }, NOW)?.range, { from: NOW, to: day.end }), "a range narrows a tab, never widens it");

// ----------------------------------------------------------------- payments
console.log("\nPayments");
const pay = ops.paymentRow(
  "pi1",
  { uid: "u1", purpose: "session_fee", amountMinor: 80_000, status: "succeeded", fulfilled: true, review: { decision: "refunded", at: NOW } },
  "Fatou",
);
check(pay.refunded && pay.payer?.name === "Fatou", "refunded is a staff decision on the payment");
check(ops.paymentRow("pi2", { status: "odd" }, null).payer === null && ops.paymentRow("pi2", { status: "odd" }, null).status === "pending", "no payer: none invented");
check(ops.paymentMatches({ needsReview: true, status: "succeeded" }, { status: "needs_review" }), "held for review");
check(ops.paymentMatches({ status: "succeeded", review: { decision: "refunded" } }, { status: "refunded" }), "refunded");
check(!ops.paymentMatches({ status: "succeeded", purpose: "ai_initial" }, { purpose: "session_fee" }), "by what it was for");
check(ops.payoutMatches({ needsReview: true }, "needs_review") && ops.payoutMatches({ status: "failed" }, "failed") && ops.payoutMatches({}, undefined), "payout filters");
check(ops.PAYMENT_PURPOSE_LABELS.ai_initial.includes("TALK"), "purposes in words, from the tiers");

const money = ops.summariseMoney(
  {
    payments: [
      { status: "succeeded", amountMinor: 80_001, purpose: "session_fee" },
      { status: "succeeded", amountMinor: 70_000, purpose: "session_fee" },
      { status: "succeeded", amountMinor: 20_000, purpose: "ai_initial" },
      { status: "pending", amountMinor: 50_000, purpose: "ai_extended" },
      { status: "failed", amountMinor: 20_000, purpose: "ai_initial" },
    ],
    refunds: [{ amountMinor: 20_000 }, { amountMinor: "x" }],
    payouts: [
      { status: "completed", amountMinor: 59_500 },
      { status: "pending", amountMinor: 68_000 },
    ],
  },
  platformFeeMinor,
);
check(money.collectedMinor === 170_001 && money.payments === 3, "collected: only payments that went through");
check(money.sessionFeesMinor === 150_001 && money.consultationsMinor === 20_000, "split by what they were for");
check(money.platformFeeMinor === platformFeeMinor(80_001) + platformFeeMinor(70_000), "the platform's share, rounded per session as a payout is");
check(money.refundedMinor === 20_000 && money.refunds === 1, "refunds with a real amount");
check(money.paidOutMinor === 59_500 && money.payouts === 1, "paid out: only payouts that arrived");

// ------------------------------------------------------------------ support
console.log("\nSupport requests");
const req = ops.supportRow("r1", {
  name: "Awa",
  email: "awa@example.com",
  topic: "billing",
  message: "Hello",
  userId: null,
  status: "new",
  createdAt: { toMillis: () => NOW },
  notes: [
    { id: "b", by: "s", body: "second", at: 2 },
    { id: "a", by: "s", body: "first", at: 1 },
    "junk",
  ],
  assigneeId: "s",
  assigneeName: "Staff",
});
check(req.topic === "general", "an unknown topic is filed as general");
check(same(req.notes.map((n) => n.id), ["a", "b"]), "notes oldest first; junk dropped");
check(req.createdAt === NOW && req.updatedAt === NOW, "the form's server time, as ms");
check(req.assignee?.uid === "s", "assigned");
check(ops.supportMatches({ status: "in_progress" }, { status: "unresolved" }) && !ops.supportMatches({ status: "resolved" }, { status: "unresolved" }), "unresolved is everything but resolved");
check(ops.supportMatches({ status: "new", topic: "safety" }, { topic: "safety", status: "new" }) && !ops.supportMatches({ topic: "general" }, { topic: "safety" }), "by topic and status");
check(ops.supportStatusAfter("new", undefined, "s") === "open", "giving a new request to somebody opens it");
check(ops.supportStatusAfter("in_progress", undefined, "s") === null && ops.supportStatusAfter("new", undefined, null) === null, "otherwise giving or taking it away leaves it where it is");
check(ops.supportStatusAfter("new", "resolved", "s") === "resolved" && ops.supportStatusAfter("open", "open", undefined) === null, "a status asked for wins; the same one is no change");

// ---------------------------------------------- the pages' Banjul-time helpers
console.log("\nThe staff pages count days and show times in Banjul time, whatever the browser's zone");
const lateEvening = Date.UTC(2026, 9, 14, 23, 30);
check(fmt.banjulDateTime(lateEvening, NOW) === "14 Oct, 23:30", "half past eleven at night is still the 14th, and shows as 23:30");
check(fmt.banjulDateTime(Date.UTC(2025, 9, 14, 9, 5), NOW) === "14 Oct 2025, 09:05", "another year says which");
check(fmt.banjulDateTime(null) === "—", "no time is a dash");
check(fmt.banjulSlot(Date.UTC(2026, 9, 14, 9, 0), Date.UTC(2026, 9, 14, 9, 50)) === "Wed 14 Oct, 09:00–09:50", "a session's slot");
check(fmt.dayStart(lateEvening) === Date.UTC(2026, 9, 14), "the day starts at UTC midnight");
check(fmt.banjulDayLabel(NOW, NOW) === "Today" && fmt.banjulDayLabel(NOW - DAY, NOW) === "Yesterday", "today and yesterday by name");
check(fmt.banjulDayLabel(Date.UTC(2026, 9, 12, 1), NOW) === "Monday 12 October", "older days by date");
check(fmt.relativeTime(NOW - 3 * HOUR, NOW) === "3 hours ago" && fmt.relativeTime(NOW + 2 * DAY, NOW) === "in 2 days", "relative times both ways");
check(fmt.relativeTime(NOW - 10_000, NOW) === "just now" && fmt.relativeTime(null, NOW) === "—", "just now, and none");
check(fmt.duration(NOW, NOW + 50 * 60_000) === "50 min" && fmt.duration(NOW, NOW + 90 * 60_000) === "1 h 30 min", "session lengths");
check(fmt.initials("fatou  jallow ceesay") === "FJ" && fmt.initials(null) === "?", "initials");
check(fmt.plural(1, "session") === "1 session" && fmt.plural(1200, "payment") === "1,200 payments", "counts in words");

const week = fmt.banjulRange({ preset: "7d" }, NOW);
check(week.from === Date.UTC(2026, 9, 8) && week.to === Date.UTC(2026, 9, 15) - 1, "7 days is today and the six before, in whole UTC days");
check(same(fmt.banjulRange({ preset: "all" }, NOW), { from: null, to: null }), "all time is open at both ends — sessions next month are in it");
check(fmt.banjulRange({ preset: "12m" }, NOW).from === Date.UTC(2025, 9, 15), "12 months starts the day after this date last year");
check(
  same(fmt.banjulRange({ preset: "30d" }, NOW), fmt.banjulRange({ preset: "30d" }, NOW + 11 * HOUR)),
  "the range does not move as the clock ticks within a day",
);
// The picker stores a custom range as local midnights; the dates typed are what count.
const custom = fmt.banjulRange(
  { preset: "custom", from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 9, 3, 23, 59, 59, 999).getTime() },
  NOW,
);
check(custom.from === Date.UTC(2026, 9, 1) && custom.to === Date.UTC(2026, 9, 4) - 1, "a custom range is the dates typed, as whole Banjul days");
check(fmt.rangeKey({ from: null, to: 5 }) === "-5", "a range has a key");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
