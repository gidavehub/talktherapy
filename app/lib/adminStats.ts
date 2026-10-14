/**
 * The staff statistics, as the admin pages use them: the shape of what the
 * adminStats function returns, and the two ways of asking for it.
 *
 * Everything is worked out in the function (functions/src/adminStats.ts),
 * never in the browser: the rules would let a staff browser list accounts, and
 * a dashboard built that way would pull every intake and email into the page
 * just to count them. What arrives here is numbers only — counts, sums,
 * averages and bucketed series — with any group smaller than five withheld
 * (`value: null, suppressed: true`, shown as SUPPRESSED_TEXT, "<5").
 *
 * The shapes themselves live in ./adminStatsCore, which the function shares;
 * this file adds what only a browser can do, and is the one the pages import.
 */

import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";
import type { AdminStats, LiveStats, StatsRangeInput } from "./adminStatsCore";

export type {
  AdminStats,
  AdminStatsBody,
  Category,
  Cell,
  EngagementStats,
  FunnelStep,
  FunnelStepKey,
  Headline,
  HoldingsStats,
  LiveStats,
  Metric,
  MoneyStats,
  PageKey,
  PaymentPurpose,
  PeopleStats,
  PresenceArea,
  QueueItem,
  RangePreset,
  ResolvedRange,
  Series,
  SeriesPoint,
  Share,
  StatsRangeInput,
  TalkRisk,
  WellbeingStats,
} from "./adminStatsCore";
export {
  HEARTBEAT_MS,
  HOUR_LABELS,
  K_ANONYMITY,
  LIVE_WINDOW_MS,
  PAGE_LABELS,
  PRESENCE_AREA_LABELS,
  RANGE_PRESETS,
  STATS_CACHE_MS,
  SUPPRESSED_TEXT,
  WEEKDAY_LABELS,
  countText,
  wellbeingCsv,
  wellbeingMonths,
} from "./adminStatsCore";

export type StatsResult<T> = { ok: true; data: T } | { ok: false; error: string };

function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const text = error.message.replace(/^Firebase:\s*/, "");
    if (text && text !== "internal" && text !== "INTERNAL") return text;
  }
  return "The numbers did not load. Check your connection and try again.";
}

/**
 * Every figure for a range, with the live strip. The range's figures may be up
 * to five minutes old (`cached`); the live strip never is. The wellbeing
 * figures come only for `{ month }`. Staff only — the function checks.
 */
export async function fetchAdminStats(range: StatsRangeInput): Promise<StatsResult<AdminStats>> {
  try {
    const result = await httpsCallable<{ range: StatsRangeInput }, AdminStats>(firebaseFunctions(), "adminStats", {
      timeout: 120_000,
    })({ range });
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Only who is here now — cheap enough to ask every 30 seconds. */
export async function fetchLiveStats(): Promise<StatsResult<LiveStats>> {
  try {
    const result = await httpsCallable<{ liveOnly: true }, { live: LiveStats }>(firebaseFunctions(), "adminStats")({
      liveOnly: true,
    });
    return { ok: true, data: result.data.live };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
