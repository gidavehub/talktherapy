/**
 * Staff analytics: the anonymous numbers behind the admin overview and
 * insights pages, and the three signals they are built from (track:
 * analytics). Exported from index.ts.
 *
 *   recordTalkSession   a TALK conversation started or ended — written with
 *                       no uid, to talkSessionStats
 *   beacon              a public page was opened or is still open — counted
 *                       in trafficDaily, held for "now" in liveVisitors
 *   adminStats          staff: every figure for a range, worked out here
 *
 * The fourth signal, presence/{uid}, is written by the person's own browser
 * under exact rules (the ADMIN ANALYTICS block in firestore.rules) and only
 * ever counted.
 *
 * All of it runs as the project's default service account, never as talk-ai:
 * the AI functions stay database-blind (scripts/verify-service-accounts.mjs).
 *
 * The figures are worked out from plain rows by app/lib/adminStatsCore.ts,
 * which is where withholding small groups lives and what
 * scripts/test-admin-stats.mts checks. This file only reads: select() of the
 * fields a figure needs and nothing else — never a name, an email, an intake
 * summary, a note or a message — and aggregation queries (count, average)
 * wherever a figure is just a number, so mood check-ins and chat messages are
 * counted without one of them ever being loaded here.
 *
 * DEPLOY: liveVisitors.expireAt, analyticsQuota.expireAt and
 * adminStatsCache.expireAt carry TTL policies (fieldOverrides in
 * firestore.indexes.json, applied by `firebase deploy --only
 * firestore:indexes`). Without the liveVisitors one, a document per tab
 * would be kept for ever.
 */

import { createHash } from "node:crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { AggregateField, FieldPath, FieldValue, Timestamp, type Query } from "firebase-admin/firestore";
import { db } from "./payments";
import { CALLABLE, USERS, requireStaff, signedIn } from "./staff";
import {
  DAY_MS,
  LIVE_WINDOW_MS,
  STATS_CACHE_MS,
  TALKING_WINDOW_MS,
  TALK_REPORTS_PER_DAY,
  VISITOR_ID,
  VISIT_GAP_MS,
  bucketBounds,
  bucketStarts,
  composeLive,
  composeStats,
  dayKey,
  floorToMinute,
  isAllowedOrigin,
  isBot,
  millisOf,
  monthKey,
  normalisePath,
  parseDayKey,
  parseTalkReport,
  resolveRange,
  startOfUtcDay,
  talkEndDoc,
  talkStartDoc,
  type AdminStats,
  type AdminStatsBody,
  type CountAt,
  type LiveStats,
  type ResolvedRange,
  type StatsRows,
  type TalkSessionDoc,
  type UserRow,
} from "../../app/lib/adminStatsCore";

/** One per TALK conversation. No uid; the id is a hash the caller cannot be found from. */
const TALK_STATS = "talkSessionStats";
/** How many reports each person sent today. Function-only; expires. */
const QUOTA = "analyticsQuota";
const PRESENCE = "presence";
const PRESENCE_DAYS = "presenceDays";
const PRESENCE_WEEKS = "presenceWeeks";
const PRESENCE_MONTHS = "presenceMonths";
/** One per open tab on the site, for "on the site now". Expires (TTL). */
const LIVE_VISITORS = "liveVisitors";
/** One per UTC day: views, visits, and views by page. */
const TRAFFIC = "trafficDaily";
/** One range's figures, kept five minutes. Function-only; expires. */
const CACHE = "adminStatsCache";
/**
 * The shape of AdminStatsBody the stored figures were worked out in. Moved on
 * whenever it changes, so a deploy never hands the pages stored figures they
 * cannot read.
 */
const CACHE_SHAPE = 2;
/** Session calls (app/lib/call.ts): only when each was first joined and last hung up is read. */
const CALLS = "calls";

/** The longest the daily-actives line goes back: past 92 days it is a smear, and WAU and MAU say it better. */
const DAU_DAYS = 92;
/** How many aggregation queries run at once. */
const PARALLEL = 16;
/** A bound on the scans behind the live strip, which only ever hold who is here now. */
const LIVE_SCAN_LIMIT = 5000;

const ts = (ms: number) => Timestamp.fromMillis(ms);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// --------------------------------------------------------- TALK conversations

/**
 * The conversation's document id: a hash of who is talking and the page's
 * random id for the conversation. The start and the end of one conversation
 * land on one document, a caller can only ever touch their own, and nothing
 * stored leads back to them — the random id never leaves their browser tab.
 */
