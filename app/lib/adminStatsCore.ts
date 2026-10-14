/**
 * The staff statistics: what the numbers are, and how they are worked out so
 * that none of them can point at a person.
 *
 * Pure on purpose — no Firebase, no React — so the same code runs in the
 * adminStats Cloud Function (functions/src/adminStats.ts reads the database,
 * maps each document to one of the plain rows below and hands them here), in
 * the browser (which only ever sees the finished numbers), and in a plain
 * `node` test (scripts/test-admin-stats.mts). Listed in functions/tsconfig.json.
 *
 * Four rules run through everything here:
 *
 *  - SMALL GROUPS ARE WITHHELD. Any count of people, or of what they did, from
 *    1 to K_ANONYMITY − 1 is sent as null with `suppressed: true` and shown as
 *    "<5". Zero is shown: "nobody" points at nobody. Where the parts of a
 *    total are shown beside the total, a second part is withheld too, so the
 *    hidden one cannot be worked out by subtraction (suppressPartition).
 *  - WHO PEOPLE ARE COMES BY THE MONTH. The wellbeing figures — concerns, age,
 *    gender, region, mood, safety — are only worked out for one whole UTC
 *    month that has ended, so two answers can never be set against each other
 *    to leave a single day's people (composeWellbeing).
 *  - MONEY AND QUEUES ARE NOT WITHHELD. Staff already list every payment,
 *    payout and waiting item one by one in the review screens, and need the
 *    exact figures to reconcile with Modem Pay and to work the queues; hiding
 *    them here would protect nobody.
 *  - NOTHING PERSONAL GOES IN. Rows carry enum answers, times and amounts —
 *    never a name, an email, a note or anything somebody wrote or said — and
 *    the uids they carry for joining and excluding are never copied into the
 *    result.
 *
 * Gambian time is UTC, so every day, week and hour here is a UTC one. Weeks
 * start on Monday.
 */

import { AI_TIERS, AI_WINDOW_GRACE, MOOD_LABELS, normaliseRole, type AiTierId, type MoodScore } from "./models";
import {
  AGE_LABELS,
  AGE_RANGES,
  AREAS,
  AREA_LABELS,
  GENDER_PREFS,
  SERVICES,
  SERVICE_LABELS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  USER_GENDERS,
  USER_GENDER_LABELS,
  type Specialization,
} from "./matching";
import { LANGUAGES, LANGUAGE_LABEL, type Language } from "./ai/protocol";
import { platformFeeMinor } from "./money";
import { SLOT_MINUTES } from "./providerApplication";

// ----------------------------------------------------------------- constants

/** Counts from 1 to K_ANONYMITY − 1 are withheld. */
export const K_ANONYMITY = 5;
/** What a withheld count reads as. */
export const SUPPRESSED_TEXT = `<${K_ANONYMITY}`;

/** "On the site now" and "in the app now": seen within the last two minutes. */
export const LIVE_WINDOW_MS = 2 * 60_000;
/** How often an open page says it is still there. */
export const HEARTBEAT_MS = 60_000;
/** A tab quiet for this long is a new visit when it speaks again. */
export const VISIT_GAP_MS = 30 * 60_000;
/** A TALK conversation with no end reported is "now" for this long. Longer than any paid window. */
export const TALKING_WINDOW_MS = 35 * 60_000;
/** How long one range's statistics are kept before they are worked out again. */
export const STATS_CACHE_MS = 5 * 60_000;

export const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Where in the app somebody signed in is. */
export const PRESENCE_AREAS = ["app", "talk", "chat", "call"] as const;
export type PresenceArea = (typeof PRESENCE_AREAS)[number];
export const PRESENCE_AREA_LABELS: Record<PresenceArea, string> = {
  app: "Around the app",
  talk: "With TALK",
  chat: "In messages",
  call: "In a session call",
};

/** How somebody talked with TALK: out loud, by keyboard, or both. */
export const TALK_MODES = ["voice", "typed", "mixed"] as const;
export type TalkMode = (typeof TALK_MODES)[number];

export const TALK_KINDS = ["intake", "companion"] as const;
export type TalkKind = (typeof TALK_KINDS)[number];

/**
 * How serious the danger TALK sensed in a conversation was, at its highest:
 * the two of her four safety levels that mean danger (RISK_LEVELS in
 * app/lib/ai/protocol.ts). Kept with the conversation's numbers so staff can
 * see how often each comes up — never with who, or what was said.
 */
export const TALK_RISKS = ["elevated", "urgent"] as const;
export type TalkRisk = (typeof TALK_RISKS)[number];

/** The higher of two danger levels; null for none. */
export function higherRisk(a: TalkRisk | null, b: TalkRisk | null): TalkRisk | null {
  if (a === "urgent" || b === "urgent") return "urgent";
  return a ?? b;
}

// ---------------------------------------------------------------------- time

const pad2 = (n: number) => String(n).padStart(2, "0");

export function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** The Monday that starts the UTC week `ms` falls in. */
export function startOfUtcWeek(ms: number): number {
  const day = startOfUtcDay(ms);
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return day - sinceMonday * DAY_MS;
}

