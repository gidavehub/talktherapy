/**
 * Unit test for the staff statistics (app/lib/adminStatsCore.ts): that small
 * groups are withheld — including the one a total minus the visible parts
 * would give back — that medians and percentiles are right, that days, weeks
 * and hours are UTC ones, that staff, sample and test records are left out,
 * that page paths become a fixed list, and that nothing personal reaches the
 * result.
 *
 *   cd functions && npm run build && cd .. && node scripts/test-admin-stats.mts
 *
 * Runs the COMPILED copy in functions/lib — the one the adminStats function
 * actually executes. (Node's own TypeScript runner cannot follow the module's
 * imports of ./models and ./matching, which have no file extension.)
 *
 * Offline: no Firebase, no network.
 */

import { createRequire } from "node:module";

type Core = typeof import("../app/lib/adminStatsCore.ts");
type StatsRows = import("../app/lib/adminStatsCore.ts").StatsRows;
type UserRow = import("../app/lib/adminStatsCore.ts").UserRow;
type TalkSessionDoc = import("../app/lib/adminStatsCore.ts").TalkSessionDoc;

const require = createRequire(import.meta.url);
const S = require("../functions/lib/app/lib/adminStatsCore.js") as Core;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const iso = (s: string) => Date.parse(s);
const K = S.K_ANONYMITY;

// --- withholding small groups -------------------------------------------------
check("k is five", K === 5 && S.SUPPRESSED_TEXT === "<5");
check("zero is shown: nobody points at nobody", same(S.cell(0), { value: 0, suppressed: false }));
for (const n of [1, 2, 3, 4]) check(`${n} is withheld`, same(S.cell(n), { value: null, suppressed: true }));
check("five is shown", same(S.cell(5), { value: 5, suppressed: false }));

const partitions: [number[], (number | null)[], string][] = [
  [[10, 3], [null, null], "one small part hides its only neighbour too"],
  [[20, 3, 0], [null, null, 0], "zeros stay, the next smallest goes"],
  [[6, 2, 2], [null, null, null], "two hidden parts that add to under five take a third"],
  [[50, 40, 3, 2], [50, 40, null, null], "two hidden parts adding to five are enough"],
  [[50, 40, 2, 1], [50, null, null, null], "hidden parts adding to three take the smallest visible one"],
  [[3], [null], "a lone small part is withheld"],
  [[0, 0], [0, 0], "all zeros are shown"],
  [[12, 9, 30], [12, 9, 30], "nothing small, nothing hidden"],
];
for (const [input, want, what] of partitions) {
  const got = S.suppressPartition(input);
  check(`partition: ${what}`, same(got, want), `got ${JSON.stringify(got)}`);
}

// Over many random splits: no visible small part, and what is hidden can
// never be worked out from the total — at least two parts and five people.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
let randomOk = true;
let randomDetail = "";
for (let trial = 0; trial < 3000 && randomOk; trial++) {
  const parts = Array.from({ length: 1 + Math.floor(rand() * 8) }, () =>
    rand() < 0.3 ? 0 : rand() < 0.5 ? 1 + Math.floor(rand() * 5) : Math.floor(rand() * 40),
  );
  const out = S.suppressPartition(parts);
  const hidden = out.flatMap((v, i) => (v === null ? [parts[i]] : []));
  const visibleSmall = out.some((v) => v !== null && v > 0 && v < K);
  const hiddenZero = out.some((v, i) => v === null && parts[i] === 0);
  const hiddenSum = hidden.reduce((a, b) => a + b, 0);
  const positives = parts.filter((v) => v > 0).length;
  // Either it is safe, or there was nothing left to hide (then the total itself is small and withheld).
  const recoverable = hidden.length > 0 && (hidden.length === 1 || hiddenSum < K) && hidden.length < positives;
  if (visibleSmall || hiddenZero || recoverable) {
    randomOk = false;
    randomDetail = `${JSON.stringify(parts)} -> ${JSON.stringify(out)}`;
  }
}
check("3,000 random splits: nothing small shown, nothing recoverable by subtraction", randomOk, randomDetail);

const multi = S.categories(
  [
    ["anxiety", "Anxiety", 12],
    ["grief", "Grief", 3],
  ],
  { partition: false },
);
check("a multi-select breakdown hides only its small parts", multi[0].value === 12 && multi[1].suppressed);
const split = S.categories(
  [
    ["a", "A", 12],
    ["b", "B", 3],
  ],
  { partition: true },
);
check("a split of a shown total hides a second part", split[0].suppressed && split[1].suppressed);

// Several known totals over the same cells: every group must hold.
const grouped = S.suppressGroups([40, 3, 20, 9], [[0, 1, 2, 3], [0, 1], [2, 3]]);
check(
  "a sub-total hides the hidden part's neighbour inside it, not just anywhere",
  grouped[0] === null && grouped[1] === null && grouped[2] === 20 && grouped[3] === 9,
  JSON.stringify(grouped),
);
const regrouped = S.suppressGroups([9, 3, 40, 30, 6], [[0, 1, 2, 3, 4], [0, 1], [2, 3, 4]]);
const safeGroup = (out: (number | null)[], values: number[], group: number[]) => {
  const hidden = group.filter((i) => out[i] === null);
  const sum = hidden.reduce((s, i) => s + values[i], 0);
  const canPick = group.some((i) => out[i] !== null && values[i] > 0);
  return hidden.length === 0 || (hidden.length > 1 && sum >= K) || !canPick;
};
check(
  "every group is safe once nothing more moves",
  [[0, 1, 2, 3, 4], [0, 1], [2, 3, 4]].every((g) => safeGroup(regrouped, [9, 3, 40, 30, 6], g)),
  JSON.stringify(regrouped),
);

