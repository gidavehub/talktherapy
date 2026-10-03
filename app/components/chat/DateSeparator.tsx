"use client";

/**
 * "Today" / "Yesterday" / "12 March 2026" between days in a thread.
 *
 * Uses the uppercase tracked label from the rest of the app rather than a
 * pill, so the thread still reads as this product and not as a copy of a
 * messaging app.
 */

/** Local-date key, not UTC, so "today" means the user's today. */
function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** True when these two messages belong under different date headings. */
export function startsNewDay(timestamp: number, previous: number | null): boolean {
  if (previous == null) return true;
  return dayKey(timestamp) !== dayKey(previous);
}

export function dayLabel(timestamp: number): string {
  const now = new Date();
  const today = dayKey(now.getTime());

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  if (dayKey(timestamp) === today) return "Today";
  if (dayKey(timestamp) === dayKey(yesterdayDate.getTime())) return "Yesterday";

  const date = new Date(timestamp);
  // en-GB throughout: this is a Gambian product and the copy is British.
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    // Only name the year when it is not this one — "12 March" is how someone
    // would actually say it.
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export default function DateSeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {dayLabel(timestamp)}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
