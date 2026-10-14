"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Skeleton } from "./Feedback";
import Sparkline from "./charts/Sparkline";

/**
 * A dashboard figure: label, number, how it moved, and optionally a trend.
 *
 * StatTile's bigger sibling — same shell, same serif number — with the
 * comparison a dashboard needs. The delta chip is sage when the move is good
 * and danger-red when it is bad, but the colour never works alone: the arrow
 * gives the direction, the signed percentage the size, and the word "better"
 * or "worse" the meaning. That word has to be visible, not only spoken:
 * with `invert`, a falling number is good news, and sage against red is the
 * pair a red-green colour-blind reader cannot tell apart. Screen readers hear
 * "up 12%, an improvement". `invert` is for numbers where down is good
 * (waiting time, missed sessions).
 */

const PERCENT_WHOLE = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 0,
});
const PERCENT_FINE = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** 12% for big moves, 4.5% for small ones, where the decimal still matters. */
function formatDelta(fraction: number) {
  const size = Math.abs(fraction);
  return (size < 0.1 ? PERCENT_FINE : PERCENT_WHOLE).format(size);
}

function DeltaChip({
  delta,
  invert,
}: {
  delta: number;
  invert: boolean;
}) {
  const percent = formatDelta(delta);
  // Rounds to 0% means no change worth colouring.
  const flat = percent === "0%";
  const up = delta > 0;
  const good = up !== invert;

  // Every pairing clears 4.5:1 at this size. Full-strength sage-pale behind
  // sage-deep is only 4.0:1, so the good chip uses a lighter wash of it, and
  // the flat chip uses dark-soft because muted on sand is 4.2:1.
  const tone = flat
    ? "bg-[var(--sand)] text-[var(--dark-soft)]"
    : good
      ? "bg-[var(--sage-pale)]/45 text-[var(--sage-deep)]"
      : "bg-[var(--danger-soft)] text-[var(--danger)]";

  const spoken = flat
    ? "No change"
    : `${up ? "Up" : "Down"} ${percent}, ${good ? "an improvement" : "a worsening"}`;

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium tabular-nums ${tone}`}
    >
      <svg
        aria-hidden
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {flat ? (
          <path d="M5 12h14" />
        ) : up ? (
          <path d="M12 19V5M6 11l6-6 6 6" />
        ) : (
          <path d="M12 5v14M6 13l6 6 6-6" />
        )}
      </svg>
      <span aria-hidden>{flat ? "No change" : `${up ? "+" : "−"}${percent}`}</span>
      {flat ? null : (
        <span aria-hidden className="font-normal">
          {good ? "better" : "worse"}
        </span>
      )}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

export default function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  invert = false,
  caption,
  icon,
  spark,
  loading = false,
  href,
  delay = 0,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  /** The change as a fraction: 0.12 is +12%. */
  delta?: number;
  /** What the change is against, e.g. "vs previous 30 days". */
  deltaLabel?: string;
  /** Down is good (waiting times, no-shows). */
  invert?: boolean;
  caption?: string;
  icon?: React.ReactNode;
  /** A short trend, oldest first. The latest point is marked in the accent. */
  spark?: number[];
  loading?: boolean;
  /** Makes the whole card a link to the detail behind the number. */
  href?: string;
  delay?: number;
  className?: string;
}) {
  const shell = `flex h-full flex-col rounded-[22px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)] ${className}`;

  if (loading) {
    return (
      <div role="status" aria-label={`Loading ${label}`} aria-busy="true" className={shell}>
        <Skeleton className="h-3 w-24" rounded="rounded-full" />
        <Skeleton className="mt-4 h-8 w-28" rounded="rounded-xl" />
        <Skeleton className="mt-4 h-5 w-32" rounded="rounded-full" />
      </div>
    );
  }

  const hasDelta = typeof delta === "number" && Number.isFinite(delta);

  const card = (
    <div className={shell}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[12px] tracking-wide text-[var(--muted)]">{label}</p>
          {/* A div, not a p: `value` is any node, and a block inside a p is
              invalid HTML that React flags as a hydration error. */}
          <div className="font-display mt-3 text-[30px] font-medium leading-none text-[var(--foreground)]">
            {value}
          </div>
        </div>
        {icon ? (
          <span className="arch flex h-11 w-10 shrink-0 items-center justify-center rounded-b-lg bg-[var(--sage)] text-white">
            {icon}
          </span>
        ) : null}
      </div>

      {hasDelta ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <DeltaChip delta={delta} invert={invert} />
          {deltaLabel ? (
            <span className="text-[11.5px] leading-snug text-[var(--muted)]">{deltaLabel}</span>
          ) : null}
        </div>
      ) : null}

      {caption ? (
        <p className="mt-2 text-[12px] leading-snug text-[var(--muted)]">{caption}</p>
      ) : null}

      {spark && spark.length > 1 ? (
        <div className="mt-auto pt-3">
          <Sparkline values={spark} height={32} />
        </div>
      ) : null}
    </div>
  );

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ ...SPRING_SOFT, delay }}
      whileHover={href ? { y: -4 } : undefined}
      className="h-full"
    >
      {href ? (
        <Link
          href={href}
          // A solid ring: the whole card is the control, and a faint wash
          // around a pale card is easy to miss.
          className="block h-full rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          {card}
        </Link>
      ) : (
        card
      )}
    </motion.div>
  );
}