check("a share of a small group is withheld", S.share(3, 20).suppressed && S.share(3, 20).rate === null);
check("a share whose remainder is small is withheld", S.share(18, 20).suppressed);
check("a share of a small total withholds the total too", S.share(0, 3).denominator === null);
check("a share of groups of five or more is given", S.share(10, 20).rate === 0.5 && !S.share(10, 20).suppressed);
check("nobody out of ten is shown as nobody", S.share(0, 10).rate === 0);

// --- percentiles ----------------------------------------------------------------
check("no values, no percentile", S.percentile([], 0.5) === null);
check("median of an even count interpolates", S.percentile([4, 1, 3, 2], 0.5) === 2.5);
check("median of an odd count is the middle", S.percentile([9, 1, 5], 0.5) === 5);
check("p90 of 1…10 is 9.1", Math.abs((S.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9) as number) - 9.1) < 1e-9);
check("one value is every percentile", S.percentile([42], 0.9) === 42);
check("the input is left in its order", (() => {
  const values = [3, 1, 2];
  S.percentile(values, 0.5);
  return same(values, [3, 1, 2]);
})());

// --- UTC days, weeks, months ----------------------------------------------------
const wed = iso("2026-10-14T23:59:59Z");
check("a day ends at UTC midnight", S.startOfUtcDay(wed) === iso("2026-10-14T00:00:00Z"));
check("a Wednesday's week starts on the Monday", S.startOfUtcWeek(wed) === iso("2026-10-12T00:00:00Z"));
check("late Sunday is still that week", S.startOfUtcWeek(iso("2026-10-18T23:30:00Z")) === iso("2026-10-12T00:00:00Z"));
check("Monday midnight starts a new week", S.startOfUtcWeek(iso("2026-10-19T00:00:00Z")) === iso("2026-10-19T00:00:00Z"));
check("a month starts on the first", S.startOfUtcMonth(wed) === iso("2026-10-01T00:00:00Z"));
check("day keys are UTC", S.dayKey(iso("2026-10-14T23:59:59Z")) === "2026-10-14" && S.dayKey(iso("2026-10-15T00:00:00Z")) === "2026-10-15");
check("month keys", S.monthKey(wed) === "2026-10");
check("day keys read back", S.parseDayKey("2026-10-14") === iso("2026-10-14T00:00:00Z") && Number.isNaN(S.parseDayKey("14/10/2026")));
check("activity markers: the day, its Monday, its month", same(S.presenceKeys(wed), { day: "2026-10-14", week: "2026-10-12", month: "2026-10" }));
check("a week's marker crosses a month", S.presenceKeys(iso("2026-11-01T10:00:00Z")).week === "2026-10-26");
check(
  "weekly buckets cover the range from its Monday",
  same(S.bucketStarts(iso("2026-10-08T00:00:00Z"), iso("2026-10-14T23:59:59Z"), "week").map(S.dayKey), ["2026-10-05", "2026-10-12"]),
);
check(
  "monthly buckets cross a year",
  same(S.bucketStarts(iso("2025-12-20T00:00:00Z"), iso("2026-02-02T00:00:00Z"), "month").map(S.dayKey), ["2025-12-01", "2026-01-01", "2026-02-01"]),
);
check("a month's bucket ends where the next begins", S.bucketBounds(iso("2026-02-01T00:00:00Z"), "month")[1] === iso("2026-03-01T00:00:00Z"));
check("Timestamps and numbers are both read", S.millisOf({ toMillis: () => 5 }) === 5 && S.millisOf(7) === 7 && S.millisOf("x") === null);