export function startOfUtcMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** "2026-10-14" */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** "2026-10" */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** "2026-10-14" back to the start of that UTC day; NaN for anything else. */
export function parseDayKey(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

/** Times are kept to the minute where a second would help pick somebody out. */
export function floorToMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

/**
 * The ids of the activity markers a signed-in person writes (see the
 * presence block in firestore.rules): the day, the Monday of the week, and
 * the month they were last here.
 */
export function presenceKeys(ms: number): { day: string; week: string; month: string } {
  return { day: dayKey(ms), week: dayKey(startOfUtcWeek(ms)), month: monthKey(ms) };
}

/** Monday 0 … Sunday 6, hour 0–23, in UTC. */
export function hourOfWeek(ms: number): { day: number; hour: number } {
  const d = new Date(ms);
  return { day: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours() };
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => pad2(h));

export type Bucket = "day" | "week" | "month";

export function bucketStart(ms: number, bucket: Bucket): number {
  return bucket === "day" ? startOfUtcDay(ms) : bucket === "week" ? startOfUtcWeek(ms) : startOfUtcMonth(ms);
}

function nextBucket(start: number, bucket: Bucket): number {
  if (bucket === "day") return start + DAY_MS;
  if (bucket === "week") return start + WEEK_MS;
  const d = new Date(start);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** The start of every bucket that overlaps [from, to], oldest first. */
export function bucketStarts(from: number, to: number, bucket: Bucket): number[] {
  const out: number[] = [];
  for (let t = bucketStart(from, bucket); t <= to; t = nextBucket(t, bucket)) out.push(t);
  return out;
}

/** [start, end) of the bucket that starts at `start`. */
export function bucketBounds(start: number, bucket: Bucket): [number, number] {
  return [start, nextBucket(start, bucket)];
}

/** A Firestore Timestamp, epoch milliseconds or nothing, as milliseconds or null. */
export function millisOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// -------------------------------------------------------------------- ranges

export const RANGE_PRESETS = ["7d", "30d", "90d", "12m"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
/**
 * A preset, your own days, or one whole UTC month that has ended ("2026-09")
 * — the only kind the wellbeing figures are given for (see composeStats).
 */
export type StatsRangeInput = RangePreset | { from: number; to: number } | { month: string };

export type ResolvedRange = {
  preset: RangePreset | "custom" | "month";
  /** The cache key: the preset and the day it ends, the custom days, or the month. */
  key: string;
  /** Start of the first day, ms (UTC). */
  from: number;
  /** End of the last day, ms (UTC), never later than the end of today. */
  to: number;
  days: number;
  /** How the time series are grouped: by day up to 92 days, by week up to 400, then by month. */
  bucket: Bucket;
  /** The same number of days immediately before (for a month, the month before), for the change figures. */
  previousFrom: number;
  previousTo: number;
};

/** Nothing before TALK existed; nothing longer than two years in one go. */
const EARLIEST = Date.UTC(2025, 0, 1);
const LONGEST_DAYS = 731;
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * The months the wellbeing figures can be asked for, newest first: every
 * whole UTC month that has ended, back to when TALK began.
 */
export function wellbeingMonths(now: number): string[] {
  const out: string[] = [];
  for (let t = startOfUtcMonth(startOfUtcMonth(now) - 1); t >= EARLIEST; t = startOfUtcMonth(t - 1)) out.push(monthKey(t));
  return out;
}

/**
 * A range the dashboard asked for, as UTC days. Each preset counts today as
 * its last day, exactly as the DateRangePicker does, so "7 days" is today and
 * the six before it. A month is the whole of it, and only once it has ended.
 * Throws a RangeError for anything else.
 */
export function resolveRange(input: unknown, now: number): ResolvedRange {
  const today = startOfUtcDay(now);
  const endOfToday = today + DAY_MS - 1;
  let preset: RangePreset | "custom" | "month";
  let from: number;
  let to = endOfToday;

  const month = input && typeof input === "object" ? (input as { month?: unknown }).month : undefined;
  if (month !== undefined) {
    const m = typeof month === "string" ? MONTH_KEY.exec(month) : null;
    if (!m) throw new RangeError("Choose a month.");
    const year = Number(m[1]);
    const index = Number(m[2]) - 1;
    from = Date.UTC(year, index, 1);
    const next = Date.UTC(year, index + 1, 1);
    if (from < EARLIEST) throw new RangeError("The month is before TALK began.");
    // A month still under way grows by a day at a time, and the difference
    // between two days of it is one day's people: it is shown once it ends.
    if (next > now) throw new RangeError("A month's figures are given once it has ended.");
    const days = Math.round((next - from) / DAY_MS);
    return {
      preset: "month",
      key: `month:${monthKey(from)}`,
      from,
      to: next - 1,
      days,
      bucket: "day",
      previousFrom: Date.UTC(year, index - 1, 1),
      previousTo: from - 1,
    };
  }

  if (typeof input === "string" && (RANGE_PRESETS as readonly string[]).includes(input)) {
    preset = input as RangePreset;
    if (preset === "12m") {
      const d = new Date(today);
      from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, d.getUTCDate() + 1);
    } else {
      from = today - (Number.parseInt(preset, 10) - 1) * DAY_MS;
    }
  } else if (
    input &&
    typeof input === "object" &&
    Number.isFinite((input as { from?: unknown }).from) &&
    Number.isFinite((input as { to?: unknown }).to)
  ) {
    preset = "custom";
    const raw = input as { from: number; to: number };
    from = startOfUtcDay(raw.from);
    to = Math.min(startOfUtcDay(raw.to) + DAY_MS - 1, endOfToday);
    if (from > to) throw new RangeError("The range ends before it starts.");
    if (from < EARLIEST) throw new RangeError("The range starts before TALK began.");
    if ((to + 1 - from) / DAY_MS > LONGEST_DAYS) throw new RangeError("Choose two years or less.");
  } else {
    throw new RangeError("Choose 7 days, 30 days, 90 days, 12 months or your own dates.");
  }

  const days = Math.round((to + 1 - from) / DAY_MS);
  return {
    preset,
    key: preset === "custom" ? `custom:${dayKey(from)}:${dayKey(to)}` : `${preset}:${dayKey(today)}`,
    from,
    to,
    days,
    bucket: days <= 92 ? "day" : days <= 400 ? "week" : "month",
    previousFrom: from - days * DAY_MS,
    previousTo: from - 1,
  };
}

// ---------------------------------------------------------- the result (DTO)

/** One part of a breakdown. `value` is null exactly when it is withheld. */
export type Category = { key: string; label: string; value: number | null; suppressed: boolean };

/** A single count that may be withheld. */
export type Cell = { value: number | null; suppressed: boolean };

/**
 * One point of a time series; `t` is the bucket's start (ms, UTC). `value`
 * null with `suppressed` false means there is nothing to show — a mood
 * average for a week nobody checked in, say.
 */
export type SeriesPoint = { t: number; value: number | null; suppressed: boolean };

export type Series = { key: string; label: string; points: SeriesPoint[] };

/** A proportion. Withheld when either side of it is a small group. */
export type Share = {
  numerator: number | null;
  denominator: number | null;
  /** 0–1. */
  rate: number | null;
  suppressed: boolean;
};

/** A headline number: this period, the one before, and how it moved. */
export type Metric = {
  value: number | null;
  suppressed: boolean;
  previous: number | null;
  /** value − previous; null when either is withheld or unknown. */
  delta: number | null;
  /** delta ÷ previous, 0.25 for a quarter up; null when previous is 0 or unknown. */
  deltaRate: number | null;
  /** The same figure per bucket, for the sparkline. */
  spark: SeriesPoint[];
};

export type LiveStats = {
  at: number;
  windowSec: number;
  visitorsNow: Cell;
  visitorsByPage: Category[];
  signedInNow: Cell;
  signedInByArea: Category[];
  talkingNow: Cell;
};

export type Headline = {
  newPeople: Metric;
  talkConversations: Metric;
  /** Seconds. */
  medianTalkSec: Metric;
  paidConversations: Metric;
  bookings: Metric;
  /** Bututs, net of refunds. Never withheld. */
  revenueMinor: Metric;
};

export type PeopleStats = {
  /** Everyone with an account now, by role. Staff, sample and test accounts are left out. */
  byRole: Category[];
  total: Cell;
  providersByApplicationStatus: Category[];
  newSignups: Cell;
  /**
   * Per bucket of the range. One grain only: a second, coarser series of the
   * same sign-ups would let a withheld day be worked out from its week.
   */
  signupsByBucket: SeriesPoint[];
  /** Of the patients who signed up in the range, how many finished getting to know TALK. */
  onboarded: Share;
  onboardedAllTime: Share;
  /** People seen in the app in the last 24 hours, 7 days and 30 days, counted now. */
  active: { day: Cell; week: Cell; month: Cell };
  /** Daily actives — the last 92 days of the range at most. */
  dau: SeriesPoint[];
  /** Weekly actives, one point per Monday-to-Sunday week. */
  wau: SeriesPoint[];
  /** Monthly actives, one point per calendar month. */
  mau: SeriesPoint[];
};

export type HoldingsStats = {
  /** Paid TALK conversations people hold now: ready to start, in use, used, lapsed unused. */
  talkPasses: Category[];
  /** Of those ready or in use, by what was bought. */
  talkActiveByTier: Category[];
  /** Bought in the range. */
  paidFirstConversations: Cell;
  paidLongerTalks: Cell;
  /** Provider sessions booked in the range, by where they stand now. */
  bookingsByStatus: Category[];
  bookingsTotal: Cell;
  /** Provider listings now, sample listings left out. */
  providersByStatus: Category[];
};

export type PaymentPurpose = "ai_initial" | "ai_extended" | "session_fee";

export type MoneyStats = {
  currency: "GMD";
  /** Bututs received in the range. */
  grossMinor: number;
  refundsMinor: number;
  refundsCount: number;
  netMinor: number;
  /** What TALK keeps: TALK conversations in full, and the platform fee on provider sessions. */
  platformFeeMinor: number;
  byPurpose: { key: PaymentPurpose; label: string; amountMinor: number; count: number }[];
  /** Received per bucket, by purpose, in bututs. */
  series: { key: PaymentPurpose; label: string; points: { t: number; amountMinor: number }[] }[];
  payouts: {
    sentMinor: number;
    sentCount: number;
    pendingMinor: number;
    pendingCount: number;
    failedMinor: number;
    failedCount: number;
  };
};

export type EngagementStats = {
  /** TALK conversations started in the range. */
  conversations: Cell;
  conversationsByBucket: SeriesPoint[];
  byKind: Category[];
  /** How many had an end reported, and so a length. */
  measured: Cell;
  medianSec: number | null;
  p90Sec: number | null;
  durationHistogram: Category[];
  completion: Share;
  /** Of the `measured` conversations: spoken, typed, both, or ended before the person answered at all. */
  byMode: Category[];
  byLanguage: Category[];
  /** Conversations started, by weekday (rows, Monday first) and hour (columns), UTC. Null = withheld. */
  hourOfWeek: { rows: string[]; cols: string[]; values: (number | null)[][] };
  /**
   * Session calls with providers whose room was first opened in the range,
   * timed from the first person joining to the last hanging up. Lengths are
   * only given for K_ANONYMITY calls or more.
   */
  providerCalls: {
    calls: Cell;
    /** How many had a hang-up recorded, and so a length. */
    measured: Cell;
    medianSec: number | null;
    p90Sec: number | null;
    durationHistogram: Category[];
  };
  /** Messages sent between people and providers — counted, never read. */
  chatMessages: Cell;
  chatMessagesByBucket: SeriesPoint[];
  /** The public site. A visit is a tab's stay, ended by half an hour's quiet. */
  traffic: {
    views: Cell;
    visits: Cell;
    viewsByBucket: SeriesPoint[];
    byPage: Category[];
  };
};

export type FunnelStepKey = "visitors" | "signedUp" | "startedTalk" | "paidFirst" | "matched" | "booked" | "attended";

export type FunnelStep = { key: FunnelStepKey; label: string; value: number | null; suppressed: boolean };

/**
 * Only ever for one whole month that has ended, each month worked out and
 * withheld on its own (see composeStats): a breakdown of the people in a
 * range that could be moved a day at a time would give away, by subtraction,
 * the people of a single day.
 */
export type WellbeingStats = {
  /** People whose conversation with TALK reached its end in the month. Every breakdown below is of them. */
  population: Cell;
  concerns: Category[];
  servicesWanted: Category[];
  /**
   * TALK conversations per week touching each topic, largest first: the
   * concerns heard while getting to know somebody, and the topics TALK tagged
   * a later conversation with, from the same fixed list. The first and last
   * weeks are cut at the month's edges.
   */
  topicsByWeek: Series[];
  providerGender: Category[];
  ageBands: Category[];
  gender: Category[];
  regions: Category[];
  languages: Category[];
  mood: {
    entries: Cell;
    /** 1 (struggling) to 5 (great); null when fewer than K_ANONYMITY check-ins. */
    average: number | null;
    distribution: Category[];
    weeklyAverage: SeriesPoint[];
    weeklyEntries: SeriesPoint[];
  };
  /** TALK conversations in which she judged there might be danger. */
  safetyFlaggedConversations: Cell;
  /** The same conversations, by the highest level she rated them: the parts of safetyFlaggedConversations. */
  safetyByRisk: Category[];
};

export type QueueItem = { key: string; label: string; count: number; href: string };

export type AdminStats = {
  generatedAt: number;
  /** True when the range's figures came from the five-minute store. `live` is always fresh. */
  cached: boolean;
  range: ResolvedRange;
  k: number;
  /** When each new signal began recording (ms), so an empty chart can say why. */
  recordingSince: {
    talkSessions: number | null;
    presence: number | null;
    traffic: number | null;
    providerCalls: number | null;
  };
  live: LiveStats;
  headline: Headline;
  people: PeopleStats;
  holdings: HoldingsStats;
  money: MoneyStats;
  engagement: EngagementStats;
  funnel: FunnelStep[];
  /** Null unless the range is one whole month that has ended. */
  wellbeing: WellbeingStats | null;
  /** Waiting on a person now. Never withheld: these are work, not people. */
  queues: QueueItem[];
};

/** Everything but the live strip — what the five-minute store holds. */
export type AdminStatsBody = Omit<AdminStats, "live" | "cached">;

// --------------------------------------------------------------- suppression

const isSmall = (n: number, k: number) => n > 0 && n < k;

export function cell(n: number, k = K_ANONYMITY): Cell {
  return isSmall(n, k) ? { value: null, suppressed: true } : { value: n, suppressed: false };
}

/**
 * Withhold the small parts of something whose total is shown.
 *
 * Every part from 1 to k − 1 is withheld. Then, because a total minus the
 * parts on show gives back whatever was hidden: while exactly one part is
 * hidden, or the hidden parts add up to fewer than k, the smallest part still
 * on show is withheld as well. Zeros stay — there is nobody in them to find.
 */
export function suppressPartition(values: number[], k = K_ANONYMITY): (number | null)[] {
  return suppressGroups(values, [values.map((_, i) => i)], k);
}

/**
 * The second half of suppressPartition for one group of cells whose total
 * can be known: hide the smallest part on show until what is hidden in the
 * group is two parts or more and at least k people. True if anything moved.
 */
function withholdInGroup(values: number[], out: (number | null)[], group: readonly number[], k: number): boolean {
  let changed = false;
  for (;;) {
    let count = 0;
    let sum = 0;
    for (const i of group) {
      if (out[i] === null) {
        count += 1;
        sum += values[i];
      }
    }
    if (count === 0 || (count > 1 && sum >= k)) return changed;
    let pick = -1;
    for (const i of group) {
      if (out[i] !== null && values[i] > 0 && (pick < 0 || values[i] < values[pick])) pick = i;
    }
    if (pick < 0) return changed;
    out[pick] = null;
    changed = true;
  }
}

/**
 * Withhold small cells where several totals over them can be known — not
 * just the grand total but sub-totals shown elsewhere, like the weekday rows
 * of the hour-of-week grid, which add up to days the conversations-per-day
 * chart shows. `groups` lists the cells under each known total (by index).
 * Hiding a cell for one group can leave another with a single hidden cell,
 * so it goes round until no group gives anything away.
 */
export function suppressGroups(values: number[], groups: readonly (readonly number[])[], k = K_ANONYMITY): (number | null)[] {
  const out: (number | null)[] = values.map((v) => (isSmall(v, k) ? null : v));
  // The narrowest totals first: a cell hidden to cover a row usually covers
  // the whole grid too, where one hidden for the whole could land anywhere.
  const narrowestFirst = [...groups].sort((a, b) => a.length - b.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of narrowestFirst) changed = withholdInGroup(values, out, group, k) || changed;
  }
  return out;
}

/**
 * A breakdown. `partition` says the parts are a split of one total shown
 * elsewhere (each person in exactly one part), which is when a hidden part
 * could be subtracted back out; a multi-select breakdown (concerns, services)
 * is not one.
 */
export function categories(
  entries: readonly (readonly [key: string, label: string, count: number])[],
  { partition, k = K_ANONYMITY }: { partition: boolean; k?: number },
): Category[] {
  const counts = entries.map((e) => e[2]);
  const shown = partition ? suppressPartition(counts, k) : counts.map((n) => cell(n, k).value);
  return entries.map(([key, label], i) => ({ key, label, value: shown[i], suppressed: shown[i] === null }));
}

/** A count per bucket. As a partition when the total of the range is shown beside it. */
export function series(
  starts: number[],
  counts: number[],
  { partition, k = K_ANONYMITY }: { partition: boolean; k?: number },
): SeriesPoint[] {
  const shown = partition ? suppressPartition(counts, k) : counts.map((n) => cell(n, k).value);
  return starts.map((t, i) => ({ t, value: shown[i], suppressed: shown[i] === null }));
}

export function share(numerator: number, denominator: number, k = K_ANONYMITY): Share {
  if (isSmall(denominator, k) || isSmall(numerator, k) || isSmall(denominator - numerator, k)) {
    return { numerator: null, denominator: isSmall(denominator, k) ? null : denominator, rate: null, suppressed: true };
  }
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null, suppressed: false };
}

