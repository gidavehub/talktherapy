import {
  K_ANONYMITY,
  SUPPRESSED_TEXT,
  countText,
  type Category,
  type Cell,
  type ResolvedRange,
  type SeriesPoint,
  type Share,
} from "@/lib/adminStats";
import type { BarDatum, ChartTableData } from "@/components/ui/charts";

/**
 * Words and tables for the staff dashboards, worked out from the figures the
 * adminStats function returned.
 *
 * Everything here reads only what is on show. A withheld count arrives as
 * null and stays one: a sentence that needs it says "fewer than 5", a table
 * says "<5", and nothing is ever added up or taken away to stand in for it —
 * that would undo the withholding the function did.
 *
 * Days, weeks and hours are UTC, as the function counts them (Gambian time
 * is UTC), so every date here is formatted in UTC whatever the staff
 * member's own clock says.
 */

type Bucket = ResolvedRange["bucket"];
type Count = { value: number | null; suppressed: boolean };

const UTC = "UTC";
const WEEKDAY_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: UTC });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: UTC });
const FULL_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: UTC });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: UTC });
const FULL_MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: UTC });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UTC });
const WHOLE = new Intl.NumberFormat("en-GB");
const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });
const PERCENT_FINE = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

// ---------------------------------------------------------------- dates

/** One bucket of a series as a label: "Tue 8 Oct", "Week of 7 Oct", "Oct 2026". */
export function bucketLabel(t: number, bucket: Bucket): string {
  if (bucket === "day") return WEEKDAY_DAY.format(t);
  if (bucket === "week") return `Week of ${DAY_MONTH.format(t)}`;
  return MONTH_YEAR.format(t);
}

/** "7 Oct" — a week's column in a grid, where "Week of" would not fit. */
export function dayMonthText(ms: number): string {
  return DAY_MONTH.format(ms);
}

/** "8 Oct 2026" */
export function dayText(ms: number): string {
  return FULL_DAY.format(ms);
}

/** "14:30 UTC" */
export function clockText(ms: number): string {
  return `${CLOCK.format(ms)} UTC`;
}

/** A month key as words: "2026-09" → "September 2026". */
export function monthText(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return FULL_MONTH.format(Date.UTC(year, index - 1, 1));
}

/** The days a range covers: "15 Sep – 14 Oct 2026", or "September 2026" for a whole month. */
export function rangeText(range: ResolvedRange): string {
  if (range.preset === "month") return FULL_MONTH.format(range.from);
  if (range.days === 1) return dayText(range.from);
  const sameYear = new Date(range.from).getUTCFullYear() === new Date(range.to).getUTCFullYear();
  return `${sameYear ? DAY_MONTH.format(range.from) : dayText(range.from)} – ${dayText(range.to)}`;
}

/** How long a range is, for "in the last …" and "vs the … before". */
export function periodText(range: ResolvedRange): string {
  if (range.preset === "12m") return "12 months";
  if (range.preset === "month") return "month";
  return range.days === 1 ? "day" : `${range.days} days`;
}

/** Where a count happened, for a takeaway: "in these 30 days", "on this day", "in this month". */
export function inPeriodText(range: ResolvedRange): string {
  if (range.preset === "month") return "in this month";
  return range.days === 1 ? "on this day" : `in these ${periodText(range)}`;
}

/** A date as the UTC day it falls on: "2026-10-14", for file names. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// -------------------------------------------------------------- numbers

/** A count as staff read it: "<5", "1,204", or "—" when there is nothing. */
export function cellText(c: Count): string {
  return c.suppressed ? SUPPRESSED_TEXT : c.value === null ? "—" : countText(c.value, false);
}

/** A count inside a sentence: "fewer than 5" rather than "<5". */
export function countWords(c: Count): string {
  return c.suppressed ? `fewer than ${K_ANONYMITY}` : WHOLE.format(c.value ?? 0);
}