function talkStatsId(uid: string, conversationId: string): string {
  return createHash("sha256").update(`${uid}:${conversationId}`).digest("hex").slice(0, 40);
}

/**
 * A TALK conversation began, or ended. Sent by app/talk/page.tsx (through
 * app/lib/analytics/reportTalkSession.ts) at the start, at the end, and when
 * the page is closed mid-conversation. Everything in it is an enum, a count
 * or a length: never what was said.
 *
 * Idempotent: a second start changes nothing, and ends only ever add (see
 * talkEndDoc). Each person may send TALK_REPORTS_PER_DAY a day, counted in
 * analyticsQuota in the same transaction.
 */
export const recordTalkSession = onCall({ ...CALLABLE, memory: "256MiB" }, async (request) => {
  const uid = signedIn(request);
  const report = parseTalkReport(request.data);
  if (!report) throw new HttpsError("invalid-argument", "That is not a conversation report.");

  const now = Date.now();
  const today = dayKey(now);
  const ref = db().collection(TALK_STATS).doc(talkStatsId(uid, report.id));
  const quotaRef = db().collection(QUOTA).doc(uid);

  const accepted = await db().runTransaction(async (tx) => {
    const [quota, snap] = await Promise.all([tx.get(quotaRef), tx.get(ref)]);
    const used = quota.get("day") === today ? num(quota.get("reports")) : 0;
    if (used >= TALK_REPORTS_PER_DAY) return false;
    tx.set(quotaRef, { day: today, reports: used + 1, expireAt: ts(startOfUtcDay(now) + 2 * DAY_MS) });

    const existing = snap.exists ? (snap.data() as TalkSessionDoc) : null;
    if (report.phase === "start") {
      if (!existing) tx.set(ref, talkStartDoc(report, now));
    } else {
      tx.set(ref, talkEndDoc(existing, report, now));
    }
    return true;
  });
  if (!accepted) throw new HttpsError("resource-exhausted", "That is enough reports for today.");
  return { ok: true };
});

// --------------------------------------------------------------- site traffic

/**
 * Brakes on a chatty tab or address, per instance. Never stored: the address
 * is held in memory for a minute to count requests and goes nowhere else.
 *
 * A tab's page views may come quickly — somebody clicking through — but its
 * "still here" beats are due once a minute, so one arriving within half a
 * minute of anything else from that tab adds nothing and is dropped.
 */
const lastFromTab = new Map<string, number>();
const fromAddress = new Map<string, { since: number; n: number }>();
const VIEW_GAP_MS = 1_000;
const BEAT_GAP_MS = 30_000;
const PER_ADDRESS_PER_MINUTE = 300;

function throttled(sid: string, view: boolean, address: string, now: number): boolean {
  if (lastFromTab.size > 20_000) lastFromTab.clear();
  if (fromAddress.size > 20_000) fromAddress.clear();
  const last = lastFromTab.get(sid);
  if (last !== undefined && now - last < (view ? VIEW_GAP_MS : BEAT_GAP_MS)) return true;
  const seen = fromAddress.get(address);
  const window = seen && now - seen.since < 60_000 ? seen : { since: now, n: 0 };
  window.n += 1;
  fromAddress.set(address, window);
  if (window.n > PER_ADDRESS_PER_MINUTE) return true;
  lastFromTab.set(sid, now);
  return false;
}

/** The body navigator.sendBeacon sends: text, holding JSON. */
function readBeacon(raw: Buffer | undefined): { path: unknown; sid: string; view: boolean } | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    if (typeof body.sid !== "string" || !VISITOR_ID.test(body.sid)) return null;
    return { path: body.path, sid: body.sid, view: body.view === true };
  } catch {
    return null;
  }
}

/**
 * Somebody has a page of the site open. Sent by app/lib/analytics/TrafficBeacon.tsx
 * on every route change (`view: true`) and every minute while the tab is on
 * screen.
 *
 * Stores the page as one of a fixed list (normalisePath) and the time —
 * never the address, the user agent, the query string or anything that could
 * tell two people apart. `sid` is a random id the tab made for itself.
 *
 * A text body on purpose: navigator.sendBeacon sends text without a
 * preflight, and is the only request a closing page reliably gets out. CORS
 * alone cannot keep other sites out of a simple request, so a request from
 * any other origin is refused here before anything is written.
 */