/** Linear interpolation between the nearest ranks (Excel's PERCENTILE.INC). Null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/** A median that is only given for k or more values: a median of three is one person's number. */
function guardedMedian(values: readonly number[], k: number): number | null {
  const m = values.length >= k ? percentile(values, 0.5) : null;
  return m === null ? null : Math.round(m);
}

function metric(current: Cell, previous: Cell, spark: SeriesPoint[]): Metric {
  const delta = current.value !== null && previous.value !== null ? current.value - previous.value : null;
  return {
    value: current.value,
    suppressed: current.suppressed,
    previous: previous.value,
    delta,
    deltaRate: delta !== null && previous.value ? delta / previous.value : null,
    spark,
  };
}

/** A figure that is never withheld (money). */
const open = (n: number): Cell => ({ value: n, suppressed: false });

// ----------------------------------------------------------------- exclusion

/**
 * Records made by the smoke tests and the sample directory. Smoke tests name
 * their accounts `smoke-…` and their payments, payouts and bookings
 * `pi_smoke_…`, `po_smoke_…`, `bk_smoke_…` or `smoke-…`; sample providers are
 * `sample-…` (scripts/seed-sample-providers.mjs).
 */
const TEST_ID = /^(smoke|sample)-|^(pi|po|bk)_smoke_/;

export function isTestId(id: string | null | undefined): boolean {
  return typeof id === "string" && TEST_ID.test(id);
}

/**
 * Left out of every figure: staff, the owners of sample listings (the demo
 * provider from scripts/seed-demo.mjs among them), and test accounts.
 * `excluded` holds the first two, found by the function each time.
 */
export function isExcludedUid(uid: string | null | undefined, excluded: ReadonlySet<string>): boolean {
  return !uid || isTestId(uid) || excluded.has(uid);
}

// ------------------------------------------------------------- site traffic

/** The public pages the site counts, plus the signed-in app as one place. */
export const PAGE_KEYS = [
  "home",
  "about",
  "how-it-works",
  "pricing",
  "providers",
  "provider",
  "for-providers",
  "for-institutions",
  "resources",
  "resource",
  "community",
  "crisis",
  "safety",
  "support",
  "technology",
  "privacy",
  "terms",
  "talk",
  "sign-in",
  "sign-up",
  "onboarding",
  "paid",
  "apply",
  "app",
  "other",
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  home: "Home",
  about: "About",
  "how-it-works": "How it works",
  pricing: "Pricing",
  providers: "Provider directory",
  provider: "A provider's page",
  "for-providers": "For providers",
  "for-institutions": "For institutions",
  resources: "Resources",
  resource: "A resource",
  community: "Community",
  crisis: "Emergency numbers",
  safety: "Safety",
  support: "Support",
  technology: "Technology",
  privacy: "Privacy",
  terms: "Terms",
  talk: "TALK",
  "sign-in": "Sign in",
  "sign-up": "Sign up",
  onboarding: "Getting started",
  paid: "Back from paying",
  apply: "Provider applications",
  app: "Signed-in app",
  other: "Other",
};

