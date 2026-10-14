/**
 * Security-rule tests for the staff statistics: the "here now" heartbeat and
 * the collections only the analytics functions touch.
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth application-default print-access-token) \
 *     node scripts/test-rules-analytics.mjs
 *
 * Without the token it falls back to the service-account key in secrets/,
 * which can use the evaluator only once it holds the Service Usage Consumer
 * role on the project.
 *
 * Same evaluator as scripts/test-security-rules.mjs (firebaserules
 * .googleapis.com :test) — the engine that serves production, given the
 * rules source from disk and synthetic requests. It reads no data.
 *
 * What these hold:
 *  - presence/{uid} is written by its owner only, with exactly the server's
 *    time and one of four places in the app — nothing else rides along — and
 *    read by nobody, the owner and staff included;
 *  - the day, week and month markers under it are only for the period the
 *    server's clock is in, with exactly their own key and the server's time,
 *    and are read by nobody;
 *  - a session call's firstJoinedAt and endedAt, which time sessions for the
 *    staff numbers, are only ever the server's time as written or left as
 *    they were, and only by the two people in the call;
 *  - talkSessionStats, liveVisitors, trafficDaily, adminStatsCache and
 *    analyticsQuota are closed to every browser, staff included: only the
 *    functions write them, and staff see them only as the adminStats totals.
 */

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/talk-admin-sa.json";

const DOCS = `/databases/(default)/documents`;
const PATIENT = "patient-uid";
const PROVIDER = "provider-uid";
const STRANGER = "stranger-uid";
const ADMIN = "admin-uid";

/** The evaluator's clock for every request below: a Wednesday. */
const NOW = "2026-10-14T12:05:00Z";
const A_MINUTE_AGO = "2026-10-14T12:04:00Z";

const PRESENCE = `${DOCS}/presence/${PATIENT}`;
const OTHERS_PRESENCE = `${DOCS}/presence/${STRANGER}`;
const beat = (area = "app") => ({ lastSeenAt: NOW, area });

const dayMarker = (key) => [`${PRESENCE}/presenceDays/${key}`, { day: key, at: NOW }];
const weekMarker = (key) => [`${PRESENCE}/presenceWeeks/${key}`, { week: key, at: NOW }];
const monthMarker = (key) => [`${PRESENCE}/presenceMonths/${key}`, { month: key, at: NOW }];
const [TODAY, today] = dayMarker("2026-10-14");
const [THIS_WEEK, thisWeek] = weekMarker("2026-10-12");
const [THIS_MONTH, thisMonth] = monthMarker("2026-10");

/** What the functions keep, as they write it. */
const talkStats = {
  kind: "intake",
  tier: "initial",
  language: "wolof",
  startedAt: 1_791_115_500_000,
  endedAt: null,
  durationSec: null,
  turns: 0,
  mode: null,
  completed: false,
  matched: false,
  paid: true,
  topics: ["anxiety"],
  safetyFlagged: false,
};
const TALK = `${DOCS}/talkSessionStats/3f1c9a`;
const VISITOR = `${DOCS}/liveVisitors/0b7c1e5a-3f7e-4c1a-9d1e-2b8c4a6f9e10`;
const visitor = { path: "home", lastSeenAt: NOW, expireAt: NOW };
const TRAFFIC = `${DOCS}/trafficDaily/2026-10-14`;
const traffic = { views: 140, visits: 60, byPath: { home: 80 }, updatedAt: 1_791_115_500_000 };
const CACHE = `${DOCS}/adminStatsCache/7d:2026-10-14`;
const cache = { body: "{}", computedAt: 1_791_115_500_000, expireAt: NOW };
const QUOTA = `${DOCS}/analyticsQuota/${PATIENT}`;
const quota = { day: "2026-10-14", reports: 3, expireAt: NOW };

/** A session's call room, as app/lib/call.ts writes it; the booking it belongs to is mocked below. */
const CALL = `${DOCS}/calls/bk_1`;
const room = { participants: [PATIENT, PROVIDER], status: "active", startedAt: NOW };
const openedEarlier = { ...room, startedAt: A_MINUTE_AGO, firstJoinedAt: A_MINUTE_AGO };
const EARLIER = "2026-10-14T11:00:00Z";
const LATER = "2026-10-14T14:00:00Z";