export const beacon = onRequest({ ...CALLABLE, memory: "256MiB", maxInstances: 10, concurrency: 80 }, async (req, res) => {
  const origin = req.get("origin") ?? null;
  const allowed = isAllowedOrigin(origin);
  if (allowed && origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    if (allowed) {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "86400");
    }
    res.status(allowed ? 204 : 403).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (!allowed) {
    res.status(403).end();
    return;
  }

  const body = readBeacon(req.rawBody);
  if (!body) {
    res.status(400).end();
    return;
  }
  const now = Date.now();
  // Crawlers and repeats are answered as if counted: nothing for a script to learn from.
  if (isBot(req.get("user-agent")) || throttled(body.sid, body.view, req.ip ?? "", now)) {
    res.status(204).end();
    return;
  }

  const page = normalisePath(body.path);
  const visitorRef = db().collection(LIVE_VISITORS).doc(body.sid);
  const last = millisOf((await visitorRef.get()).get("lastSeenAt"));
  // A tab heard from for the first time, or after half an hour's quiet, is a
  // new visit — and its first word is a page view whatever it says.
  const newVisit = last === null || now - last > VISIT_GAP_MS;
  const view = body.view || newVisit;

  const writes: Promise<unknown>[] = [
    visitorRef.set({ path: page, lastSeenAt: ts(now), expireAt: ts(now + VISIT_GAP_MS) }),
  ];
  if (view) {
    writes.push(
      db()
        .collection(TRAFFIC)
        .doc(dayKey(now))
        .set(
          {
            views: FieldValue.increment(1),
            visits: FieldValue.increment(newVisit ? 1 : 0),
            byPath: { [page]: FieldValue.increment(1) },
            updatedAt: now,
          },
          { merge: true },
        ),
    );
  }
  await Promise.all(writes);
  res.status(204).end();
});

// --------------------------------------------------------------------- staff

async function inBatches<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += PARALLEL) {
    out.push(...(await Promise.all(tasks.slice(i, i + PARALLEL).map((task) => task()))));
  }
  return out;
}

const count = async (q: Query) => (await q.count().get()).data().count;

/** Staff, and the owners of sample listings: never counted. Test accounts are known by their ids. */
async function excludedAccounts(): Promise<Set<string>> {
  const [staff, samples] = await Promise.all([
    db().collection(USERS).where("role", "==", "admin").select().get(),
    db().collection("providerProfiles").where("sample", "==", true).select().get(),
  ]);
  return new Set([...staff.docs, ...samples.docs].map((d) => d.id));
}

/** Who is here now: tabs on the site, people in the app, conversations with TALK. */
async function readLive(excluded: Set<string>, now: number): Promise<LiveStats> {
  const since = ts(now - LIVE_WINDOW_MS);
  const [visitors, present, talking] = await Promise.all([
    db().collection(LIVE_VISITORS).where("lastSeenAt", ">=", since).select("path").limit(LIVE_SCAN_LIMIT).get(),
    db().collection(PRESENCE).where("lastSeenAt", ">=", since).select("area").limit(LIVE_SCAN_LIMIT).get(),
    count(
      db()
        .collection(TALK_STATS)
        .where("endedAt", "==", null)
        .where("startedAt", ">=", floorToMinute(now - TALKING_WINDOW_MS)),
    ),
  ]);
  return composeLive(
    {
      excluded,
      visitorPages: visitors.docs.map((d) => str(d.get("path")) ?? "other"),
      signedIn: present.docs.map((d) => ({ uid: d.id, area: str(d.get("area")) })),
      talking,
    },
    now,
  );
}

function toUserRow(id: string, data: FirebaseFirestore.DocumentData): UserRow {
  const intake = data.intake as Record<string, unknown> | undefined;
  return {
    id,
    role: str(data.role),
    createdAt: millisOf(data.createdAt),
    onboarded: data.onboarded === true,
    spokenConsentAt: millisOf(data.consents?.spokenConsentAt),
    intake: intake
      ? {
          language: str(intake.language),
          ageRange: str(intake.ageRange),
          location: str(intake.location),
          gender: str(intake.gender),
          concerns: strings(intake.concerns),
          servicesWanted: strings(intake.servicesWanted),
          providerGender: str(intake.providerGender),
          completedAt: millisOf(intake.completedAt),
        }
      : null,
  };
}

