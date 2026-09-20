"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Stamp } from "../ui/Typography";

/**
 * Standard hero block for every public page that isn't the landing page.
 *
 * Owns the `pt-[120px] md:pt-[180px]` offset that clears the absolutely
 * positioned Header — the landing page gets that from `Hero` instead, which is
 * why this is a separate component rather than something in the layout.
 *
 * Lines animate in per-line with the same clip-path wipe used across the
 * marketing site, so a new page reads as part of the same set.
 */
export default function PageIntro({
  eyebrow,
  lines,
  lede,
  children,
  stamp,
  tone = "light",
}: {
  eyebrow: string;
  lines: string[];
  lede?: React.ReactNode;
  /** CTAs or anything else below the lede. */
  children?: React.ReactNode;
  /** Oversized italic watermark behind the block. */
  stamp?: string;
  tone?: "light" | "dark";
}) {
  const onDark = tone === "dark";

  return (
    <section
      className={`relative overflow-hidden px-4 sm:px-6 md:px-10 pt-[120px] md:pt-[180px] pb-14 md:pb-20 ${
        onDark ? "bg-[var(--dark)] text-white" : "bg-[var(--background)]"
      }`}
    >
      {stamp ? (
        <Stamp
          className={`absolute inset-x-0 bottom-0 text-[22vw] md:text-[16vw] text-center ${
            onDark ? "text-white/[0.06]" : "text-[var(--foreground)]/[0.05]"
          }`}
        >
          {stamp}
        </Stamp>
      ) : null}

      <div className="relative z-10 max-w-[1400px] mx-auto">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.1 }}
          className={`h-px origin-left ${
            onDark ? "bg-white/25" : "bg-[var(--foreground)]/25"
          }`}
        />

        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.18 }}
          className={`mt-3 text-[11px] md:text-[12px] uppercase tracking-[0.22em] ${
            onDark ? "text-white/65" : "text-[var(--foreground)]/80"
          }`}
        >
          {eyebrow}
        </motion.p>

        <motion.h1
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } },
          }}
          className="mt-5 text-[36px] sm:text-[48px] md:text-[64px] lg:text-[72px] leading-[0.98] tracking-[-0.025em] font-medium max-w-[900px]"
        >
          {lines.map((line, i) => (
            <motion.span
              key={`${line}-${i}`}
              className="block"
              variants={{
                hidden: { y: 60, opacity: 0, clipPath: "inset(0 0 100% 0)" },
                show: {
                  y: 0,
                  opacity: 1,
                  clipPath: "inset(0 0 0% 0)",
                  transition: { ...SPRING_SOFT, mass: 1.1 },
                },
              }}
            >
              {line}
            </motion.span>
          ))}
        </motion.h1>

        {lede ? (
          <motion.p
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.55 }}
            className={`mt-6 md:mt-8 text-[14px] md:text-[17px] leading-relaxed max-w-[620px] ${
              onDark ? "text-white/70" : "text-[var(--muted)]"
            }`}
          >
            {lede}
          </motion.p>
        ) : null}

        {children ? (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.7 }}
            className="mt-9 md:mt-11"
          >
            {children}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