// --- ranges -----------------------------------------------------------------------
const now = iso("2026-10-14T12:05:00Z");
const r7 = S.resolveRange("7d", now);
check("7 days is today and the six before", S.dayKey(r7.from) === "2026-10-08" && S.dayKey(r7.to) === "2026-10-14" && r7.days === 7);
check("7 days is counted by day", r7.bucket === "day");
check("the previous 7 days sit just before", S.dayKey(r7.previousFrom) === "2026-10-01" && r7.previousTo === r7.from - 1);
const r12 = S.resolveRange("12m", now);
check("12 months is a year of days, by week", r12.days === 365 && r12.bucket === "week" && S.dayKey(r12.from) === "2025-10-15");
const custom = S.resolveRange({ from: iso("2026-09-01T15:00:00Z"), to: iso("2027-01-01T00:00:00Z") }, now);
check("a custom range ends no later than today", S.dayKey(custom.to) === "2026-10-14" && S.dayKey(custom.from) === "2026-09-01");
check("a custom range has its own cache key", custom.key === "custom:2026-09-01:2026-10-14" && r7.key === "7d:2026-10-14");
const refused = (input: unknown) => {
  try {
    S.resolveRange(input, now);
    return false;
  } catch (error) {
    return error instanceof RangeError;
  }
};
check("an unknown preset is refused", refused("1y") && refused(undefined) && refused({ from: "a", to: "b" }));
const september = S.resolveRange({ month: "2026-09" }, now);
check(
  "a month is the whole of it, by day",
  september.preset === "month" && S.dayKey(september.from) === "2026-09-01" && september.to === iso("2026-10-01T00:00:00Z") - 1 && september.days === 30 && september.bucket === "day",
);
check("a month's key is the month", september.key === "month:2026-09");
check("a month is compared with the month before", S.dayKey(september.previousFrom) === "2026-08-01" && september.previousTo === september.from - 1);
check("the month under way is refused: it grows a day at a time", refused({ month: "2026-10" }));
check("a month still to come is refused", refused({ month: "2027-01" }));
check("a month before TALK began is refused", refused({ month: "2024-12" }));
check("a month that is not one is refused", refused({ month: "2026-13" }) && refused({ month: "2026-9" }) && refused({ month: 202609 }));
const months = S.wellbeingMonths(now);
check("the months on offer: newest ended first, back to January 2025", months[0] === "2026-09" && months.at(-1) === "2025-01" && months.length === 21);
check("every month on offer resolves", months.every((m) => !refused({ month: m })));
check("a backwards range is refused", refused({ from: iso("2026-10-10T00:00:00Z"), to: iso("2026-10-01T00:00:00Z") }));
check("a range from before TALK began is refused", refused({ from: iso("2024-06-01T00:00:00Z"), to: iso("2026-10-01T00:00:00Z") }));
check("more than two years is refused", (() => {
  try {
    S.resolveRange({ from: iso("2025-01-01T00:00:00Z"), to: iso("2027-06-01T00:00:00Z") }, iso("2027-06-01T12:00:00Z"));
    return false;
  } catch (error) {
    return error instanceof RangeError;
  }
})());

// --- hour of the week ---------------------------------------------------------------
check("Monday just after midnight is the first cell", same(S.hourOfWeek(iso("2026-10-12T00:30:00Z")), { day: 0, hour: 0 }));
check("Sunday's last hour is the last cell", same(S.hourOfWeek(iso("2026-10-18T23:59:00Z")), { day: 6, hour: 23 }));
check("Wednesday at 14:00 UTC", same(S.hourOfWeek(iso("2026-10-14T14:10:00Z")), { day: 2, hour: 14 }));

// --- what counts ---------------------------------------------------------------------
check("smoke-test accounts are test records", S.isTestId("smoke-tests") && S.isTestId("smoke-race-1f2e") && S.isTestId("smoke-bookings-uid"));
check("smoke-test payments, payouts and bookings too", S.isTestId("pi_smoke_abc") && S.isTestId("po_smoke_rev_1") && S.isTestId("bk_smoke_rev_2"));
check("sample listings are test records", S.isTestId("sample-awa-jallow"));
check("a real id is not", !S.isTestId("Xh3kq9LmP0") && !S.isTestId("smokey") && !S.isTestId(null));
check("staff are excluded by uid", S.isExcludedUid("staff1", new Set(["staff1"])) && !S.isExcludedUid("u1", new Set(["staff1"])));
check("a record with no owner is excluded", S.isExcludedUid(null, new Set()));

// --- page paths --------------------------------------------------------------------
const paths: [unknown, string][] = [
  ["/", "home"],
  ["/?utm_source=whatsapp&name=Awa", "home"],
  ["/#top", "home"],
  ["/about", "about"],
  ["/about/", "about"],
  ["/plans", "pricing"],
  ["/providers", "providers"],
  ["/providers/Xh3kq9LmP0", "provider"],
  ["/resources", "resources"],
  ["/resources/sleep-well", "resource"],
  ["/TALK", "talk"],
  ["/talk?intake=1", "talk"],
  ["/apply/3", "apply"],
  ["/chats/u1__u2", "app"],
  ["/dashboard", "app"],
  ["/admin", "other"],
  ["/providers/a/b", "other"],
  ["/somewhere/new", "other"],
  ["https://evil.example/", "other"],
  ["about", "other"],
  [42, "other"],
  [`/${"x".repeat(600)}`, "other"],
];
for (const [input, want] of paths) {
  const got = S.normalisePath(input);
  check(`path ${JSON.stringify(input).slice(0, 40)} → ${want}`, got === want, `got ${got}`);
}
check("every page key has a label", S.PAGE_KEYS.every((p) => typeof S.PAGE_LABELS[p] === "string"));

const origins: [string | null, boolean][] = [
  ["https://www.talktherapy.gm", true],
  ["https://talktherapy.gm", true],
  ["https://talktherapy-git-feat-x-team.vercel.app", true],
  ["https://talktherapy.vercel.app", true],
  ["http://localhost:3000", true],
  ["http://127.0.0.1:3000", true],
  ["http://talktherapy.gm", false],
  ["https://talktherapy.gm.evil.example", false],
  ["https://evil.vercel.app", false],
  ["https://evil.example", false],
  [null, false],
];
for (const [origin, want] of origins) check(`origin ${origin} ${want ? "allowed" : "refused"}`, S.isAllowedOrigin(origin) === want);

const chrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
check("a phone's browser is a person", !S.isBot(chrome));
check("a crawler is not", S.isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
check("a headless browser is not", S.isBot("Mozilla/5.0 HeadlessChrome/128.0"));
check("a link preview is not", S.isBot("WhatsApp/2.23 facebookexternalhit/1.1"));
check("no user agent is not", S.isBot("") && S.isBot(null));
check("a tab id is a random token", S.VISITOR_ID.test("0b7c1e5a-3f7e-4c1a-9d1e-2b8c4a6f9e10") && !S.VISITOR_ID.test("awa@example.com"));

// --- TALK conversation reports --------------------------------------------------------
const reportId = "0b7c1e5a-3f7e-4c1a-9d1e-2b8c4a6f9e10";
check("a report without a proper id is refused", S.parseTalkReport({ id: "x", phase: "start" }) === null);
check("a report with no phase is refused", S.parseTalkReport({ id: reportId }) === null);
const parsed = S.parseTalkReport({
  id: reportId,
  phase: "end",
  kind: "intake",
  tier: "initial",
  language: "wolof",
  elapsedSec: 300.4,
  turns: 9999,
  mode: "voice",
  completed: true,
  topics: ["anxiety", "I feel alone since my husband died", "grief", "anxiety"],
  safetyFlagged: true,
  risk: "elevated",
  note: "anything else is dropped",
});
check("words are never topics: only the fixed list survives", same(parsed?.topics, ["anxiety", "grief"]));
check("a danger level is one of the two", parsed?.risk === "elevated");
check(
  "anything else is no level",
  S.parseTalkReport({ id: reportId, phase: "end", risk: "low" })?.risk === null &&
    S.parseTalkReport({ id: reportId, phase: "end", risk: "she said she wants to die" })?.risk === null,
);
check("turns are held to a sane number", parsed?.turns === 500);
check("unknown fields are dropped", parsed !== null && !("note" in parsed));
check("an unknown language is no language", S.parseTalkReport({ id: reportId, phase: "start", language: "french" })?.language === null);

const start = S.talkStartDoc(S.parseTalkReport({ id: reportId, phase: "start", kind: "intake", tier: "initial", language: "wolof", paid: true })!, iso("2026-10-14T12:05:42Z"));
check("a start is kept to the minute", start.startedAt === iso("2026-10-14T12:05:00Z") && start.endedAt === null);
check(
  "the stored conversation has no uid and no words",
  same(Object.keys(start).sort(), ["completed", "durationSec", "endedAt", "kind", "language", "matched", "mode", "paid", "risk", "safetyFlagged", "startedAt", "tier", "topics", "turns"]),
);
const endAt = iso("2026-10-14T12:15:00Z");
const ended = S.talkEndDoc(start, parsed!, endAt);
check("the length is the page's figure when the server saw that much time", ended.durationSec === 300);
const cap = S.maxTalkSec("initial");
check("the longest is the paid length with its grace", cap === 720);
const longClaim = S.talkEndDoc(start, { ...parsed!, elapsedSec: 4 * 3600 }, iso("2026-10-14T16:00:00Z"));
check("a page cannot claim more than the tier allows", longClaim.durationSec === cap);
const earlyClaim = S.talkEndDoc(start, { ...parsed!, elapsedSec: 700 }, iso("2026-10-14T12:07:00Z"));
check("nor more than the time the server has seen pass", earlyClaim.durationSec === 120);
const again = S.talkEndDoc(ended, { ...parsed!, elapsedSec: 10, turns: 1, completed: false, safetyFlagged: false, topics: [] }, endAt + 60_000);
check("a later report only adds: length, turns and flags never shrink", again.durationSec === 300 && again.turns === 500 && again.completed && again.safetyFlagged);
check("repeating the same end changes nothing but its time", same({ ...S.talkEndDoc(ended, parsed!, endAt), endedAt: 0 }, { ...ended, endedAt: 0 }));
const urgent = S.talkEndDoc(ended, { ...parsed!, risk: "urgent" }, endAt + 60_000);
const calmer = S.talkEndDoc(urgent, { ...parsed!, risk: "elevated" }, endAt + 120_000);
check("the danger level only rises", ended.risk === "elevated" && urgent.risk === "urgent" && calmer.risk === "urgent");
check("a level of danger is a flag", S.talkEndDoc(start, { ...parsed!, safetyFlagged: false, risk: "urgent" }, endAt).safetyFlagged);
check("no level stays no level", S.talkEndDoc(start, { ...parsed!, risk: null }, endAt).risk === null);
const orphan = S.talkEndDoc(null, { ...parsed!, elapsedSec: 200 }, endAt);
check("an end without a recorded start still counts, dated back", orphan.durationSec === 200 && orphan.startedAt === S.floorToMinute(endAt - 200_000));

// --- composing the figures ------------------------------------------------------------
const day = (s: string) => iso(`${s}T10:00:00Z`);
const users: UserRow[] = [];
const concernsCycle = [["anxiety", "sleep"], ["depression"], ["anxiety"], ["grief", "family"], ["anxiety", "relationships"]];
for (let i = 0; i < 23; i++) {
  users.push({
    id: `patient-${String(i).padStart(2, "0")}-uid`,
    role: "patient",
    createdAt: day(`2026-10-${String(8 + (i % 7)).padStart(2, "0")}`),
    onboarded: i < 15,
    spokenConsentAt: i < 18 ? day("2026-10-09") : null,
    intake:
      i < 15
        ? {
            language: i % 3 === 0 ? "wolof" : "english",
            ageRange: i % 2 ? "25-34" : "18-24",
            location: i < 12 ? "kanifing" : "upper-river",
            gender: i % 2 ? "woman" : "man",
            concerns: concernsCycle[i % 5],
            servicesWanted: ["therapy"],
            providerGender: "any",
            completedAt: day("2026-10-12"),
          }
        : null,
  });
}
users.push(
  { id: "staff-member-uid", role: "admin", createdAt: day("2026-10-09"), onboarded: true, spokenConsentAt: null, intake: null },
  { id: "sample-awa", role: "provider", createdAt: day("2026-10-09"), onboarded: true, spokenConsentAt: null, intake: null },
  { id: "smoke-tests", role: "patient", createdAt: day("2026-10-09"), onboarded: true, spokenConsentAt: null, intake: null },
  { id: "demo-provider-uid", role: "provider", createdAt: day("2026-10-09"), onboarded: true, spokenConsentAt: null, intake: null },
);
for (let i = 0; i < 7; i++) {
  users.push({ id: `provider-${i}-uid`, role: "provider", createdAt: day("2026-09-01"), onboarded: true, spokenConsentAt: null, intake: null });
}

const talk: TalkSessionDoc[] = Array.from({ length: 12 }, (_, i) => ({
  kind: i < 8 ? "intake" : "companion",
  tier: i < 8 ? "initial" : "extended",
  language: i % 4 === 0 ? "wolof" : "english",
  startedAt: S.floorToMinute(iso("2026-10-12T19:00:00Z") + i * 3_600_000),
  endedAt: i === 11 ? null : S.floorToMinute(iso("2026-10-12T19:00:00Z") + i * 3_600_000 + 400_000),
  durationSec: i === 11 ? null : 120 + i * 40,
  turns: 6 + i,
  mode: i === 11 ? null : i % 3 === 0 ? "typed" : "voice",
  completed: i < 9,
  matched: i < 6,
  paid: true,
  topics: i % 2 ? ["anxiety"] : ["grief", "sleep"],
  safetyFlagged: i === 3,
  risk: i === 3 ? "urgent" : null,
}));

/** Session calls: twelve real ones, a test booking's, and one a staff member was in. */
const callStart = iso("2026-10-12T09:00:00Z");
const calls = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `bk-call-${i}`,
    participants: [`patient-${String(i).padStart(2, "0")}-uid`, "provider-1-uid"],
    firstJoinedAt: callStart + i * 3_600_000,
    // 20 to 53 minutes; the last never hung up, and one ran far past its window.
    endedAt: i === 11 ? null : callStart + i * 3_600_000 + (i === 10 ? 9 * 3_600_000 : (20 + i * 3) * 60_000),
  })),
  { id: "bk_smoke_rev_9", participants: ["smoke-review-payer", "provider-1-uid"], firstJoinedAt: callStart, endedAt: callStart + 60_000 },
  { id: "bk-staff", participants: ["staff-member-uid", "provider-1-uid"], firstJoinedAt: callStart, endedAt: callStart + 60_000 },
];

