"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DateRangeValue } from "@/components/ui/DateRangePicker";
import {
  STATS_CACHE_MS,
  fetchAdminStats,
  wellbeingMonths,
  fetchLiveStats,
  type AdminStats,
  type LiveStats,
  type RangePreset,
  type StatsRangeInput,
} from "@/lib/adminStats";

/**
 * The figures behind the three staff dashboards, held once for the tab.
 *
 * Overview, Insights and Wellbeing are three views of one adminStats answer,
 * so they share it: the dates chosen on one page are the dates on the next,
 * and moving between them shows what was already fetched instead of asking
 * the function again. A range's answer is kept for as long as the function
 * keeps it (STATS_CACHE_MS); after that it is fetched again while the old
 * figures stay on screen, dimmed, so nothing jumps.
 *
 * Wellbeing is the exception: its figures only come a whole month at a time
 * (see composeWellbeing in app/lib/adminStatsCore.ts), so it has a month of
 * its own and never borrows another page's dates or figures.
 *
 * A small store outside React, because the three pages are separate routes
 * with nothing above them in common but the shell. It holds only the
 * anonymous totals the function returns, in this tab's memory.
 */

/** "range": the dates the overview and insights share. "month": the wellbeing page's month. */
export type StatsScope = "range" | "month";

type Request = { key: string; input: StatsRangeInput };

type Entry = {
  data: AdminStats | null;
  error: string | null;
  loading: boolean;
  /** When `data` arrived, ms. */
  at: number;
};

type Store = {
  range: DateRangeValue;
  /** "2026-09" */
  month: string;
  requests: Record<StatsScope, Request>;
  entries: Record<string, Entry>;
  /** Each scope's latest figures, shown dimmed while another of its ranges loads. */
  last: Record<StatsScope, AdminStats | null>;
};

const PRESETS: readonly RangePreset[] = ["7d", "30d", "90d", "12m"];

/** A local calendar day — what the date fields hold — as the same day in UTC, which is what the function counts. */
function utcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function requestFor(range: DateRangeValue): Request {
  if (range.preset === "custom" && range.from !== undefined && range.to !== undefined) {
    const from = utcDay(range.from);
    const to = utcDay(range.to);
    return { key: `custom:${from}:${to}`, input: { from, to } };
  }
  const preset = PRESETS.find((p) => p === range.preset) ?? "30d";
  return { key: preset, input: preset };
}

function monthRequest(month: string): Request {
  return { key: `month:${month}`, input: { month } };
}

const START: DateRangeValue = { preset: "30d" };
// The month just ended: the newest whose wellbeing figures exist.
const START_MONTH = wellbeingMonths(Date.now())[0] ?? "";
let store: Store = {
  range: START,
  month: START_MONTH,
  requests: { range: requestFor(START), month: monthRequest(START_MONTH) },
  entries: {},
  last: { range: null, month: null },
};
const listeners = new Set<() => void>();

function update(change: (current: Store) => Store) {
  store = change(store);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => store;

function setEntry(key: string, entry: Entry, last?: { scope: StatsScope; data: AdminStats }) {
  update((s) => ({
    ...s,
    last: last ? { ...s.last, [last.scope]: last.data } : s.last,
    entries: { ...s.entries, [key]: entry },
  }));
}

/** Fetch a range's figures unless they are on their way or still fresh. `force` is the retry button. */
function load(scope: StatsScope, request: Request, force: boolean) {
  const entry = store.entries[request.key];
  if (entry?.loading) return;
  if (!force && entry?.data && !entry.error && Date.now() - entry.at < STATS_CACHE_MS) return;
  setEntry(request.key, { data: entry?.data ?? null, error: null, loading: true, at: entry?.at ?? 0 });
  void fetchAdminStats(request.input).then((result) => {
    const before = store.entries[request.key];
    if (result.ok) {
      setEntry(request.key, { data: result.data, error: null, loading: false, at: Date.now() }, { scope, data: result.data });
    } else {
      setEntry(request.key, { data: before?.data ?? null, error: result.error, loading: false, at: before?.at ?? 0 });
    }
  });
}

function setRange(range: DateRangeValue) {
  update((s) => ({ ...s, range, requests: { ...s.requests, range: requestFor(range) } }));
}

function setMonth(month: string) {
  update((s) => ({ ...s, month, requests: { ...s.requests, month: monthRequest(month) } }));
}

/** How often an open dashboard checks whether its figures have gone past their five minutes. */
const RECHECK_MS = 60_000;

export type StatsView = {
  range: DateRangeValue;
  setRange: (range: DateRangeValue) => void;
  /** The wellbeing page's month, "2026-09". */
  month: string;
  setMonth: (month: string) => void;
  /** The figures to draw: this range's, or while it loads the last ones that arrived. */
  data: AdminStats | null;
  /** Why this range's figures did not load. */
  error: string | null;
  /** Nothing to draw yet: the first load. */
  loading: boolean;
  /** Something is drawn, and newer figures are on their way. */
  refreshing: boolean;
  retry: () => void;
};

export function useAdminStats(scope: StatsScope = "range"): StatsView {
  const s = useSyncExternalStore(subscribe, read, read);
  const request = s.requests[scope];
  const entry = s.entries[request.key];

  useEffect(() => {
    load(scope, request, false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(scope, request, false);
    }, RECHECK_MS);
    return () => clearInterval(timer);
  }, [scope, request]);

  const own = entry?.data ?? null;
  const error = entry?.error ?? null;
  // Another range's figures may stand in while this one loads, never once it
  // has failed: they would be read as the answer for these dates.
  const data = own ?? (error ? null : s.last[scope]);
  return {
    range: s.range,
    setRange,
    month: s.month,
    setMonth,
    data,
    error,
    loading: !data && !error,
    refreshing: Boolean(data) && (own === null || Boolean(entry?.loading)),
    retry: () => load(scope, request, true),
  };
}

/** How often the live strip asks again. */
const LIVE_EVERY_MS = 30_000;

/**
 * Who is here now, asked for every 30 seconds while the page is in view and
 * at once when it comes back into view. `seed` is the live strip that came
 * with the range's figures; whichever is newer is shown.
 */
export function useLiveStats(seed: LiveStats | null): { live: LiveStats | null; failed: boolean } {
  const [polled, setPolled] = useState<LiveStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      void fetchLiveStats().then((result) => {
        if (!mounted) return;
        if (result.ok) setPolled(result.data);
        setFailed(!result.ok);
      });
    };
    ask();
    const timer = setInterval(ask, LIVE_EVERY_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      mounted = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, []);

  const live = polled && (!seed || polled.at >= seed.at) ? polled : seed;
  return { live, failed };
}
