"use client";

import { motion } from "motion/react";
import { useNow } from "../../lib/useNow";

/**
 * How long is left of a paid conversation — a ring that empties, and the time.
 *
 * Two clocks, and the earlier wins: the intake's own budget (eight minutes to
 * reach providers), and the paid window the server holds the conversation to.
 * The ring is for somebody who cannot read the number; Talk also says so out
 * loud as the end comes near (the model is told the time left on every turn).
 *
 * Its own component, ticking on its own, so the screen with the particles is
 * not re-rendered every second.
 */
export default function ConversationClock({
  startedAt,
  budgetMs,
  endsAt,
}: {
  /** When the conversation began, for the intake's budget. */
  startedAt: number | null;
  /** The intake's budget, or null outside the intake. */
  budgetMs: number | null;
  /** The paid window's end, from the server, once the clock has started. */
  endsAt: number | null;
}) {
  const now = useNow(1000);
  const ends = [startedAt !== null && budgetMs !== null ? startedAt + budgetMs : null, endsAt].filter(
    (t): t is number => t !== null,
  );
  if (!ends.length) return null;
  const end = Math.min(...ends);
  const span = budgetMs ?? (endsAt !== null && startedAt !== null ? endsAt - startedAt : null);
  const left = Math.max(0, end - now);
  const fraction = span ? Math.min(1, left / span) : 1;
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const late = left <= 2 * 60_000;

  const R = 9;
  const C = 2 * Math.PI * R;
  return (
    <span
      role="timer"
      aria-label={`${minutes} minute${minutes === 1 ? "" : "s"} left`}
      className={`inline-flex items-center gap-2 text-[11px] tabular-nums tracking-[0.14em] ${
        late ? "text-[var(--accent)]" : "text-white/55"
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r={R} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <motion.circle
          cx="11"
          cy="11"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - fraction) }}
          transition={{ duration: 0.9, ease: "linear" }}
          transform="rotate(-90 11 11)"
        />
      </svg>
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}