const rows: StatsRows = {
  excluded: new Set(["staff-member-uid", "demo-provider-uid"]),
  users,
  payments: [
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `pay-${i}`,
      uid: `patient-${String(i).padStart(2, "0")}-uid`,
      purpose: "ai_initial",
      status: "succeeded",
      provider: "modempay",
      amountMinor: 20_000,
      bookingId: null,
      createdAt: day("2026-10-10"),
    })),
    { id: "pi_smoke_1", uid: "smoke-tests", purpose: "ai_initial", status: "succeeded", provider: "simulated", amountMinor: 20_000, bookingId: null, createdAt: day("2026-10-10") },
    { id: "pay-staff", uid: "staff-member-uid", purpose: "ai_extended", status: "succeeded", provider: "modempay", amountMinor: 50_000, bookingId: null, createdAt: day("2026-10-10") },
    { id: "pay-session", uid: "patient-01-uid", purpose: "session_fee", status: "succeeded", provider: "modempay", amountMinor: 100_000, bookingId: "bk-1", createdAt: day("2026-10-11") },
  ],
  refunds: [],
  bookings: [
    { id: "bk-1", patientId: "patient-01-uid", providerId: "provider-1-uid", status: "confirmed", paymentStatus: "paid", disputed: false, amountMinor: 100_000, createdAt: day("2026-10-11"), endsAt: day("2026-10-12") },
    { id: "bk_smoke_rev_1", patientId: "smoke-review-payer", providerId: "provider-1-uid", status: "confirmed", paymentStatus: "paid", disputed: false, amountMinor: 100_000, createdAt: day("2026-10-11"), endsAt: day("2026-10-12") },
  ],
  refundDue: [],
  entitlements: Array.from({ length: 6 }, (_, i) => ({
    uid: `patient-${String(i).padStart(2, "0")}-uid`,
    aiTier: "initial",
    status: "granted",
    expiresAt: day("2026-10-17"),
    startedAt: i < 4 ? day("2026-10-11") : null,
    endsAt: i < 4 ? day("2026-10-11") + 720_000 : null,
  })),
  payouts: [],
  profiles: [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `provider-${i}-uid`, status: "verified", sample: false })),
    { id: "sample-awa", status: "verified", sample: true },
    { id: "demo-provider-uid", status: "verified", sample: true },
  ],
  applications: [{ id: "provider-0-uid", status: "approved" }],
  talk,
  calls,
  traffic: [
    { day: "2026-10-12", views: 140, visits: 60, byPath: { home: 80, talk: 40, pricing: 20 } },
    { day: "2026-10-13", views: 3, visits: 2, byPath: { home: 3 } },
  ],
  counts: {
    activeDay: 3,
    activeWeek: 14,
    activeMonth: 30,
    dau: [],
    wau: [],
    mau: [],
    chatMessages: [],
    // As the function reads it for October's wellbeing figures: by score, the average, and by week.
    mood: {
      byScore: [0, 2, 6, 9, 3],
      average: 3.65,
      weekly: S.bucketStarts(iso("2026-10-01T00:00:00Z"), iso("2026-10-31T23:59:59Z"), "week").map((t) => ({
        t,
        n: t === iso("2026-10-12T00:00:00Z") ? 20 : 0,
        average: t === iso("2026-10-12T00:00:00Z") ? 3.65 : null,
      })),
    },
    queues: { applications: 2, support: 1, payments: 0, payouts: 0, sessions: 0 },
  },
  recordingSince: {
    talkSessions: iso("2026-10-12T19:00:00Z"),
    presence: null,
    traffic: iso("2026-10-12T00:00:00Z"),
    providerCalls: callStart,
  },
};