/** A sentence's first letter in capitals, for one that starts with "fewer than 5". */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A label's first letter in lower case, for the middle of a sentence ("the week of 7 Oct"). */
export function uncapitalise(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The count when it is on show, otherwise null. Never a guess at a withheld one. */
export function shownValue(c: Count): number | null {
  return c.suppressed ? null : c.value;
}

/** "37%", "2.1%" for small shares where the decimal still says something, "<1%". */
export function percentText(fraction: number): string {
  if (fraction > 0 && fraction < 0.01) return "<1%";
  return (fraction < 0.1 ? PERCENT_FINE : PERCENT).format(fraction);
}

/** A proportion as a figure, or "—" when either side of it is withheld. */
export function shareText(s: Share): string {
  return s.suppressed || s.rate === null ? "—" : percentText(s.rate);
}

/** "6 min 27 s", "45 s", "12 min". */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** "1 refund", "73 payments". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${WHOLE.format(n)} ${n === 1 ? one : many}`;
}

// ------------------------------------------------------- reading a chart

/** Nothing to draw: every count is zero (or there is no value) and none is withheld. */
export function isQuiet(list: readonly Count[]): boolean {
  return list.every((c) => !c.suppressed && !c.value);
}

/** The biggest part on show, if any is above zero. */
export function largest<T extends Count>(list: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of list) {
    if (!c.suppressed && c.value !== null && c.value > 0 && (best === null || c.value > (best.value ?? 0))) best = c;
  }
  return best;
}

const NOBODY: Count = { value: 0, suppressed: false };

/** One part of a breakdown by its key; nobody when it is not there. */
export function pick(list: readonly Category[], key: string): Count {
  return list.find((c) => c.key === key) ?? NOBODY;
}

/**
 * The share base for bars that are the parts of one whole: their own sum
 * (left out) while every part is on show, and no shares once one is hidden —
 * the shown sum would then be short of the real total and overstate each.
 */
export function wholeShare(list: readonly Category[]): null | undefined {
  return list.some((c) => c.suppressed) ? null : undefined;
}

/** A total the function gave, as the base for shares; none when it is withheld or zero. */
export function shareBase(total: Cell, label: string): { total: number; label: string } | null {
  return !total.suppressed && total.value ? { total: total.value, label } : null;
}

/** The takeaway for a ranking: its biggest part, phrased by the card. */
export function leadText(
  list: readonly Category[],
  whole: Cell | number | null,
  phrase: (label: string, part: string) => string,
): string | undefined {
  const top = largest(list);
  return top ? phrase(top.label, partOf(top.value ?? 0, whole)) : undefined;
}

/** "25 of 68 (37%)", or just "25" when the whole is withheld. */
export function partOf(part: number, whole: Cell | number | null): string {
  const total = typeof whole === "number" ? whole : whole && !whole.suppressed ? whole.value : null;
  return total ? `${WHOLE.format(part)} of ${WHOLE.format(total)} (${percentText(part / total)})` : WHOLE.format(part);
}

/**
 * A line saying when a signal began, for a chart whose figures only exist
 * from the release that started recording them and whose dates reach back
 * before it. Nothing when it began before the dates (or has not begun: the
 * chart's empty message says that).
 */
export function sinceNote(since: number | null, range: ResolvedRange, what: string): string | undefined {
  return since !== null && since > range.from ? `${what} are counted from ${dayText(since)}; earlier days show none.` : undefined;
}

// --------------------------------------------------------- chart inputs

export function toBars(list: readonly Category[]): BarDatum[] {
  return list.map((c) => ({ label: c.label, value: c.value ?? 0, suppressed: c.suppressed }));
}

export function seriesBars(points: readonly SeriesPoint[], bucket: Bucket): BarDatum[] {
  return points.map((p) => ({ label: bucketLabel(p.t, bucket), value: p.value ?? 0, suppressed: p.suppressed }));
}

/**
 * A sparkline's values, or nothing. A trend line has no way to show a
 * withheld point, and plotting a guess in its place would draw a shape the
 * figures do not have, so any withheld point drops the line altogether.
 * Points with nothing to show (no conversations that day, so no median) are
 * simply left out.
 */
export function sparkValues(points: readonly SeriesPoint[]): number[] | undefined {
  if (points.some((p) => p.suppressed)) return undefined;
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  return values.length > 1 ? values : undefined;
}

// --------------------------------------------------------- table twins

/**
 * A breakdown as rows. `shareOf` is the whole each share is of, matching
 * what the chart's tooltip says: a total given by the function, null for no
 * share column, or left out for the parts' shown total.
 */
export function categoryTable(
  list: readonly Category[],
  {
    label,
    value,
    shareOf,
    format,
  }: { label: string; value: string; shareOf?: { total: number } | null; format?: (v: number) => string },
): ChartTableData {
  const sum = list.reduce((s, c) => s + (c.suppressed ? 0 : (c.value ?? 0)), 0);
  const total = shareOf === undefined ? sum : shareOf?.total ?? null;
  return {
    columns: total === null ? [label, value] : [label, value, "Share"],
    rows: list.map((c) => {
      const shown: string | number = c.suppressed ? SUPPRESSED_TEXT : c.value === null ? "—" : format ? format(c.value) : c.value;
      if (total === null) return [c.label, shown];
      const share = c.suppressed || c.value === null || !total ? "—" : percentText(c.value / total);
      return [c.label, shown, share];
    }),
  };
}

/** A series as rows, one per bucket, oldest first. */
export function seriesTable(
  points: readonly SeriesPoint[],
  bucket: Bucket,
  { value, format, empty = "—" }: { value: string; format?: (v: number) => string; empty?: string },
): ChartTableData {
  return {
    columns: [bucket === "day" ? "Day" : bucket === "week" ? "Week" : "Month", value],
    rows: points.map((p) => [
      bucketLabel(p.t, bucket),
      p.suppressed ? SUPPRESSED_TEXT : p.value === null ? empty : format ? format(p.value) : p.value,
    ]),
  };
}