const ONE_SEGMENT: Record<string, PageKey> = {
  about: "about",
  "how-it-works": "how-it-works",
  plans: "pricing",
  providers: "providers",
  "for-providers": "for-providers",
  "for-institutions": "for-institutions",
  resources: "resources",
  community: "community",
  crisis: "crisis",
  safety: "safety",
  support: "support",
  technology: "technology",
  privacy: "privacy",
  terms: "terms",
  talk: "talk",
  "sign-in": "sign-in",
  "sign-up": "sign-up",
  onboarding: "onboarding",
  paid: "paid",
};

/** The signed-in app's first path segments: counted together, never page by page. */
const APP_SEGMENTS = new Set([
  "dashboard",
  "chats",
  "matches",
  "mood",
  "journal",
  "sessions",
  "settings",
  "book",
  "call",
  "pro",
]);

/**
 * A path as one of PAGE_KEYS. The query and fragment are dropped (they can
 * carry anything), a provider's or resource's own page is counted as "a
 * provider's page" rather than by id, and anything not known is "other".
 */
export function normalisePath(raw: unknown): PageKey {
  if (typeof raw !== "string" || raw.length > 512 || !raw.startsWith("/")) return "other";
  const path = raw.split(/[?#]/)[0].toLowerCase();
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "home";
  const [first] = segments;
  if (segments.length === 1 && ONE_SEGMENT[first]) return ONE_SEGMENT[first];
  if (segments.length === 2 && first === "providers") return "provider";
  if (segments.length === 2 && first === "resources") return "resource";
  if (first === "apply") return "apply";
  if (APP_SEGMENTS.has(first)) return "app";
  return "other";
}

/**
 * Crawlers and tools that run a page's script. A browser always sends a user
 * agent; nothing sending none is a person.
 */
const BOT_AGENT =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|pingdom|uptime|curl|wget|python|httpclient|go-http|java\/|axios|node-fetch|postman|phantom|puppeteer|playwright|selenium/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_AGENT.test(userAgent);
}

/** The live site, this project's Vercel previews, and a local build. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return (
    origin === "https://www.talktherapy.gm" ||
    origin === "https://talktherapy.gm" ||
    /^https:\/\/talktherapy(-[a-z0-9-]+)?\.vercel\.app$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
  );
}

/** A tab's random id, as the beacon accepts it. */
export const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;

// ------------------------------------------------------- TALK conversations

/** What the page reports when a conversation starts and when it ends. */
export type TalkReport = {
  /** A random id the page made for this conversation. Never stored as it is. */
  id: string;
  phase: "start" | "end";
  kind: TalkKind;
  tier: AiTierId;
  language: Language | null;
  /** End only: seconds since it started, by the page's clock. */
  elapsedSec: number;
  /** End only: how many times the person spoke or wrote. */
  turns: number;
  mode: TalkMode | null;
  completed: boolean;
  matched: boolean;
  paid: boolean;
  topics: Specialization[];
  safetyFlagged: boolean;
  /** End only: the highest danger level TALK rated this conversation, if any. */
  risk: TalkRisk | null;
};

/** talkSessionStats/{id} — one conversation, with no uid on it. */
export type TalkSessionDoc = {
  kind: TalkKind;
  tier: AiTierId;
  language: Language | null;
  /** Minute precision. */
  startedAt: number;
  /** Minute precision; null until an end is reported. */
  endedAt: number | null;
  durationSec: number | null;
  turns: number;
  mode: TalkMode | null;
  completed: boolean;
  matched: boolean;
  paid: boolean;
  topics: Specialization[];
  safetyFlagged: boolean;
  /** The highest danger level reported. Absent on records kept before levels were. */
  risk?: TalkRisk | null;
};

export const TALK_REPORT_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_TURNS = 500;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A report from the page, checked field by field. Null when it is not one. */
export function parseTalkReport(raw: unknown): TalkReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const phase = oneOf(r.phase, ["start", "end"] as const);
  if (typeof r.id !== "string" || !TALK_REPORT_ID.test(r.id) || !phase) return null;
  const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const topics = Array.isArray(r.topics)
    ? [...new Set(r.topics.filter((t): t is Specialization => oneOf(t, SPECIALIZATIONS) !== null))]
    : [];
  return {
    id: r.id,
    phase,
    kind: oneOf(r.kind, TALK_KINDS) ?? "companion",
    tier: oneOf(r.tier, ["initial", "extended"] as const) ?? "initial",
    language: oneOf(r.language, LANGUAGES),
    elapsedSec: Math.max(0, Math.round(number(r.elapsedSec))),
    turns: Math.min(MAX_TURNS, Math.max(0, Math.round(number(r.turns)))),
    mode: oneOf(r.mode, TALK_MODES),
    completed: r.completed === true,
    matched: r.matched === true,
    paid: r.paid === true,
    topics,
    safetyFlagged: r.safetyFlagged === true,
    risk: oneOf(r.risk, TALK_RISKS),
  };
}

/** The longest a conversation can be: its paid length, with the same grace the server allows. */
export function maxTalkSec(tier: AiTierId): number {
  return AI_TIERS[tier].durationSec * AI_WINDOW_GRACE;
}

/** A conversation's record when its start is reported. */
export function talkStartDoc(report: TalkReport, now: number): TalkSessionDoc {
  return {
    kind: report.kind,
    tier: report.tier,
    language: report.language,
    startedAt: floorToMinute(now),
    endedAt: null,
    durationSec: null,
    turns: 0,
    mode: null,
    completed: false,
    matched: false,
    paid: report.paid,
    topics: report.topics,
    safetyFlagged: report.safetyFlagged,
    risk: report.risk,
  };
}

/**
 * A conversation's record once an end is reported — the first, or another
 * (a page hidden, then closed). Repeating a report changes nothing, and a
 * later one can only add: length and turns only grow, flags only switch on,
 * and the danger level only rises.
 *
 * The length is the page's figure, held to the tier's longest and — when the
 * start was recorded — to the time the server has actually seen pass since,
 * so a page cannot claim an hour it was not there for.
 */
export function talkEndDoc(existing: TalkSessionDoc | null, report: TalkReport, now: number): TalkSessionDoc {
  const tier = existing?.tier ?? report.tier;
  const cap = maxTalkSec(tier);
  const seen = existing ? Math.max(0, Math.floor((now - existing.startedAt) / 1000)) : cap;
  const reported = Math.min(report.elapsedSec, cap, seen);
  return {
    kind: existing?.kind ?? report.kind,
    tier,
    language: report.language ?? existing?.language ?? null,
    startedAt: existing?.startedAt ?? floorToMinute(now - reported * 1000),
    endedAt: floorToMinute(now),
    durationSec: Math.max(existing?.durationSec ?? 0, reported),
    turns: Math.max(existing?.turns ?? 0, report.turns),
    mode: report.mode ?? existing?.mode ?? null,
    completed: Boolean(existing?.completed) || report.completed,
    matched: Boolean(existing?.matched) || report.matched,
    paid: Boolean(existing?.paid) || report.paid,
    topics: [...new Set([...(existing?.topics ?? []), ...report.topics])],
    safetyFlagged: Boolean(existing?.safetyFlagged) || report.safetyFlagged || report.risk !== null,
    risk: higherRisk(existing?.risk ?? null, report.risk),
  };
}

/** How many reports one person may send in a UTC day: a start and an end for forty conversations. */
export const TALK_REPORTS_PER_DAY = 80;

// --------------------------------------------------------------------- rows

/**
 * What the function reads, one plain row per document. Only the fields the
 * statistics need — the function select()s exactly these — and uids only
 * where a join or the exclusion needs them.
 */
export type UserRow = {
  id: string;
  role: string | null;
  createdAt: number | null;
  onboarded: boolean;
  spokenConsentAt: number | null;
  intake: {
    language: string | null;
    ageRange: string | null;
    location: string | null;
    gender: string | null;
    concerns: string[];
    servicesWanted: string[];
    providerGender: string | null;
    completedAt: number | null;
  } | null;
};

export type PaymentRow = {
  id: string;
  uid: string | null;
  purpose: string | null;
  status: string | null;
  provider: string | null;
  amountMinor: number;
  bookingId: string | null;
  createdAt: number | null;
};

/** A payment staff marked refunded, dated by that decision. */
export type RefundRow = { id: string; uid: string | null; amountMinor: number; at: number | null };

export type BookingRow = {
  id: string;
  patientId: string | null;
  providerId: string | null;
  status: string | null;
  paymentStatus: string | null;
  disputed: boolean;
  amountMinor: number;
  createdAt: number | null;
  endsAt: number | null;
};

export type EntitlementRow = {
  uid: string;
  aiTier: string | null;
  status: string | null;
  expiresAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
};