/** The first day each new signal has anything for, so an empty chart can say "since". */
async function recordingSince(): Promise<AdminStats["recordingSince"]> {
  const [talk, presence, traffic, calls] = await Promise.all([
    db().collection(TALK_STATS).orderBy("startedAt").limit(1).select("startedAt").get(),
    db().collectionGroup(PRESENCE_DAYS).orderBy("day").limit(1).select("day").get(),
    db().collection(TRAFFIC).orderBy(FieldPath.documentId()).limit(1).select().get(),
    db().collection(CALLS).orderBy("firstJoinedAt").limit(1).select("firstJoinedAt").get(),
  ]);
  const day = (key: unknown) => {
    const ms = typeof key === "string" ? parseDayKey(key) : NaN;
    return Number.isFinite(ms) ? ms : null;
  };
  return {
    talkSessions: talk.empty ? null : millisOf(talk.docs[0].get("startedAt")),
    presence: presence.empty ? null : day(presence.docs[0].get("day")),
    traffic: traffic.empty ? null : day(traffic.docs[0].id),
    providerCalls: calls.empty ? null : millisOf(calls.docs[0].get("firstJoinedAt")),
  };
}

/** Every count that is a single aggregation query. */
async function readCounts(range: ResolvedRange, now: number): Promise<StatsRows["counts"]> {
  const { from, to, bucket } = range;
  const presence = db().collection(PRESENCE);
  const activeSince = (ms: number) => () => count(presence.where("lastSeenAt", ">=", ts(now - ms)));

  // Daily actives for the last DAU_DAYS of the range, weekly and monthly for all of it.
  const dauDays = bucketStarts(Math.max(from, startOfUtcDay(to) - (DAU_DAYS - 1) * DAY_MS), to, "day");
  const weeks = bucketStarts(from, to, "week");
  const months = bucketStarts(from, to, "month");
  const marker = (group: string, field: string, key: string) => () =>
    count(db().collectionGroup(group).where(field, "==", key));

  const buckets = bucketStarts(from, to, bucket);
  const messages = buckets.map((t) => () => {
    const [a, b] = bucketBounds(t, bucket);
    return count(
      db()
        .collectionGroup("messages")
        .where("createdAt", ">=", ts(Math.max(a, from)))
        .where("createdAt", "<", ts(Math.min(b, to + 1))),
    );
  });

  // Mood: counted and averaged by the database. Not one check-in, and never a
  // note, is read into this function — and only for a month's wellbeing
  // figures, the one place they are shown.
  const moodIn = (a: number, b: number) =>
    db().collectionGroup("moodEntries").where("recordedAt", ">=", ts(a)).where("recordedAt", "<=", ts(b));
  const moodSummary = async (a: number, b: number) => {
    const snap = await moodIn(a, b)
      .aggregate({ n: AggregateField.count(), average: AggregateField.average("score") })
      .get();
    return { n: snap.data().n, average: snap.data().average ?? null };
  };
  const readMood = async (): Promise<StatsRows["counts"]["mood"]> => {
    if (range.preset !== "month") return null;
    const [byScore, weekly, all] = await Promise.all([
      inBatches(
        [1, 2, 3, 4, 5].map((score) => () =>
          count(
            db()
              .collectionGroup("moodEntries")
              .where("score", "==", score)
              .where("recordedAt", ">=", ts(from))
              .where("recordedAt", "<=", ts(to)),
          ),
        ),
      ),
      inBatches(
        weeks.map((t) => () => {
          const [a, b] = bucketBounds(t, "week");
          return moodSummary(Math.max(a, from), Math.min(b - 1, to));
        }),
      ),
      moodSummary(from, to),
    ]);
    return { byScore, average: all.average, weekly: weeks.map((t, i) => ({ t, ...weekly[i] })) };
  };

  const [rolling, dau, wau, mau, chat, mood, queues] = await Promise.all([
    inBatches([activeSince(DAY_MS), activeSince(7 * DAY_MS), activeSince(30 * DAY_MS)]),
    inBatches(dauDays.map((t) => marker(PRESENCE_DAYS, "day", dayKey(t)))),
    inBatches(weeks.map((t) => marker(PRESENCE_WEEKS, "week", dayKey(t)))),
    inBatches(months.map((t) => marker(PRESENCE_MONTHS, "month", monthKey(t)))),
    inBatches(messages),
    readMood(),
    inBatches([
      () => count(db().collection("providerApplications").where("status", "in", ["submitted", "in_review"])),
      // Everything not yet resolved, as the support inbox counts it — older
      // requests filed before the form set a status are new ones too.
      async () =>
        (await count(db().collection("supportRequests"))) -
        (await count(db().collection("supportRequests").where("status", "==", "resolved"))),
      () => count(db().collection("payments").where("needsReview", "==", true)),
      () => count(db().collection("payouts").where("needsReview", "==", true)),
      () => count(db().collection("bookings").where("disputed", "==", true)),
    ]),
  ]);

  const at = (starts: number[], values: number[]): CountAt[] => starts.map((t, i) => ({ t, n: values[i] }));
  return {
    activeDay: rolling[0],
    activeWeek: rolling[1],
    activeMonth: rolling[2],
    dau: at(dauDays, dau),
    wau: at(weeks, wau),
    mau: at(months, mau),
    chatMessages: at(buckets, chat),
    mood,
    queues: {
      applications: queues[0],
      support: queues[1],
      payments: queues[2],
      payouts: queues[3],
      sessions: queues[4],
    },
  };
}

