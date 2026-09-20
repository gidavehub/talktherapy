"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/**
 * Type primitives.
 *
 * The landing page repeats one heading recipe in five places — eyebrow, then
 * a headline whose lines wipe up under a clip-path, then a muted lede. It is
 * the single most recognisable thing about the design, so it lives here rather
 * than being re-typed per screen.
 */

/** Uppercase micro-label above a heading. `mt-3` to the heading is the rhythm. */
export function Eyebrow({
  children,
  onDark = false,
  className = "",
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] uppercase tracking-[0.22em] ${
        onDark ? "text-white/65" : "text-[var(--muted)]"
      } ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * The headline reveal: each line wipes up from behind a clip-path, staggered.
 *
 * Pass `lines` as separate strings rather than one string with `<br/>` — the
 * animation is per-line and needs real elements to drive.
 */
export function RevealHeading({
  lines,
  as: Tag = "h2",
  size = "section",
  onDark = false,
  className = "",
  delayChildren = 0.15,
  once = true,
}: {
  lines: string[];
  as?: "h1" | "h2" | "h3";
  size?: "hero" | "section" | "panel";
  onDark?: boolean;
  className?: string;
  delayChildren?: number;
  once?: boolean;
}) {
  const sizes = {
    hero: "text-[36px] sm:text-[44px] md:text-[60px] lg:text-[68px] leading-[0.98] tracking-[-0.025em]",
    section:
      "text-[34px] sm:text-[44px] md:text-[52px] leading-[1.02] tracking-[-0.02em]",
    panel: "text-[24px] sm:text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.02em]",
  } as const;

  const MotionTag = motion[Tag];

  return (
    <MotionTag
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.3 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren } },
      }}
      className={`font-medium ${sizes[size]} ${onDark ? "text-white" : ""} ${className}`}
    >
      {lines.map((line, i) => (
        <motion.span
          key={`${line}-${i}`}
          className="block"
          variants={{
            hidden: { y: 50, opacity: 0, clipPath: "inset(0 0 100% 0)" },
            show: {
              y: 0,
              opacity: 1,
              clipPath: "inset(0 0 0% 0)",
              transition: SPRING_SOFT,
            },
          }}
        >
          {line}
        </motion.span>
      ))}
    </MotionTag>
  );
}

/** Muted supporting paragraph under a heading. */
export function Lede({
  children,
  onDark = false,
  className = "",
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <motion.p
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ ...SPRING_SOFT, delay: 0.1 }}
      className={`text-[14px] md:text-[16px] leading-relaxed ${
        onDark ? "text-white/70" : "text-[var(--muted)]"
      } ${className}`}
    >
      {children}
    </motion.p>
  );
}

/**
 * Eyebrow + heading + lede as one block, since that trio appears at the top of
 * nearly every section.
 */
export function SectionHeading({
  eyebrow,
  lines,
  lede,
  as = "h2",
  size = "section",
  align = "left",
  onDark = false,
  className = "",
}: {
  eyebrow?: string;
  lines: string[];
  lede?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: "hero" | "section" | "panel";
  align?: "left" | "center";
  onDark?: boolean;
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "text-center mx-auto max-w-[640px]" : ""} ${className}`}>
      {eyebrow ? (
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={SPRING_SOFT}
        >
          <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>
        </motion.div>
      ) : null}
      <RevealHeading
        lines={lines}
        as={as}
        size={size}
        onDark={onDark}
        className={eyebrow ? "mt-3" : ""}
      />
      {lede ? (
        <Lede onDark={onDark} className={`mt-4 ${centered ? "mx-auto max-w-[560px]" : "max-w-[520px]"}`}>
          {lede}
        </Lede>
      ) : null}
    </div>
  );
}

/**
 * The oversized italic serif watermark. The only place Instrument Serif is
 * used anywhere in the product — see `.stamp` in globals.css.
 */
export function Stamp({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`stamp select-none pointer-events-none ${className}`}
    >
      {children}
    </div>
  );
}