const stats = S.composeStats({ ...rows, counts: { ...rows.counts, mood: null } }, r7, now);
const json = JSON.stringify(stats);
// October's wellbeing figures, asked for once October has ended.
const november = iso("2026-11-02T08:00:00Z");
const october = S.resolveRange({ month: "2026-10" }, november);
const monthStats = S.composeStats(rows, october, november);
const w = monthStats.wellbeing!;

check("staff, sample owners and test accounts are not people", stats.people.total.value === 30);
check(
  "people by role leave them out too",
  same(stats.people.byRole.map((c) => [c.key, c.value]), [["patient", 23], ["provider", 7], ["org_admin", 0]]),
);
check("sign-ups this week are the 23 patients", stats.people.newSignups.value === 23);
check("onboarded share of the new patients", stats.people.onboarded.rate !== null && Math.abs(stats.people.onboarded.rate - 15 / 23) < 1e-9);
check("activity of three in a day is withheld", stats.people.active.day.suppressed && stats.people.active.week.value === 14);
check("test and staff payments are not money", stats.money.grossMinor === 6 * 20_000 + 100_000);
check("the platform keeps TALK in full and its fee on sessions", stats.money.platformFeeMinor === 6 * 20_000 + 15_000);
check("paid first conversations count real people only", stats.holdings.paidFirstConversations.value === 6);
check("a test booking is not a booking", stats.holdings.bookingsTotal.suppressed && stats.headline.bookings.suppressed);
check("sample listings are not providers", stats.holdings.providersByStatus.find((c) => c.key === "verified")?.value === 7);
check("passes: four used, two waiting — both small, so both withheld", stats.holdings.talkPasses.every((c) => c.value === 0 || c.suppressed));

const measured = talk.filter((t) => t.durationSec !== null).map((t) => t.durationSec as number);
check("median time with TALK", stats.engagement.medianSec === Math.round(S.percentile(measured, 0.5) as number));
check("p90 time with TALK", stats.engagement.p90Sec === Math.round(S.percentile(measured, 0.9) as number));
check("conversations with no end reported are not measured", stats.engagement.measured.value === 11);
check("the heatmap is a week of hours", stats.engagement.hourOfWeek.values.length === 7 && stats.engagement.hourOfWeek.values.every((r) => r.length === 24));
check(
  "one conversation an hour is withheld in every cell",
  stats.engagement.hourOfWeek.values.flat().every((v) => v === 0 || v === null) &&
    stats.engagement.hourOfWeek.values[0].slice(19).every((v) => v === null),
);
check("site views by page add up across the days", (() => {
  const pages = Object.fromEntries(stats.engagement.traffic.byPage.map((c) => [c.key, c.value]));
  return pages.home === 83 && pages.talk === 40 && pages.pricing === 20;
})());
check("the funnel starts with visits", stats.funnel[0].key === "visitors" && stats.funnel[0].value === 62);
check("no wellbeing figures for a preset's sliding days", stats.wellbeing === null);
check("nor for days of your own", S.composeStats(rows, custom, now).wellbeing === null);
check("a month's figures carry them", monthStats.wellbeing !== null);
check("mood average is given for twenty check-ins", w.mood.average === 3.65);
check("a small mood score is withheld", w.mood.distribution[1].suppressed);
check("wellbeing is about the 15 who finished getting to know TALK", w.population.value === 15);
check("regions split 12 and 3: both withheld", w.regions.filter((c) => c.suppressed).length >= 2);
check("concerns are counted per person", w.concerns.find((c) => c.key === "anxiety")?.value === 9);
check(
  "the month's first week starts with the month, not the Monday before",
  w.topicsByWeek[0].points[0].t === october.from && w.mood.weeklyEntries[0].t === october.from && S.dayKey(w.topicsByWeek[0].points[1].t) === "2026-10-05",
);
check("topics come from the conversations of the month", w.topicsByWeek.find((t) => t.key === "anxiety")?.points.find((p) => p.value === 6) !== undefined);
check("one flagged conversation: withheld, and its level with it", w.safetyFlaggedConversations.suppressed && w.safetyByRisk.every((c) => c.value === 0 || c.suppressed));
check("levels are the two kinds of danger", same(w.safetyByRisk.map((c) => c.key), ["elevated", "urgent"]));