export type PayoutRow = { id: string; providerId: string | null; status: string | null; amountMinor: number; createdAt: number | null };
export type ProfileRow = { id: string; status: string | null; sample: boolean };
export type ApplicationRow = { id: string; status: string | null };
/**
 * calls/{bookingId}: when the room was first opened and when it was last hung
 * up (app/lib/call.ts). The participants only to leave out staff and sample
 * providers' calls; never copied into the result.
 */
export type CallRow = { id: string; participants: string[]; firstJoinedAt: number | null; endedAt: number | null };
/** trafficDaily/{yyyy-mm-dd}: views and visits that day, and views by page key. */
export type TrafficRow = { day: string; views: number; visits: number; byPath: Record<string, number> };
/** A count from an aggregation query, for the bucket starting at `t`. */
export type CountAt = { t: number; n: number };

export type StatsRows = {
  /** Staff and the owners of sample listings. */
  excluded: ReadonlySet<string>;
  /** Every account. The intake's answers about the person only for a month's wellbeing figures. */
  users: UserRow[];
  /** Created from previousFrom on. */
  payments: PaymentRow[];
  /** Every refunded payment. */
  refunds: RefundRow[];
  /** Created from previousFrom on. */
  bookings: BookingRow[];
  /** Every session whose fee is owed back to the patient, dated by that decision. */
  refundDue: { id: string; patientId: string | null; providerId: string | null; amountMinor: number; at: number | null }[];
  entitlements: EntitlementRow[];
  /** Created in the range. */
  payouts: PayoutRow[];
  profiles: ProfileRow[];
  applications: ApplicationRow[];
  /** Started from previousFrom on. */
  talk: TalkSessionDoc[];
  /** First opened in the range. */
  calls: CallRow[];
  /** The range's days. */
  traffic: TrafficRow[];
  counts: {
    activeDay: number;
    activeWeek: number;
    activeMonth: number;
    dau: CountAt[];
    wau: CountAt[];
    mau: CountAt[];
    /** Per bucket of the range. */
    chatMessages: CountAt[];
    /**
     * Mood check-ins, for a month's wellbeing figures only (null otherwise,
     * when the function does not count them at all): how many in the month
     * had each score 1…5, the month's average, and the same per week of it.
     */
    mood: {
      byScore: number[];
      average: number | null;
      weekly: { t: number; n: number; average: number | null }[];
    } | null;
    queues: { applications: number; support: number; payments: number; payouts: number; sessions: number };
  };
  recordingSince: AdminStats["recordingSince"];
};

// ------------------------------------------------------------------ compose

const ROLE_LABELS: Record<string, string> = { patient: "People seeking support", provider: "Providers", org_admin: "Institution contacts" };

const APPLICATION_STATUSES = ["draft", "submitted", "in_review", "changes_requested", "approved", "rejected", "suspended"] as const;
const APPLICATION_LABELS: Record<(typeof APPLICATION_STATUSES)[number], string> = {
  draft: "Filling it in",
  submitted: "Sent, waiting",
  in_review: "In review",
  changes_requested: "Changes asked for",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "Suspended",
};

const PROFILE_STATUSES = ["verified", "pending", "draft", "rejected", "suspended"] as const;
const PROFILE_LABELS: Record<(typeof PROFILE_STATUSES)[number], string> = {
  verified: "Verified",
  pending: "Waiting for review",
  draft: "Draft",
  rejected: "Not approved",
  suspended: "Suspended",
};

const BOOKING_STATES = ["pending", "upcoming", "attended", "disputed", "cancelled", "no_show"] as const;
type BookingState = (typeof BOOKING_STATES)[number];
const BOOKING_LABELS: Record<BookingState, string> = {
  pending: "Waiting for payment",
  upcoming: "Paid, still to come",
  attended: "Took place",
  disputed: "Said not to have happened",
  cancelled: "Cancelled",
  no_show: "Did not happen",
};

const PASS_STATES = ["ready", "inUse", "used", "lapsed"] as const;
type PassState = (typeof PASS_STATES)[number];
const PASS_LABELS: Record<PassState, string> = {
  ready: "Paid, not started",
  inUse: "In use",
  used: "Used",
  lapsed: "Lapsed unused",
};

const PURPOSES: PaymentPurpose[] = ["ai_initial", "ai_extended", "session_fee"];
const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  ai_initial: AI_TIERS.initial.label,
  ai_extended: AI_TIERS.extended.label,
  session_fee: "Provider sessions",
};

const KIND_LABELS: Record<TalkKind, string> = { intake: "Getting to know you", companion: "Talking again" };
const MODE_LABELS: Record<TalkMode | "silent", string> = {
  voice: "Spoken",
  typed: "Typed",
  mixed: "Both",
  silent: "No answers",
};

/** Upper edges in seconds; the last bin takes everything to the longest paid window. */
const DURATION_BINS: { key: string; label: string; below: number }[] = [
  { key: "lt1", label: "Under 1 min", below: 60 },
  { key: "1to2", label: "1–2 min", below: 120 },
  { key: "2to4", label: "2–4 min", below: 240 },
  { key: "4to8", label: "4–8 min", below: 480 },
  { key: "8to12", label: "8–12 min", below: 720 },
  { key: "12to20", label: "12–20 min", below: 1200 },
  { key: "20to30", label: "20–30 min", below: Infinity },
];

const GENDER_PREF_LABELS: Record<(typeof GENDER_PREFS)[number], string> = {
  woman: "A woman",
  man: "A man",
  any: "No preference",
};

/** Upper edges in seconds, around the 45-minute session. */
const CALL_BINS: { key: string; label: string; below: number }[] = [
  { key: "lt10", label: "Under 10 min", below: 600 },
  { key: "10to20", label: "10–20 min", below: 1200 },
  { key: "20to30", label: "20–30 min", below: 1800 },
  { key: "30to40", label: "30–40 min", below: 2400 },
  { key: "40to50", label: "40–50 min", below: 3000 },
  { key: "50plus", label: "50 min or more", below: Infinity },
];
/**
 * The longest a call is counted as: its join window, from ten minutes before
 * the session to an hour after it ends (joinWindow in app/lib/call.ts). A
 * longer one is a room whose last hang-up was never written.
 */
const MAX_CALL_SEC = (10 + SLOT_MINUTES + 60) * 60;

const RISK_LABELS: Record<TalkRisk | "unknown", string> = {
  elevated: "Elevated",
  urgent: "Urgent",
  unknown: "Level not recorded",
};

const FUNNEL_LABELS: Record<FunnelStepKey, string> = {
  visitors: "Visited the site",
  signedUp: "Made an account",
  startedTalk: "Started with TALK",
  paidFirst: "Paid for a first conversation",
  matched: "Shown providers",
  booked: "Booked a session",
  attended: "Had a session",
};

const NOT_SAID = "unknown";
const NOT_SAID_LABEL = "Not said";

const inRange = (t: number | null, from: number, to: number): t is number => t !== null && t >= from && t <= to;

/** Count of each key, in the order given, plus everything else as "not said". */
function tally<K extends string>(
  values: readonly (string | null)[],
  keys: readonly K[],
  labels: Record<K, string>,
  { notSaid = true }: { notSaid?: boolean } = {},
): [string, string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v !== null && (keys as readonly string[]).includes(v) ? v : NOT_SAID;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows: [string, string, number][] = keys.map((k) => [k, labels[k], counts.get(k) ?? 0]);
  if (notSaid) rows.push([NOT_SAID, NOT_SAID_LABEL, counts.get(NOT_SAID) ?? 0]);
  return rows;
}

/** Each key's count across multi-select lists, largest first. */
function tallyMulti<K extends string>(lists: readonly string[][], keys: readonly K[], labels: Record<K, string>) {
  const rows: [string, string, number][] = keys.map((k) => [k, labels[k], lists.filter((l) => l.includes(k)).length]);
  return rows.sort((a, b) => b[2] - a[2]);
}

/** How many of `values` fall in each bin, the bins running from 0 up to each `below` in turn. */
function binned(values: readonly number[], bins: readonly { key: string; label: string; below: number }[]) {
  return bins.map((bin, i) => {
    const lower = i === 0 ? 0 : bins[i - 1].below;
    return [bin.key, bin.label, values.filter((v) => v >= lower && v < bin.below).length] as const;
  });
}

/** How many of `times` fall in each bucket. */
function perBucket(times: readonly number[], starts: number[], bucket: Bucket): number[] {
  const index = new Map(starts.map((t, i) => [t, i]));
  const counts = starts.map(() => 0);
  for (const t of times) {
    const i = index.get(bucketStart(t, bucket));
    if (i !== undefined) counts[i] += 1;
  }
  return counts;
}

function bookingState(b: BookingRow, now: number): BookingState {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "no_show") return "no_show";
  if (b.disputed) return "disputed";
  const past = b.endsAt !== null && b.endsAt < now;
  if (b.status === "completed" || (b.status === "confirmed" && b.paymentStatus === "paid" && past)) return "attended";
  if (b.status === "confirmed") return "upcoming";
  return "pending";
}

