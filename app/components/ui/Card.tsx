"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/**
 * Surface primitives.
 *
 * Radii and shadows follow the landing page exactly: small cards `rounded-2xl`,
 * large surfaces `rounded-[28px] md:rounded-[36px]`, and every shadow is a big
 * blur with a big negative spread so it reads as lift rather than a drop.
 */

type Tone = "light" | "dark" | "bare";

const TONES: Record<Tone, string> = {
  light: "bg-[var(--surface)] shadow-[var(--shadow-card)] border border-[var(--dark)]/[0.05]",
  dark: "bg-[var(--dark)] text-[var(--cream)] shadow-[var(--shadow-floating)]",
  bare: "border border-[var(--border)]",
};

const RADII = {
  sm: "rounded-2xl",
  md: "rounded-[28px]",
  lg: "rounded-[28px] md:rounded-[36px]",
} as const;

export default function Card({
  children,
  tone = "light",
  radius = "sm",
  padding = "p-5 md:p-6",
  hover = false,
  reveal = true,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  radius?: keyof typeof RADII;
  padding?: string;
  /** Lifts on hover. Use for anything clickable. */
  hover?: boolean;
  /** Scroll-reveal on entry. Turn off inside already-animating parents. */
  reveal?: boolean;
  delay?: number;
  className?: string;
}) {
  const shell = `${RADII[radius]} ${TONES[tone]} ${padding} ${className}`;

  return (
    <motion.div
      initial={reveal ? { y: 28, opacity: 0 } : undefined}
      whileInView={reveal ? { y: 0, opacity: 1 } : undefined}
      viewport={reveal ? { once: true, amount: 0.2 } : undefined}
      transition={{ ...SPRING_SOFT, delay }}
      whileHover={hover ? { y: -4 } : undefined}
      className={shell}
    >
      {children}
    </motion.div>
  );
}

/**
 * Small metric card — number, label, and an icon chip.
 *
 * Lifted from the hero's floating stat cards so dashboard tiles match the
 * marketing page without a second visual language.
 */
export function StatTile({
  label,
  value,
  caption,
  icon,
  delay = 0,
  className = "",
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon?: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0, rotate: -1 }}
      whileInView={{ y: 0, opacity: 1, rotate: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ ...SPRING_SOFT, delay }}
      whileHover={{ y: -4, scale: 1.02 }}
      className={`rounded-[22px] bg-[var(--surface)] shadow-[var(--shadow-card)] border border-[var(--dark)]/[0.05] px-5 py-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--muted)] tracking-wide truncate">
            {label}
          </p>
          <div className="font-display mt-3 flex items-baseline gap-1 text-[30px] leading-none font-medium text-[var(--foreground)]">
            {value}
            {caption ? (
              <span className="ml-2 text-[11px] text-[var(--muted)] font-normal tracking-wide">
                {caption}
              </span>
            ) : null}
          </div>
        </div>
        {icon ? (
          <span className="arch shrink-0 flex h-11 w-10 items-center justify-center rounded-b-lg bg-[var(--sage)] text-white">
            {icon}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * The redesign's banded panel: sage green, with the concentric arches rising
 * at the right — "Not sure who to choose? Let TALK match you." Used for the
 * AI companion surfaces and any CTA that should feel like the product.
 */
export function DarkPanel({
  children,
  className = "",
  padding = "px-6 md:px-12 py-10 md:py-14",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] md:rounded-[36px] bg-[var(--sage)] text-[var(--cream)] ${padding} ${className}`}
    >
      <ArchStack className="absolute -bottom-6 right-[-60px] hidden h-[115%] md:block" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Concentric arches with a terracotta sun — the bands' decoration. */
export function ArchStack({
  className = "",
  colors = ["#8FA582", "#B9C8AC", "#F4EADD"],
}: {
  className?: string;
  colors?: [string, string, string] | string[];
}) {
  return (
    <svg aria-hidden viewBox="0 0 320 300" preserveAspectRatio="xMidYMax meet" className={className}>
      <path d="M0 300V160a160 160 0 0 1 320 0v140z" fill={colors[0]} />
      <path d="M45 300V165a115 115 0 0 1 230 0v135z" fill={colors[1]} />
      <path d="M90 300V170a70 70 0 0 1 140 0v130z" fill={colors[2]} />
      <circle cx="160" cy="190" r="26" fill="#C8754E" />
    </svg>
  );
}