// Danger levels as the parts of the flagged conversations beside them.
const flaggedTalk = (elevated: number, urgent: number, unknown = 0): TalkSessionDoc[] => [
  ...Array.from({ length: elevated }, () => ({ ...talk[0], safetyFlagged: true, risk: "elevated" as const })),
  ...Array.from({ length: urgent }, () => ({ ...talk[0], safetyFlagged: true, risk: "urgent" as const })),
  ...Array.from({ length: unknown }, () => ({ ...talk[0], safetyFlagged: true, risk: undefined })),
];
const riskOf = (list: TalkSessionDoc[]) =>
  S.composeStats({ ...rows, talk: list }, october, november).wellbeing!;
const plenty = riskOf(flaggedTalk(10, 6));
check("ten elevated and six urgent are both shown", plenty.safetyFlaggedConversations.value === 16 && same(plenty.safetyByRisk.map((c) => c.value), [10, 6]));
const fewUrgent = riskOf(flaggedTalk(10, 2));
check(
  "two urgent beside a total of twelve: withheld, and elevated too, or 12 − 10 gives it back",
  fewUrgent.safetyFlaggedConversations.value === 12 && fewUrgent.safetyByRisk.every((c) => c.suppressed),
);
const older = riskOf(flaggedTalk(6, 5, 7));
check(
  "conversations flagged before levels were kept have a part of their own",
  older.safetyFlaggedConversations.value === 18 && older.safetyByRisk.find((c) => c.key === "unknown")?.value === 7,
);

// Session calls with providers.
const pc = stats.engagement.providerCalls;
const realCallSecs = calls
  .slice(0, 11)
  .map((c) => Math.min((10 + 45 + 60) * 60, Math.round(((c.endedAt as number) - c.firstJoinedAt) / 1000)));
check("test and staff calls are not counted", pc.calls.value === 12);
check("a call never hung up has no length", pc.measured.value === 11);
check("median call length", pc.medianSec === Math.round(S.percentile(realCallSecs, 0.5) as number));
check("longest tenth, with a stale room held to its join window", pc.p90Sec === Math.round(S.percentile(realCallSecs, 0.9) as number) && Math.max(...realCallSecs) === 6900);
check("the call histogram adds up to the calls with a length", pc.durationHistogram.reduce((s, c) => s + (c.value ?? 0), 0) <= 11 && pc.durationHistogram.some((c) => c.suppressed));
const fewCalls = S.composeStats({ ...rows, calls: calls.slice(0, 4) }, r7, now).engagement.providerCalls;
check("four calls: no median, no tenth, count withheld", fewCalls.medianSec === null && fewCalls.p90Sec === null && fewCalls.calls.suppressed);
check("calls opened outside the dates are not counted", S.composeStats(rows, S.resolveRange("7d", iso("2026-11-30T12:00:00Z")), iso("2026-11-30T12:00:00Z")).engagement.providerCalls.calls.value === 0);
check("queues are work, shown exactly", stats.queues.find((q) => q.key === "support")?.count === 1);
check("headline revenue moves against the week before", stats.headline.revenueMinor.value === 220_000 && stats.headline.revenueMinor.previous === 0);

check("sign-ups come at one grain only, so a day cannot be taken from its week", !("signupsByWeek" in stats.people));
check(
  "spoken or typed splits the ended conversations, which are on show",
  stats.engagement.byMode.every((c) => c.key !== "unknown") &&
    stats.engagement.byMode.reduce((s, c) => s + (c.value ?? 0), 0) <= (stats.engagement.measured.value ?? 0),
);

// The hour-of-week grid against the conversations-per-day chart. Over seven
// days each weekday row is one day, so a row with a single hidden cell would
// give it back: that day's total minus the row's visible cells.
const busyMonday: TalkSessionDoc[] = [
  ...Array.from({ length: 10 }, () => ({ ...talk[0], startedAt: iso("2026-10-12T14:00:00Z") })),
  ...Array.from({ length: 2 }, () => ({ ...talk[0], startedAt: iso("2026-10-12T03:00:00Z") })),
  ...Array.from({ length: 8 }, () => ({ ...talk[0], startedAt: iso("2026-10-13T09:00:00Z") })),
  ...Array.from({ length: 3 }, () => ({ ...talk[0], startedAt: iso("2026-10-13T22:00:00Z") })),
];
const gridStats = S.composeStats({ ...rows, talk: busyMonday }, r7, now);
const gridDays = new Map(gridStats.engagement.conversationsByBucket.map((p) => [S.hourOfWeek(p.t).day, p]));
const rowLeaks = gridStats.engagement.hourOfWeek.values.flatMap((row, d) => {
  const dayShown = gridDays.get(d);
  if (!dayShown || dayShown.value === null) return [];
  const hidden = row.filter((v) => v === null).length;
  const visible = row.reduce<number>((s, v) => s + (v ?? 0), 0);
  return hidden === 1 ? [`${S.WEEKDAY_LABELS[d]}: ${dayShown.value - visible} recoverable`] : [];
});
check("no weekday row of the heatmap gives a hidden hour back", rowLeaks.length === 0, rowLeaks.join(", "));