/** Everything composeStats needs, read with the fields it needs and no others. */
async function readRows(range: ResolvedRange, excluded: Set<string>, now: number): Promise<StatsRows> {
  const { previousFrom, from, to } = range;
  const days = bucketStarts(from, to, "day").map((t) => db().collection(TRAFFIC).doc(dayKey(t)));
  const trafficDocs = async () => {
    const out: FirebaseFirestore.DocumentSnapshot[] = [];
    for (let i = 0; i < days.length; i += 100) out.push(...(await db().getAll(...days.slice(i, i + 100))));
    return out;
  };

  // What people told TALK about themselves is read only for a month's
  // wellbeing figures; every other range needs no more than whether and when
  // they got started.
  const userFields = [
    "role",
    "createdAt",
    "onboarded",
    "consents.spokenConsentAt",
    "intake.language",
    "intake.completedAt",
    ...(range.preset === "month"
      ? [
          "intake.ageRange",
          "intake.location",
          "intake.gender",
          "intake.concerns",
          "intake.servicesWanted",
          "intake.providerGender",
        ]
      : []),
  ];

  const [users, payments, refunds, bookings, refundDue, entitlements, payouts, profiles, applications, talk, calls, traffic, counts, since] =
    await Promise.all([
      db()
        .collection(USERS)
        .select(...userFields)
        .get(),
      db()
        .collection("payments")
        .where("createdAt", ">=", previousFrom)
        .where("createdAt", "<=", to)
        .select("uid", "purpose", "status", "provider", "amountMinor", "bookingId", "createdAt")
        .get(),
      db().collection("payments").where("review.decision", "==", "refunded").select("uid", "amountMinor", "review.at").get(),
      db()
        .collection("bookings")
        .where("createdAt", ">=", previousFrom)
        .where("createdAt", "<=", to)
        .select("patientId", "providerId", "status", "paymentStatus", "disputed", "amountMinor", "createdAt", "endsAt")
        .get(),
      db().collection("bookings").where("refundDue", "==", true).select("patientId", "providerId", "amountMinor", "review.at").get(),
      db().collection("entitlements").select("aiTier", "status", "expiresAt", "startedAt", "endsAt").get(),
      db()
        .collection("payouts")
        .where("createdAt", ">=", from)
        .where("createdAt", "<=", to)
        .select("providerId", "status", "amountMinor", "createdAt")
        .get(),
      db().collection("providerProfiles").select("status", "sample").get(),
      db().collection("providerApplications").select("status").get(),
      db().collection(TALK_STATS).where("startedAt", ">=", previousFrom).where("startedAt", "<=", to).get(),
      // When each session's call was first joined and last hung up — never
      // its offer, answer or connection details.
      db()
        .collection(CALLS)
        .where("firstJoinedAt", ">=", ts(from))
        .where("firstJoinedAt", "<=", ts(to))
        .select("participants", "firstJoinedAt", "endedAt")
        .get(),
      trafficDocs(),
      readCounts(range, now),
      recordingSince(),
    ]);

  return {
    excluded,
    users: users.docs.map((d) => toUserRow(d.id, d.data())),
    payments: payments.docs.map((d) => ({
      id: d.id,
      uid: str(d.get("uid")),
      purpose: str(d.get("purpose")),
      status: str(d.get("status")),
      provider: str(d.get("provider")),
      amountMinor: num(d.get("amountMinor")),
      bookingId: str(d.get("bookingId")),
      createdAt: millisOf(d.get("createdAt")),
    })),
    refunds: refunds.docs.map((d) => ({
      id: d.id,
      uid: str(d.get("uid")),
      amountMinor: num(d.get("amountMinor")),
      at: millisOf(d.get("review.at")),
    })),
    bookings: bookings.docs.map((d) => ({
      id: d.id,
      patientId: str(d.get("patientId")),
      providerId: str(d.get("providerId")),
      status: str(d.get("status")),
      paymentStatus: str(d.get("paymentStatus")),
      disputed: d.get("disputed") === true,
      amountMinor: num(d.get("amountMinor")),
      createdAt: millisOf(d.get("createdAt")),
      endsAt: millisOf(d.get("endsAt")),
    })),
    refundDue: refundDue.docs.map((d) => ({
      id: d.id,
      patientId: str(d.get("patientId")),
      providerId: str(d.get("providerId")),
      amountMinor: num(d.get("amountMinor")),
      at: millisOf(d.get("review.at")),
    })),
    entitlements: entitlements.docs.map((d) => ({
      uid: d.id,
      aiTier: str(d.get("aiTier")),
      status: str(d.get("status")),
      expiresAt: millisOf(d.get("expiresAt")),
      startedAt: millisOf(d.get("startedAt")),
      endsAt: millisOf(d.get("endsAt")),
    })),
    payouts: payouts.docs.map((d) => ({
      id: d.id,
      providerId: str(d.get("providerId")),
      status: str(d.get("status")),
      amountMinor: num(d.get("amountMinor")),
      createdAt: millisOf(d.get("createdAt")),
    })),
    profiles: profiles.docs.map((d) => ({ id: d.id, status: str(d.get("status")), sample: d.get("sample") === true })),
    applications: applications.docs.map((d) => ({ id: d.id, status: str(d.get("status")) })),
    talk: talk.docs.map((d) => d.data() as TalkSessionDoc),
    calls: calls.docs.map((d) => ({
      id: d.id,
      participants: strings(d.get("participants")),
      firstJoinedAt: millisOf(d.get("firstJoinedAt")),
      endedAt: millisOf(d.get("endedAt")),
    })),
    traffic: traffic
      .filter((d) => d.exists)
      .map((d) => ({
        day: d.id,
        views: num(d.get("views")),
        visits: num(d.get("visits")),
        byPath: Object.fromEntries(
          Object.entries((d.get("byPath") ?? {}) as Record<string, unknown>).map(([page, n]) => [page, num(n)]),
        ),
      })),
    counts,
    recordingSince: since,
  };
}