/** A marker's path, nothing there yet, and the marker: the tail of a create case. */
const fresh = ([path, data]) => [path, null, data];
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

const CASES = [
  // --- the heartbeat ---------------------------------------------------------
  ["a person writes their own heartbeat", "ALLOW", PATIENT, "create", PRESENCE, null, beat()],
  ["and beats again from TALK", "ALLOW", PATIENT, "update", PRESENCE, beat(), beat("talk")],
  ["from messages", "ALLOW", PATIENT, "update", PRESENCE, beat(), beat("chat")],
  ["from a session call", "ALLOW", PATIENT, "update", PRESENCE, beat(), beat("call")],
  ["a provider beats too", "ALLOW", PROVIDER, "create", `${DOCS}/presence/${PROVIDER}`, null, beat()],
  ["a place in the app that is not one of the four", "DENY", PATIENT, "create", PRESENCE, null, beat("admin")],
  ["a page path instead of a place", "DENY", PATIENT, "create", PRESENCE, null, beat("/chats/u1__u2")],
  ["anything riding along", "DENY", PATIENT, "create", PRESENCE, null, { ...beat(), path: "/mood" }],
  ["a name riding along", "DENY", PATIENT, "update", PRESENCE, beat(), { ...beat(), displayName: "Awa" }],
  ["no place given", "DENY", PATIENT, "create", PRESENCE, null, without(beat(), "area")],
  ["no time given", "DENY", PATIENT, "create", PRESENCE, null, without(beat(), "lastSeenAt")],
  ["the browser's own clock instead of the server's", "DENY", PATIENT, "create", PRESENCE, null, { ...beat(), lastSeenAt: A_MINUTE_AGO }],
  ["a heartbeat for somebody else", "DENY", PATIENT, "create", OTHERS_PRESENCE, null, beat()],
  ["a heartbeat while signed out", "DENY", null, "create", PRESENCE, null, beat()],
  ["staff cannot write one for somebody", "DENY", ADMIN, "update", PRESENCE, beat(), beat()],
  ["the owner cannot read it back", "DENY", PATIENT, "get", PRESENCE, beat()],
  ["staff cannot read it", "DENY", ADMIN, "get", PRESENCE, beat()],
  ["staff cannot list who is here", "DENY", ADMIN, "list", PRESENCE, beat()],
  ["nobody signed in lists it", "DENY", null, "list", PRESENCE, beat()],
  ["the owner removes it with their account", "ALLOW", PATIENT, "delete", PRESENCE, beat()],
  ["nobody else removes it", "DENY", STRANGER, "delete", PRESENCE, beat()],

  // --- day, week and month markers ----------------------------------------------
  ["today's marker", "ALLOW", PATIENT, "create", TODAY, null, today],
  ["today's marker again", "ALLOW", PATIENT, "update", TODAY, today, today],
  ["yesterday's marker, back-filled", "DENY", PATIENT, "create", ...fresh(dayMarker("2026-10-13"))],
  ["tomorrow's marker", "DENY", PATIENT, "create", ...fresh(dayMarker("2026-10-15"))],
  ["a marker whose key is not its id", "DENY", PATIENT, "create", TODAY, null, { ...today, day: "2026-10-13" }],
  ["a marker that is not a date", "DENY", PATIENT, "create", `${PRESENCE}/presenceDays/14-10-2026`, null, { day: "14-10-2026", at: NOW }],
  ["a marker with a browser clock", "DENY", PATIENT, "create", TODAY, null, { ...today, at: A_MINUTE_AGO }],
  ["a marker with anything else on it", "DENY", PATIENT, "create", TODAY, null, { ...today, area: "talk" }],
  ["a marker for somebody else", "DENY", PATIENT, "create", `${OTHERS_PRESENCE}/presenceDays/2026-10-14`, null, today],
  ["nobody reads a day marker", "DENY", PATIENT, "get", TODAY, today],
  ["staff do not list day markers", "DENY", ADMIN, "list", TODAY, today],

  ["this week's marker, named by its Monday", "ALLOW", PATIENT, "create", THIS_WEEK, null, thisWeek],
  ["a week named by a Tuesday", "DENY", PATIENT, "create", ...fresh(weekMarker("2026-10-13"))],
  ["last week's marker", "DENY", PATIENT, "create", ...fresh(weekMarker("2026-10-05"))],
  ["next week's marker", "DENY", PATIENT, "create", ...fresh(weekMarker("2026-10-19"))],
  ["a week marker with the wrong key", "DENY", PATIENT, "create", THIS_WEEK, null, { ...thisWeek, week: "2026-10-05" }],
  ["nobody reads a week marker", "DENY", ADMIN, "get", THIS_WEEK, thisWeek],

  ["this month's marker", "ALLOW", PATIENT, "create", THIS_MONTH, null, thisMonth],
  ["last month's marker", "DENY", PATIENT, "create", ...fresh(monthMarker("2026-09"))],
  ["this month a year on", "DENY", PATIENT, "create", ...fresh(monthMarker("2027-10"))],
  ["a month that is not a month", "DENY", PATIENT, "create", ...fresh(monthMarker("2026-1"))],
  ["a month marker for somebody else", "DENY", STRANGER, "create", THIS_MONTH, null, thisMonth],
  ["nobody reads a month marker", "DENY", PATIENT, "get", THIS_MONTH, thisMonth],

  // --- the functions' own collections ----------------------------------------------
  ["staff cannot read a conversation's numbers", "DENY", ADMIN, "get", TALK, talkStats],
  ["staff cannot list conversations", "DENY", ADMIN, "list", TALK, talkStats],
  ["a person cannot invent a conversation", "DENY", PATIENT, "create", TALK, null, talkStats],
  ["a person cannot lengthen one", "DENY", PATIENT, "update", TALK, talkStats, { ...talkStats, durationSec: 3600 }],
  ["staff cannot write one", "DENY", ADMIN, "create", TALK, null, talkStats],
  ["nobody signed in writes one", "DENY", null, "create", TALK, null, talkStats],

  ["a visitor cannot write their own tab", "DENY", null, "create", VISITOR, null, visitor],
  ["a signed-in person cannot either", "DENY", PATIENT, "update", VISITOR, visitor, visitor],
  ["staff cannot list who is on the site", "DENY", ADMIN, "list", VISITOR, visitor],
  ["nobody reads a tab", "DENY", null, "get", VISITOR, visitor],

  ["nobody adds page views", "DENY", null, "update", TRAFFIC, traffic, { ...traffic, views: 1_000_000 }],
  ["a signed-in person cannot start a day", "DENY", PATIENT, "create", TRAFFIC, null, traffic],
  ["staff cannot read a day's traffic directly", "DENY", ADMIN, "get", TRAFFIC, traffic],
  ["staff cannot list the days", "DENY", ADMIN, "list", TRAFFIC, traffic],

  ["staff cannot read the stored figures", "DENY", ADMIN, "get", CACHE, cache],
  ["staff cannot plant figures", "DENY", ADMIN, "create", CACHE, null, cache],
  ["a person cannot plant figures", "DENY", PATIENT, "update", CACHE, cache, { ...cache, body: "{\"k\":1}" }],

  // --- session calls: when one began and ended -----------------------------------
  ["the first to join stamps when the call began", "ALLOW", PATIENT, "create", CALL, null, { ...room, firstJoinedAt: NOW }],
  ["a room opened without it, as before", "ALLOW", PROVIDER, "create", CALL, null, room],
  ["a call that began an hour ago, by the browser's clock", "DENY", PATIENT, "create", CALL, null, { ...room, firstJoinedAt: EARLIER }],
  ["the second to join leaves it as it was", "ALLOW", PROVIDER, "update", CALL, openedEarlier, { ...openedEarlier, startedAt: NOW }],
  ["joining in the same moment stamps it again", "ALLOW", PROVIDER, "update", CALL, openedEarlier, { ...openedEarlier, firstJoinedAt: NOW }],
  ["moving the start back to stretch a session", "DENY", PATIENT, "update", CALL, openedEarlier, { ...openedEarlier, firstJoinedAt: EARLIER }],
  ["hanging up stamps the end", "ALLOW", PATIENT, "update", CALL, openedEarlier, { ...openedEarlier, status: "ended", endedAt: NOW }],
  ["an end in the future", "DENY", PATIENT, "update", CALL, openedEarlier, { ...openedEarlier, status: "ended", endedAt: LATER }],
  ["sending the answer leaves both as they were", "ALLOW", PROVIDER, "update", CALL, { ...openedEarlier, endedAt: A_MINUTE_AGO }, { ...openedEarlier, endedAt: A_MINUTE_AGO, answer: { type: "answer", sdp: "v=0" } }],
  ["a room from before either was kept still works", "ALLOW", PROVIDER, "update", CALL, room, { ...room, answer: { type: "answer", sdp: "v=0" } }],
  ["somebody outside the call cannot stamp it", "DENY", STRANGER, "update", CALL, openedEarlier, { ...openedEarlier, endedAt: NOW }],

  ["a person cannot read their own report count", "DENY", PATIENT, "get", QUOTA, quota],
  ["a person cannot reset it", "DENY", PATIENT, "update", QUOTA, quota, { ...quota, reports: 0 }],
  ["a person cannot remove it", "DENY", PATIENT, "delete", QUOTA, quota],
  ["staff cannot see who talked to TALK today", "DENY", ADMIN, "list", QUOTA, quota],
];