function passState(e: EntitlementRow, now: number): PassState | null {
  if (e.status !== "granted" || e.expiresAt === null) return null;
  if (e.startedAt === null) return e.expiresAt > now ? "ready" : "lapsed";
  return e.expiresAt > now && (e.endsAt === null || e.endsAt > now) ? "inUse" : "used";
}

/** They began a conversation with TALK: heard and agreed to the consent, or answered something. */
function startedTalk(u: UserRow): boolean {
  return u.spokenConsentAt !== null || Boolean(u.intake?.language) || u.intake?.completedAt != null;
}

/** When TALK finished getting to know them. Older accounts finished before the time was kept count from sign-up. */
function intakeDoneAt(u: UserRow): number | null {
  return u.intake?.completedAt ?? (u.onboarded ? u.createdAt : null);
}

const succeeded = (p: PaymentRow) => p.status === "succeeded";

/**
 * Everything on the staff pages but the live strip, from the rows the
 * function read. `now` decides what "upcoming", "lapsed" and "in use" mean.
 */
export function composeStats(rows: StatsRows, range: ResolvedRange, now: number, k = K_ANONYMITY): AdminStatsBody {
  const { from, to, previousFrom, previousTo, bucket } = range;
  const starts = bucketStarts(from, to, bucket);
  const ex = rows.excluded;

  // ---- who counts ------------------------------------------------------
  const users = rows.users.filter((u) => !isExcludedUid(u.id, ex) && normaliseRole(u.role) !== "admin");
  const patients = users.filter((u) => normaliseRole(u.role) === "patient");
  const payments = rows.payments.filter(
    (p) => !isTestId(p.id) && p.provider !== "simulated" && !isExcludedUid(p.uid, ex),
  );
  const refundedIds = new Set(rows.refunds.map((r) => r.id));
  const bookings = rows.bookings.filter(
    (b) => !isTestId(b.id) && !isExcludedUid(b.patientId, ex) && !isExcludedUid(b.providerId, ex),
  );
  const refundDue = rows.refundDue.filter(
    (b) => !isTestId(b.id) && !isExcludedUid(b.patientId, ex) && !isExcludedUid(b.providerId, ex),
  );
  const refundDueIds = new Set(refundDue.map((b) => b.id));

  // ---- people ------------------------------------------------------------
  const roleRows = (["patient", "provider", "org_admin"] as const).map(
    (r) => [r, ROLE_LABELS[r], users.filter((u) => normaliseRole(u.role) === r).length] as const,
  );
  const signedUp = (a: number, b: number) => users.filter((u) => inRange(u.createdAt, a, b));
  const signups = signedUp(from, to);
  const signupTimes = signups.map((u) => u.createdAt as number);
  const newPatients = patients.filter((u) => inRange(u.createdAt, from, to));
  const applications = rows.applications.filter((a) => !isExcludedUid(a.id, ex));

  const presenceSeries = (counts: CountAt[]) => series(counts.map((c) => c.t), counts.map((c) => c.n), { partition: false, k });

  const people: PeopleStats = {
    byRole: categories(roleRows, { partition: true, k }),
    total: cell(users.length, k),
    providersByApplicationStatus: categories(
      tally(applications.map((a) => a.status), APPLICATION_STATUSES, APPLICATION_LABELS, { notSaid: false }),
      { partition: true, k },
    ),
    newSignups: cell(signups.length, k),
    signupsByBucket: series(starts, perBucket(signupTimes, starts, bucket), { partition: true, k }),
    onboarded: share(newPatients.filter((u) => u.onboarded).length, newPatients.length, k),
    onboardedAllTime: share(patients.filter((u) => u.onboarded).length, patients.length, k),
    active: {
      day: cell(rows.counts.activeDay, k),
      week: cell(rows.counts.activeWeek, k),
      month: cell(rows.counts.activeMonth, k),
    },
    dau: presenceSeries(rows.counts.dau),
    wau: presenceSeries(rows.counts.wau),
    mau: presenceSeries(rows.counts.mau),
  };

  // ---- who has what --------------------------------------------------------
  const passes = rows.entitlements
    .filter((e) => !isExcludedUid(e.uid, ex))
    .map((e) => ({ e, state: passState(e, now) }))
    .filter((p): p is { e: EntitlementRow; state: PassState } => p.state !== null);
  const activePasses = passes.filter((p) => p.state === "ready" || p.state === "inUse");
  const aiPaid = (purpose: string, a: number, b: number) =>
    payments.filter((p) => p.purpose === purpose && succeeded(p) && inRange(p.createdAt, a, b));
  const bookingsIn = (a: number, b: number) => bookings.filter((x) => inRange(x.createdAt, a, b));
  const rangeBookings = bookingsIn(from, to);
  const profiles = rows.profiles.filter((p) => !p.sample && !isTestId(p.id) && !ex.has(p.id));

  // "Ready" and "in use" together are the total of talkActiveByTier, shown
  // beside them, so the two are withheld as a pair as well as with the rest.
  const passCounts = PASS_STATES.map((s) => passes.filter((p) => p.state === s).length);
  const passShown = suppressGroups(passCounts, [[0, 1, 2, 3], [0, 1]], k);

  const holdings: HoldingsStats = {
    talkPasses: PASS_STATES.map((s, i) => ({
      key: s,
      label: PASS_LABELS[s],
      value: passShown[i],
      suppressed: passShown[i] === null,
    })),
    talkActiveByTier: categories(
      (["initial", "extended"] as const).map(
        (t) => [t, AI_TIERS[t].label, activePasses.filter((p) => p.e.aiTier === t).length] as const,
      ),
      { partition: true, k },
    ),
    paidFirstConversations: cell(aiPaid("ai_initial", from, to).length, k),
    paidLongerTalks: cell(aiPaid("ai_extended", from, to).length, k),
    bookingsByStatus: categories(
      BOOKING_STATES.map(
        (s) => [s, BOOKING_LABELS[s], rangeBookings.filter((b) => bookingState(b, now) === s).length] as const,
      ),
      { partition: true, k },
    ),
    bookingsTotal: cell(rangeBookings.length, k),
    providersByStatus: categories(
      tally(profiles.map((p) => p.status), PROFILE_STATUSES, PROFILE_LABELS, { notSaid: false }),
      { partition: true, k },
    ),
  };

  // ---- money -------------------------------------------------------------
  const received = (a: number, b: number) => payments.filter((p) => succeeded(p) && inRange(p.createdAt, a, b));
  const refundsIn = (a: number, b: number) => {
    const paid = rows.refunds.filter((r) => !isTestId(r.id) && !isExcludedUid(r.uid, ex) && inRange(r.at, a, b));
    const owed = refundDue.filter((r) => inRange(r.at, a, b));
    return {
      minor: paid.reduce((s, r) => s + r.amountMinor, 0) + owed.reduce((s, r) => s + r.amountMinor, 0),
      count: paid.length + owed.length,
    };
  };
  const sum = (list: { amountMinor: number }[]) => list.reduce((s, p) => s + p.amountMinor, 0);
  const net = (a: number, b: number) => sum(received(a, b)) - refundsIn(a, b).minor;
  const rangeReceived = received(from, to);
  const rangeRefunds = refundsIn(from, to);
  const kept = rangeReceived.filter(
    (p) => !refundedIds.has(p.id) && !(p.bookingId !== null && refundDueIds.has(p.bookingId)),
  );
  const payouts = rows.payouts.filter((p) => !isTestId(p.id) && !isExcludedUid(p.providerId, ex));
  const payoutGroup = (statuses: string[]) => payouts.filter((p) => statuses.includes(p.status ?? ""));
  const sent = payoutGroup(["completed"]);
  const pending = payoutGroup(["initiating", "pending", "uncertain"]);
  const failed = payoutGroup(["failed", "reversed"]);

  const money: MoneyStats = {
    currency: "GMD",
    grossMinor: sum(rangeReceived),
    refundsMinor: rangeRefunds.minor,
    refundsCount: rangeRefunds.count,
    netMinor: sum(rangeReceived) - rangeRefunds.minor,
    platformFeeMinor: kept.reduce(
      (s, p) => s + (p.purpose === "session_fee" ? platformFeeMinor(p.amountMinor) : p.amountMinor),
      0,
    ),
    byPurpose: PURPOSES.map((key) => {
      const list = rangeReceived.filter((p) => p.purpose === key);
      return { key, label: PURPOSE_LABELS[key], amountMinor: sum(list), count: list.length };
    }),
    series: PURPOSES.map((key) => ({
      key,
      label: PURPOSE_LABELS[key],
      points: starts.map((t) => {
        const [a, b] = bucketBounds(t, bucket);
        return { t, amountMinor: sum(rangeReceived.filter((p) => p.purpose === key && inRange(p.createdAt, a, b - 1))) };
      }),
    })),
    payouts: {
      sentMinor: sum(sent),
      sentCount: sent.length,
      pendingMinor: sum(pending),
      pendingCount: pending.length,
      failedMinor: sum(failed),
      failedCount: failed.length,
    },
  };

  // ---- engagement ----------------------------------------------------------
  const talkIn = (a: number, b: number) => rows.talk.filter((s) => inRange(s.startedAt, a, b));
  const talk = talkIn(from, to);
  const measuredTalk = talk.filter((s) => s.durationSec !== null);
  const durations = measuredTalk.map((s) => s.durationSec as number);
  const enoughToMeasure = durations.length >= k;
  const grid = WEEKDAY_LABELS.map(() => HOUR_LABELS.map(() => 0));
  for (const s of talk) {
    const { day, hour } = hourOfWeek(s.startedAt);
    grid[day][hour] += 1;
  }
  // Each weekday's row adds up to that day's conversations (or, over longer
  // dates, to the days the per-day chart shows for that weekday), so a row
  // is withheld like a partition of its own total as well as of the week's.
  const gridShown = suppressGroups(
    grid.flat(),
    [
      grid.flat().map((_, i) => i),
      ...WEEKDAY_LABELS.map((_, d) => HOUR_LABELS.map((__, h) => d * 24 + h)),
    ],
    k,
  );
  const traffic = rows.traffic.filter((d) => inRange(parseDayKey(d.day), from, to));
  const views = traffic.reduce((s, d) => s + d.views, 0);
  const visits = traffic.reduce((s, d) => s + d.visits, 0);
  const viewsPerBucket = starts.map(() => 0);
  const startIndex = new Map(starts.map((t, i) => [t, i]));
  for (const d of traffic) {
    const i = startIndex.get(bucketStart(parseDayKey(d.day), bucket));
    if (i !== undefined) viewsPerBucket[i] += d.views;
  }
  const pageViews = PAGE_KEYS.map(
    (p) => [p, PAGE_LABELS[p], traffic.reduce((s, d) => s + (d.byPath[p] ?? 0), 0)] as const,
  );
  const chatCounts = starts.map((t) => rows.counts.chatMessages.find((c) => c.t === t)?.n ?? 0);
  const calls = rows.calls.filter(
    (c) => !isTestId(c.id) && inRange(c.firstJoinedAt, from, to) && !c.participants.some((uid) => isExcludedUid(uid, ex)),
  );
  const callSeconds = calls.flatMap((c) =>
    c.firstJoinedAt !== null && c.endedAt !== null && c.endedAt > c.firstJoinedAt
      ? [Math.min(MAX_CALL_SEC, Math.round((c.endedAt - c.firstJoinedAt) / 1000))]
      : [],
  );
  const enoughCalls = callSeconds.length >= k;

  const engagement: EngagementStats = {
    conversations: cell(talk.length, k),
    conversationsByBucket: series(starts, perBucket(talk.map((s) => s.startedAt), starts, bucket), { partition: true, k }),
    byKind: categories(
      TALK_KINDS.map((kind) => [kind, KIND_LABELS[kind], talk.filter((s) => s.kind === kind).length] as const),
      { partition: true, k },
    ),
    measured: cell(durations.length, k),
    medianSec: guardedMedian(durations, k),
    p90Sec: enoughToMeasure ? Math.round(percentile(durations, 0.9) as number) : null,
    durationHistogram: categories(binned(durations, DURATION_BINS), { partition: true, k }),
    completion: share(talk.filter((s) => s.completed).length, talk.length, k),
    // Of the conversations with an end, the same ones `measured` counts: those
    // with none are `conversations` minus `measured`, both on show, so a
    // part for them could never be withheld.
    byMode: categories(
      [...TALK_MODES, "silent" as const].map(
        (m) => [m, MODE_LABELS[m], measuredTalk.filter((s) => (s.mode ?? "silent") === m).length] as const,
      ),
      { partition: true, k },
    ),
    byLanguage: categories(
      tally(talk.map((s) => s.language), LANGUAGES, LANGUAGE_LABEL),
      { partition: true, k },
    ),
    hourOfWeek: {
      rows: [...WEEKDAY_LABELS],
      cols: [...HOUR_LABELS],
      values: WEEKDAY_LABELS.map((_, d) => HOUR_LABELS.map((__, h) => gridShown[d * 24 + h])),
    },
    providerCalls: {
      calls: cell(calls.length, k),
      measured: cell(callSeconds.length, k),
      medianSec: guardedMedian(callSeconds, k),
      p90Sec: enoughCalls ? Math.round(percentile(callSeconds, 0.9) as number) : null,
      durationHistogram: categories(binned(callSeconds, CALL_BINS), { partition: true, k }),
    },
    chatMessages: cell(chatCounts.reduce((a, b) => a + b, 0), k),
    chatMessagesByBucket: series(starts, chatCounts, { partition: true, k }),
    traffic: {
      views: cell(views, k),
      visits: cell(visits, k),
      viewsByBucket: series(starts, viewsPerBucket, { partition: true, k }),
      byPage: categories(
        [...pageViews].filter((p) => p[2] > 0).sort((a, b) => b[2] - a[2]),
        { partition: true, k },
      ),
    },
  };

  // ---- funnel --------------------------------------------------------------
  const cohort = new Set(newPatients.map((u) => u.id));
  const firstPayers = new Set(
    payments.filter((p) => p.purpose === "ai_initial" && succeeded(p) && p.uid !== null).map((p) => p.uid as string),
  );
  const bookers = new Set(bookings.map((b) => b.patientId).filter((id): id is string => id !== null));
  const attenders = new Set(
    bookings
      .filter((b) => bookingState(b, now) === "attended")
      .map((b) => b.patientId)
      .filter((id): id is string => id !== null),
  );
  const inCohort = (set: Set<string>) => [...cohort].filter((id) => set.has(id)).length;
  const funnelCounts: Record<FunnelStepKey, number> = {
    visitors: visits,
    signedUp: newPatients.length,
    startedTalk: newPatients.filter(startedTalk).length,
    paidFirst: inCohort(firstPayers),
    matched: newPatients.filter((u) => u.intake?.completedAt != null).length,
    booked: inCohort(bookers),
    attended: inCohort(attenders),
  };
  const funnel: FunnelStep[] = (Object.keys(FUNNEL_LABELS) as FunnelStepKey[]).map((key) => ({
    key,
    label: FUNNEL_LABELS[key],
    ...cell(funnelCounts[key], k),
  }));

  // ---- wellbeing -----------------------------------------------------------
  const wellbeing =
    range.preset === "month" && rows.counts.mood ? composeWellbeing(patients, talk, rows.counts.mood, range, k) : null;

  // ---- headline ------------------------------------------------------------
  const prevTalk = talkIn(previousFrom, previousTo);
  const medianOf = (list: TalkSessionDoc[]) =>
    guardedMedian(list.filter((s) => s.durationSec !== null).map((s) => s.durationSec as number), k);
  const medianCell = (m: number | null, list: TalkSessionDoc[]): Cell =>
    m === null && list.some((s) => s.durationSec !== null) ? { value: null, suppressed: true } : { value: m, suppressed: false };
  const prevMedian = medianOf(prevTalk);
  const paidIn = (a: number, b: number) => [...aiPaid("ai_initial", a, b), ...aiPaid("ai_extended", a, b)];
  const paidTimes = paidIn(from, to).map((p) => p.createdAt as number);

  const headline: Headline = {
    newPeople: metric(cell(signups.length, k), cell(signedUp(previousFrom, previousTo).length, k), people.signupsByBucket),
    talkConversations: metric(cell(talk.length, k), cell(prevTalk.length, k), engagement.conversationsByBucket),
    medianTalkSec: metric(
      medianCell(engagement.medianSec, talk),
      medianCell(prevMedian, prevTalk),
      starts.map((t) => {
        const [a, b] = bucketBounds(t, bucket);
        const inBucket = talk.filter((s) => s.startedAt >= a && s.startedAt < b);
        const m = medianOf(inBucket);
        return { t, value: m, suppressed: m === null && inBucket.some((s) => s.durationSec !== null) };
      }),
    ),
    paidConversations: metric(
      cell(paidTimes.length, k),
      cell(paidIn(previousFrom, previousTo).length, k),
      series(starts, perBucket(paidTimes, starts, bucket), { partition: true, k }),
    ),
    bookings: metric(
      cell(rangeBookings.length, k),
      cell(bookingsIn(previousFrom, previousTo).length, k),
      series(starts, perBucket(rangeBookings.map((b) => b.createdAt as number), starts, bucket), { partition: true, k }),
    ),
    revenueMinor: metric(
      open(money.netMinor),
      open(net(previousFrom, previousTo)),
      starts.map((t) => {
        const [a, b] = bucketBounds(t, bucket);
        return { t, value: net(a, b - 1), suppressed: false };
      }),
    ),
  };

  // ---- queues --------------------------------------------------------------
  const q = rows.counts.queues;
  const queues: QueueItem[] = [
    { key: "applications", label: "Provider applications waiting", count: q.applications, href: "/admin/providers" },
    { key: "support", label: "Support requests open", count: q.support, href: "/admin/support" },
    { key: "payments", label: "Payments to review", count: q.payments, href: "/admin/review" },
    { key: "payouts", label: "Payouts to review", count: q.payouts, href: "/admin/review" },
    { key: "sessions", label: "Sessions in dispute", count: q.sessions, href: "/admin/review" },
  ];

  return {
    generatedAt: now,
    range,
    k,
    recordingSince: rows.recordingSince,
    headline,
    people,
    holdings,
    money,
    engagement,
    funnel,
    wellbeing,
    queues,
  };
}