// "Ready" and "in use" add up to the paid conversations by tier, shown beside them.
const passRows = {
  ...rows,
  entitlements: [
    ...Array.from({ length: 30 }, (_, i) => ({ uid: `p-ready-${i}`, aiTier: "initial", status: "granted", expiresAt: day("2026-10-20"), startedAt: null, endsAt: null })),
    ...Array.from({ length: 3 }, (_, i) => ({ uid: `p-using-${i}`, aiTier: "initial", status: "granted", expiresAt: day("2026-10-20"), startedAt: now - 60_000, endsAt: now + 600_000 })),
    ...Array.from({ length: 12 }, (_, i) => ({ uid: `p-used-${i}`, aiTier: "extended", status: "granted", expiresAt: day("2026-10-13"), startedAt: day("2026-10-12"), endsAt: day("2026-10-12") + 60_000 })),
  ],
};
const passStats = S.composeStats(passRows, r7, now);
const passes = Object.fromEntries(passStats.holdings.talkPasses.map((c) => [c.key, c.value]));
const tiersVisible = passStats.holdings.talkActiveByTier.every((c) => !c.suppressed);
check(
  "a hidden 'in use' cannot be taken from the tiers' total minus 'ready'",
  !(tiersVisible && passes.inUse === null && passes.ready !== null),
  JSON.stringify(passes),
);

// Nothing that names or points at a person reaches the result.
const uids = rows.users.map((u) => u.id);
const monthJson = JSON.stringify(monthStats);
check("no uid appears anywhere in the result", !uids.some((id) => json.includes(id) || monthJson.includes(id)), uids.find((id) => json.includes(id) || monthJson.includes(id)));
check("nor a call's booking or participants", !json.includes("bk-call") && !monthJson.includes("bk-call") && !json.includes("provider-1-uid"));

/** Every count-shaped thing in the people, holdings, engagement, funnel and wellbeing sections. */
function smallVisible(node: unknown, path: string, out: string[]) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => smallVisible(child, `${path}[${i}]`, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if ("suppressed" in o && typeof o.value === "number" && !path.includes("mood.weeklyAverage") && !path.includes("medianTalkSec")) {
    if (o.value > 0 && o.value < K) out.push(`${path}=${o.value}`);
  }
  for (const [key, child] of Object.entries(o)) if (key !== "spark" || path.includes("headline")) smallVisible(child, `${path}.${key}`, out);
}
const leaks: string[] = [];
for (const section of ["people", "holdings", "engagement", "funnel", "wellbeing", "headline"] as const) {
  smallVisible(stats[section], section, leaks);
  smallVisible(monthStats[section], `month.${section}`, leaks);
}
check("no visible count from 1 to 4 anywhere about people", leaks.length === 0, leaks.slice(0, 5).join(", "));

// --- the live strip --------------------------------------------------------------------
const live = S.composeLive(
  {
    excluded: new Set(["staff-member-uid"]),
    visitorPages: ["home", "home", "home", "home", "home", "home", "talk", "talk"],
    signedIn: [
      { uid: "staff-member-uid", area: "app" },
      ...Array.from({ length: 6 }, (_, i) => ({ uid: `patient-${i}-uid`, area: "talk" })),
    ],
    talking: 2,
  },
  now,
);
check("visitors now", live.visitorsNow.value === 8);
check("a page with two visitors is withheld, and so is its neighbour", live.visitorsByPage.every((c) => c.suppressed));
check("staff are not counted as signed in", live.signedInNow.value === 6);
check("two talking now is withheld", live.talkingNow.suppressed);
check("the live strip carries no uid", !JSON.stringify(live).includes("uid"));

// --- display and export -----------------------------------------------------------------
check("withheld reads as <5", S.countText(null, true) === "<5" && S.countText(1204, false) === "1,204" && S.countText(null, false) === "–");
const csv = S.wellbeingCsv(w, october);
check("the CSV has a header and a row per cell", csv.startsWith("section,group,period start (UTC),value\r\n") && csv.split("\r\n").length > 20);
check("the CSV shows withheld cells as <5", csv.includes(",<5\r\n"));
check("the CSV carries no uid", !uids.some((id) => csv.includes(id)));
check("the CSV names its month", csv.includes(",2026-10,") && !/\d{4}-\d{2}-\d{2} to /.test(csv));
check("the CSV holds the flagged conversations by level", csv.includes("Conversations TALK flagged, by how serious"));
check("the CSV quotes a comma", S.wellbeingCsv({ ...w, concerns: [{ key: "x", label: "Grief, loss", value: 9, suppressed: false }] }, october).includes('"Grief, loss"'));

console.log(failures === 0 ? "\nAll admin statistics checks passed." : `\n${failures} admin statistics check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