/** What users/{uid} says for each test account — the role isAdmin() reads. */
const userDocMocks = [
  [PROVIDER, "provider", true],
  [PATIENT, "patient", true],
  [STRANGER, "patient", true],
  [ADMIN, "admin", true],
].map(([uid, role, verified]) => ({
  function: "get",
  args: [{ exactValue: `${DOCS}/users/${uid}` }],
  result: { value: { data: { uid, role, verified } } },
}));

const bookingMock = {
  function: "get",
  args: [{ exactValue: `${DOCS}/bookings/bk_1` }],
  result: { value: { data: { participants: [PATIENT, PROVIDER], patientId: PATIENT, providerId: PROVIDER } } },
};

const testCase = ([, expectation, uid, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth: uid
      ? { uid, token: { sub: uid, firebase: { sign_in_provider: "password" }, ...(uid === ADMIN ? { admin: true } : {}) } }
      : null,
    path,
    method,
    time: NOW,
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
  // Opening a call room reads the booking it belongs to.
  functionMocks: path.includes("/calls/") ? [...userDocMocks, bookingMock] : userDocMocks,
});

/**
 * The evaluator over a flaky connection: a dropped request or a 5xx is tried
 * again a few times before it counts as unreachable. A 4xx is an answer.
 */
async function evaluate(token, body) {
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          // A user credential carries no project of its own; this API bills against one.
          "x-goog-user-project": PROJECT,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status < 500) return res;
      last = new Error(`rules test API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } catch (error) {
      last = error;
    }
    console.error(`  (evaluator attempt ${attempt} failed: ${last?.message ?? last}; trying again)`);
    await sleep(3000 * attempt);
  }
  throw last;
}

/** Inside a function so it can return: process.exit() trips a libuv assertion on Windows. */
async function main() {
  const source = await readFile("firestore.rules", "utf8");
  const token =
    process.env.RULES_TEST_ACCESS_TOKEN ||
    (await (
      await new GoogleAuth({ keyFile: KEY, scopes: "https://www.googleapis.com/auth/cloud-platform" }).getClient()
    ).getAccessToken()).token;

  let res;
  try {
    res = await evaluate(token, {
      source: { files: [{ name: "firestore.rules", content: source }] },
      testSuite: { testCases: CASES.map(testCase) },
    });
  } catch (error) {
    console.error(`The rules evaluator could not be reached: ${error?.message ?? error}`);
    process.exitCode = 2;
    return;
  }

  if (!res.ok) {
    console.error(`rules test API ${res.status}: ${await res.text()}`);
    console.error("If this is a permission error, run with RULES_TEST_ACCESS_TOKEN from an owner's gcloud login.");
    process.exitCode = 1;
    return;
  }

  const { testResults = [], issues = [] } = await res.json();
  for (const issue of issues) {
    console.log(`${issue.severity}: ${issue.description} (line ${issue.sourcePosition?.line})`);
  }

  let failures = 0;
  CASES.forEach(([what, expectation], index) => {
    const result = testResults[index];
    const ok = result?.state === "SUCCESS";
    if (!ok) failures += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${expectation.padEnd(5)} ${what}`);
    if (!ok && result?.debugMessages?.length) {
      for (const line of result.debugMessages) console.log(`        ${line}`);
    }
  });

  console.log(failures ? `\n${failures} of ${CASES.length} FAILED` : `\nAll ${CASES.length} analytics rule checks passed`);
  process.exitCode = failures ? 1 : 0;
}

await main();