/**
 * What people brought to TALK in one whole month, withheld on its own terms.
 *
 * Only ever for a month (resolveRange refuses one still under way), never for
 * a range that can be slid a day at a time: two such ranges a day apart, each
 * safe on its own, differ by one day's people — a single person's age, region
 * and concerns, by subtraction. Months never overlap and never change once
 * they are over, so no two answers can be set against each other like that.
 * Its weekly series are cut at the month's edges for the same reason, and
 * nothing here is ever added up across months.
 */
function composeWellbeing(
  patients: readonly UserRow[],
  talk: readonly TalkSessionDoc[],
  mood: NonNullable<StatsRows["counts"]["mood"]>,
  range: ResolvedRange,
  k: number,
): WellbeingStats {
  const { from, to } = range;
  const told = patients.filter((u) => u.intake && inRange(intakeDoneAt(u), from, to));
  const intakes = told.map((u) => u.intake!);
  // A week's column starts where the month does, if the week began before it.
  const weekStarts = bucketStarts(from, to, "week");
  const weekColumns = weekStarts.map((t) => Math.max(t, from));
  const topicWeeks = SPECIALIZATIONS.map((topic) => {
    const times = talk.filter((s) => s.topics.includes(topic)).map((s) => s.startedAt);
    return { topic, total: times.length, counts: perBucket(times, weekStarts, "week") };
  })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
  const moodTotal = mood.byScore.reduce((a, b) => a + b, 0);
  const flagged = talk.filter((s) => s.safetyFlagged || Boolean(s.risk));
  const unrecorded = flagged.filter((s) => !s.risk).length;

  return {
    population: cell(told.length, k),
    concerns: categories(tallyMulti(intakes.map((i) => i.concerns), SPECIALIZATIONS, SPECIALIZATION_LABELS), {
      partition: false,
      k,
    }),
    servicesWanted: categories(tallyMulti(intakes.map((i) => i.servicesWanted), SERVICES, SERVICE_LABELS), {
      partition: false,
      k,
    }),
    topicsByWeek: topicWeeks.map((t) => ({
      key: t.topic,
      label: SPECIALIZATION_LABELS[t.topic],
      points: series(weekColumns, t.counts, { partition: false, k }),
    })),
    providerGender: categories(tally(intakes.map((i) => i.providerGender), GENDER_PREFS, GENDER_PREF_LABELS), {
      partition: true,
      k,
    }),
    ageBands: categories(tally(intakes.map((i) => i.ageRange), AGE_RANGES, AGE_LABELS), { partition: true, k }),
    gender: categories(tally(intakes.map((i) => i.gender), USER_GENDERS, USER_GENDER_LABELS), { partition: true, k }),
    regions: categories(tally(intakes.map((i) => i.location), AREAS, AREA_LABELS), { partition: true, k }),
    languages: categories(tally(intakes.map((i) => i.language), LANGUAGES, LANGUAGE_LABEL), { partition: true, k }),
    mood: {
      entries: cell(moodTotal, k),
      average: moodTotal >= k && mood.average !== null ? Math.round(mood.average * 100) / 100 : null,
      distribution: categories(
        mood.byScore.map((n, i) => [String(i + 1), MOOD_LABELS[(i + 1) as MoodScore], n] as const),
        { partition: true, k },
      ),
      weeklyAverage: mood.weekly.map((w) => ({
        t: Math.max(w.t, from),
        value: w.n >= k && w.average !== null ? Math.round(w.average * 100) / 100 : null,
        suppressed: isSmall(w.n, k),
      })),
      weeklyEntries: series(
        mood.weekly.map((w) => Math.max(w.t, from)),
        mood.weekly.map((w) => w.n),
        { partition: true, k },
      ),
    },
    safetyFlaggedConversations: cell(flagged.length, k),
    // The parts of the count beside it, so withheld as a split of it. Records
    // kept before levels were have a part of their own, only when there are any.
    safetyByRisk: categories(
      [
        ...TALK_RISKS.map((r) => [r, RISK_LABELS[r], flagged.filter((s) => s.risk === r).length] as const),
        ...(unrecorded ? [["unknown", RISK_LABELS.unknown, unrecorded] as const] : []),
      ],
      { partition: true, k },
    ),
  };
}

