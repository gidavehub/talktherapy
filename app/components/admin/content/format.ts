/**
 * Times as the content editor says them. Gambian time is UTC, and staff read
 * these in The Gambia, so every date is drawn in UTC whatever the computer's
 * own zone.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 Oct 2026, 14:05". */
export function when(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "14:05". */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", then the date. `now` from useNow. */
export function ago(ms: number, now: number): string {
  const gap = Math.max(0, now - ms);
  if (gap < MINUTE) return "just now";
  if (gap < HOUR) {
    const m = Math.floor(gap / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (gap < DAY) {
    const h = Math.floor(gap / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (gap < 2 * DAY) return "yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
