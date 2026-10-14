"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { useNow } from "../../lib/useNow";

/**
 * What happened to something, in order: a payment received, held, granted;
 * a provider applied, was asked for a licence, was approved.
 *
 * Every entry shows both times. "3 hours ago" is what a person scanning
 * wants; "14 Oct, 09:12" is what they quote to Modem Pay or to the provider
 * on the phone. Items are drawn in the order given, so sort them first.
 */

export type TimelineTone = "neutral" | "positive" | "warning" | "danger" | "accent";

export type TimelineItem = {
  id: string;
  /** When it happened, in milliseconds since the epoch. */
  at: number;
  title: string;
  body?: React.ReactNode;
  tone?: TimelineTone;
  /** Who did it: a name, "Talk", "Modem Pay". */
  actor?: string;
};

// The dot in the tone's colour, ringed in its soft tint so it reads on cream
// and on white alike.
const DOTS: Record<TimelineTone, string> = {
  neutral: "bg-[var(--muted)] shadow-[0_0_0_4px_var(--sand)]",
  positive: "bg-[var(--success)] shadow-[0_0_0_4px_var(--success-soft)]",
  warning: "bg-[var(--warning)] shadow-[0_0_0_4px_var(--warning-soft)]",
  danger: "bg-[var(--danger)] shadow-[0_0_0_4px_var(--danger-soft)]",
  // The accent has no translucent tint of its own, so one is mixed from it.
  accent: "bg-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
};

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

// Each unit and how many of it make the next one up.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
];

function relativeTime(at: number, now: number): string {
  const seconds = (at - now) / 1000;
  if (Math.abs(seconds) < 45) return "just now";
  let value = seconds / 60;
  for (const [unit, size] of UNITS) {
    if (Math.abs(value) < size) return RELATIVE.format(Math.round(value), unit);
    value /= size;
  }
  return RELATIVE.format(Math.round(value), "year");
}

function absoluteTime(at: number, now: number): string {
  const date = new Date(at);
  // The year only when it is not this one: "14 Oct, 09:12" for this
  // autumn, "14 Oct 2025, 09:12" for last.
  const thisYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Timeline({
  items,
  emptyText = "Nothing has happened yet.",
  className = "",
}: {
  items: TimelineItem[];
  emptyText?: string;
  className?: string;
}) {
  // A minute is fine enough for "3 minutes ago", and keeps an open drawer
  // honest without re-rendering every second.
  const now = useNow(60_000);

  if (items.length === 0) {
    return <p className={`text-[13px] text-[var(--muted)] ${className}`}>{emptyText}</p>;
  }

  return (
    <ol className={className}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const valid = Number.isFinite(item.at);
        const absolute = valid ? absoluteTime(item.at, now) : "";
        return (
          <motion.li
            key={item.id}
            initial={{ x: -12, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ ...SPRING_SOFT, delay: Math.min(i, 6) * 0.04 }}
            className={`relative pl-8 ${last ? "" : "pb-7"}`}
          >
            {last ? null : (
              <span aria-hidden className="absolute left-[5px] top-4 bottom-0 w-px bg-[var(--border)]" />
            )}
            <span
              aria-hidden
              className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full ${DOTS[item.tone ?? "neutral"]}`}
            />

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[14px] font-medium leading-snug text-[var(--foreground)]">{item.title}</p>
              {valid ? (
                // The server renders this a moment earlier than the browser
                // does, so the minute may legitimately differ on hydration.
                <time
                  dateTime={new Date(item.at).toISOString()}
                  suppressHydrationWarning
                  className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]"
                >
                  {relativeTime(item.at, now)} · {absolute}
                </time>
              ) : null}
            </div>
            {item.actor ? (
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">by {item.actor}</p>
            ) : null}
            {item.body ? (
              <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{item.body}</div>
            ) : null}
          </motion.li>
        );
      })}
    </ol>
  );
}