/** What the function reads for the live strip. */
export type LiveRows = {
  excluded: ReadonlySet<string>;
  /** The page key of every tab seen in the window. */
  visitorPages: string[];
  /** Every signed-in person seen in the window. */
  signedIn: { uid: string; area: string | null }[];
  talking: number;
};

export function composeLive(rows: LiveRows, now: number, k = K_ANONYMITY): LiveStats {
  const signedIn = rows.signedIn.filter((p) => !isExcludedUid(p.uid, rows.excluded));
  const pages = PAGE_KEYS.map((p) => [p, PAGE_LABELS[p], rows.visitorPages.filter((v) => v === p).length] as const);
  return {
    at: now,
    windowSec: LIVE_WINDOW_MS / 1000,
    visitorsNow: cell(rows.visitorPages.length, k),
    visitorsByPage: categories(
      pages.filter((p) => p[2] > 0).sort((a, b) => b[2] - a[2]),
      { partition: true, k },
    ),
    signedInNow: cell(signedIn.length, k),
    signedInByArea: categories(
      PRESENCE_AREAS.map((a) => [a, PRESENCE_AREA_LABELS[a], signedIn.filter((p) => (p.area ?? "app") === a).length] as const),
      { partition: true, k },
    ),
    talkingNow: cell(rows.talking, k),
  };
}

// ------------------------------------------------------------------ display

/** A count as staff read it: withheld ones as "<5", the rest grouped ("1,204"). */
export function countText(value: number | null, suppressed: boolean): string {
  if (suppressed) return SUPPRESSED_TEXT;
  return value === null ? "–" : value.toLocaleString("en-GB");
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The wellbeing figures as a CSV file: every breakdown and series already on
 * the page, one row per cell, withheld cells as "<5". Built from what the
 * function returned, so it can never hold more than the page shows — no
 * person, only groups of five or more.
 */
export function wellbeingCsv(w: WellbeingStats, range: ResolvedRange): string {
  const rows: (string | number)[][] = [["section", "group", "period start (UTC)", "value"]];
  const period = range.preset === "month" ? monthKey(range.from) : `${dayKey(range.from)} to ${dayKey(range.to)}`;
  const count = (c: { value: number | null; suppressed: boolean }) => (c.suppressed ? SUPPRESSED_TEXT : (c.value ?? ""));
  const breakdown = (section: string, list: Category[]) => {
    for (const c of list) rows.push([section, c.label, period, count(c)]);
  };

  rows.push(["People in this period", "All", period, count(w.population)]);
  breakdown("What people are struggling with", w.concerns);
  breakdown("Services wanted", w.servicesWanted);
  breakdown("Preferred provider", w.providerGender);
  breakdown("Age band", w.ageBands);
  breakdown("Gender", w.gender);
  breakdown("Region", w.regions);
  breakdown("Language", w.languages);
  for (const s of w.topicsByWeek) {
    for (const p of s.points) rows.push(["TALK conversations by topic, by week", s.label, dayKey(p.t), count(p)]);
  }
  rows.push(["Mood check-ins", "All", period, count(w.mood.entries)]);
  rows.push(["Mood average (1–5)", "All", period, w.mood.average ?? (w.mood.entries.suppressed ? SUPPRESSED_TEXT : "")]);
  breakdown("Mood check-ins by score", w.mood.distribution);
  for (const p of w.mood.weeklyEntries) rows.push(["Mood check-ins, by week", "All", dayKey(p.t), count(p)]);
  for (const p of w.mood.weeklyAverage) {
    rows.push(["Mood average, by week", "All", dayKey(p.t), p.suppressed ? SUPPRESSED_TEXT : (p.value ?? "")]);
  }
  rows.push(["Conversations TALK flagged", "All", period, count(w.safetyFlaggedConversations)]);
  breakdown("Conversations TALK flagged, by how serious", w.safetyByRisk);

  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