/**
 * Staff: every figure for a range, or (`liveOnly`) just who is here now.
 *
 *   { range: "7d" | "30d" | "90d" | "12m" | { from, to } }  →  AdminStats, wellbeing null
 *   { range: { month: "2026-09" } }                         →  AdminStats, with wellbeing
 *   { liveOnly: true }                                      →  { live: LiveStats }
 *
 * The wellbeing figures — who people are and what they are struggling with —
 * come only for a whole month that has ended (see composeWellbeing), and the
 * answers about the person in each intake are read only then.
 *
 * A range's figures are kept five minutes in adminStatsCache, so a staff
 * member clicking between pages does not have the database counted again
 * each time. The live strip is read fresh on every call.
 */
export const adminStats = onCall({ ...CALLABLE, memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await requireStaff(request);
  const input = (request.data ?? {}) as { range?: unknown; liveOnly?: unknown };
  const now = Date.now();
  const excluded = await excludedAccounts();
  const live = await readLive(excluded, now);
  if (input.liveOnly === true) return { live };

  let range: ResolvedRange;
  try {
    range = resolveRange(input.range, now);
  } catch (error) {
    throw new HttpsError("invalid-argument", (error as Error).message);
  }

  const cacheRef = db().collection(CACHE).doc(range.key);
  const kept = await cacheRef.get();
  if (kept.exists && kept.get("shape") === CACHE_SHAPE && now - num(kept.get("computedAt")) < STATS_CACHE_MS) {
    const body = JSON.parse(String(kept.get("body"))) as AdminStatsBody;
    return { ...body, live, cached: true } satisfies AdminStats;
  }

  const body = composeStats(await readRows(range, excluded, now), range, now);
  // A JSON string, because the heatmap is an array of arrays, which Firestore
  // cannot store as a value.
  await cacheRef.set({
    body: JSON.stringify(body),
    shape: CACHE_SHAPE,
    computedAt: now,
    expireAt: ts(now + STATS_CACHE_MS + DAY_MS),
  });
  return { ...body, live, cached: false } satisfies AdminStats;
});
