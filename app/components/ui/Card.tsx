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
  light: "bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.18)]",
  dark: "bg-[var(--dark)] text-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.5)]",
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
      className={`rounded-2xl bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.18)] px-5 py-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--muted)] tracking-wide truncate">
            {label}
          </p>
          <div className="mt-3 flex items-baseline gap-1 text-[28px] leading-none font-medium text-[var(--foreground)]">
            {value}
            {caption ? (
              <span className="ml-2 text-[11px] text-[var(--muted)] font-normal tracking-wide">
                {caption}
              </span>
            ) : null}
          </div>
        </div>
        {icon ? (
          <span className="shrink-0 h-10 w-10 rounded-full bg-[var(--dark)] text-white flex items-center justify-center">
            {icon}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * Full-bleed dark panel with the two ambient orange blooms from
 * ConsultationBanner. Used for the AI companion surfaces and any CTA that
 * needs to feel like the product rather than the brochure.
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
      className={`relative overflow-hidden rounded-[28px] md:rounded-[40px] bg-[var(--dark)] text-white ${padding} ${className}`}
    >
      <div
        aria-hidden
        className="absolute -right-20 -top-24 h-[320px] w-[320px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,122,69,0.55), rgba(255,90,31,0))",
          filter: "blur(12px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -left-16 -bottom-20 h-[260px] w-[260px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,90,31,0.35), rgba(255,90,31,0))",
          filter: "blur(20px)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
