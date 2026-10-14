/**
 * Times, ranges and names for the staff operations pages — all in Banjul
 * time.
 *
 * The Gambia keeps UTC all year, and the time a member of staff quotes — to
 * a provider on the phone, to Modem Pay — has to be the one the provider and
 * the patient see. So everything here formats in UTC whatever the browser's
 * own zone is: a laptop set to London summer time, or somebody travelling,
 * still reads "14 Oct, 09:12" for a session at 09:12 in Banjul.
 *
 * Pure (type imports only), so scripts/test-admin-ops.mts can run it as is.
 */

import type { DateRangeValue } from "../../ui/DateRangePicker";
import type { DateRange } from "../../../lib/adminOps";

const DAY_MS = 86_400_000;

/** Midnight at the start of the Banjul day `ms` falls in. */
export function dayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function utcYear(ms: number): number {
  return new Date(ms).getUTCFullYear();
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DATE_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const WEEKDAY_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "09:12". */
export function banjulTime(ms: number): string {
  return TIME.format(ms);
}

/**
 * "14 Oct" this year, "14 Oct 2025" any other — the year only when it says
 * something. Without `now` the year is always given.
 */
export function banjulDate(ms: number | null, now?: number): string {
  if (ms === null) return "—";
  return now !== undefined && utcYear(ms) === utcYear(now) ? DATE.format(ms) : DATE_YEAR.format(ms);
}

/** "14 Oct, 09:12" — or "14 Oct 2025, 09:12" for another year. */
export function banjulDateTime(ms: number | null, now?: number): string {
  if (ms === null) return "—";
  return `${banjulDate(ms, now)}, ${banjulTime(ms)}`;
}

/** "Wed 14 Oct, 09:00–09:50" for a session. */
export function banjulSlot(startsAt: number | null, endsAt: number | null): string {
  if (startsAt === null) return "—";
  const end = endsAt !== null && endsAt > startsAt ? `–${banjulTime(endsAt)}` : "";
  return `${WEEKDAY_DATE.format(startsAt)}, ${banjulTime(startsAt)}${end}`;
}

/** A heading for one day of the audit log: "Today", "Yesterday", "Monday 12 October". */
export function banjulDayLabel(ms: number, now: number): string {
  const day = dayStart(ms);
  const today = dayStart(now);
  if (day === today) return "Today";
  if (day === today - DAY_MS) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(utcYear(ms) === utcYear(now) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(ms);
}

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

// Each unit and how many of it make the next one up.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
];

/** "3 hours ago", "in 2 days", "just now". The same in every zone. */
export function relativeTime(at: number | null, now: number): string {
  if (at === null) return "—";
  const seconds = (at - now) / 1000;
  if (Math.abs(seconds) < 45) return "just now";
  let value = seconds / 60;
  for (const [unit, size] of UNITS) {
    if (Math.abs(value) < size) return RELATIVE.format(Math.round(value), unit);
    value /= size;
  }
  return RELATIVE.format(Math.round(value), "year");
}

/** "50 min", "1 h 30 min". */
export function duration(startsAt: number | null, endsAt: number | null): string {
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return "—";
  const minutes = Math.round((endsAt - startsAt) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${minutes} min`;
}

/**
 * The picker's choice as the range the callables take, in whole Banjul days.
 *
 * DateRangePicker counts days in the browser's own zone; that is right on a
 * dashboard of charts, and wrong here, where "today" has to be the day the
 * server counts sessions and money in. Presets are counted again from UTC
 * midnight. A custom range keeps the dates the person typed — the picker
 * stores them as local midnights, which are read back as the same calendar
 * dates in UTC. "All time" is open at both ends: sessions booked for next
 * month are in it.
 */
export function banjulRange(value: DateRangeValue, now: number): DateRange {
  const today = dayStart(now);
  const endOfToday = today + DAY_MS - 1;
  const daysBack = (days: number) => today - (days - 1) * DAY_MS;
  switch (value.preset) {
    case "7d":
      return { from: daysBack(7), to: endOfToday };
    case "30d":
      return { from: daysBack(30), to: endOfToday };
    case "90d":
      return { from: daysBack(90), to: endOfToday };
    case "12m": {
      const d = new Date(today);
      return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, d.getUTCDate() + 1), to: endOfToday };
    }
    case "all":
      return { from: null, to: null };
    case "custom":
      return {
        from: value.from === undefined ? null : sameDateInUtc(value.from),
        to: value.to === undefined ? endOfToday : sameDateInUtc(value.to) + DAY_MS - 1,
      };
  }
}

/** The calendar date a local time falls on, as UTC midnight of that date. */
function sameDateInUtc(localMs: number): number {
  const d = new Date(localMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** A key for "the same filter", so a list knows when to start again from the top. */
export function rangeKey(range: DateRange): string {
  return `${range.from ?? ""}-${range.to ?? ""}`;
}

/** "FJ" from "Fatou Jallow"; "?" when there is no name to take letters from. */
export function initials(name: string | null | undefined): string {
  return (
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/** "1 session", "3 sessions". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}
