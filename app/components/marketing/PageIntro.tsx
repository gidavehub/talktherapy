"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/**
 * The top band of every public page that isn't the home page — the
 * providers page's: "OUR PROVIDERS" in terracotta, a serif headline whose
 * last line is italic sage, a line beneath, anything else (a search bar),
 * and a great arch rising at the right. A row of terracotta triangles closes
 * it.
 *
 * Leaves room at the top for the Header, which sits over it.
 */
export default function PageIntro({
  eyebrow,
  lines,
  lede,
  children,
  tone = "light",
}: {
  eyebrow: string;
  lines: string[];
  lede?: React.ReactNode;
  /** A search bar, CTAs — anything under the lede. */
  children?: React.ReactNode;
  /** Kept for the pages that pass one; the redesign has no watermark. */
  stamp?: string;
  tone?: "light" | "dark";
}) {
  const onDark = tone === "dark";

  return (
    <>
      <section
        className={`relative overflow-hidden pt-[112px] md:pt-[128px] ${
          onDark ? "bg-[var(--dark)] text-[var(--cream)]" : "bg-[var(--cream)]"
        }`}
      >
        {/* The arch at the right: pale sage, sage, and the terracotta sun. */}
        <motion.svg
          aria-hidden
          viewBox="0 0 240 300"
          preserveAspectRatio="xMidYMax meet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.2 }}
          className="pointer-events-none absolute bottom-0 right-[3%] hidden h-[86%] md:block lg:right-[6%]"
        >
          <path d="M0 300V120a120 120 0 0 1 240 0v180z" fill={onDark ? "#5B433C" : "#DDE5D3"} />
          <path d="M32 300V128a88 88 0 0 1 176 0v172z" fill={onDark ? "#6E8763" : "#A9BC9C"} />
          <circle cx="120" cy="104" r="17" fill="#C8754E" />
        </motion.svg>

        <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-14 md:px-10 md:pb-16">
          <div className="max-w-[720px] md:max-w-[62%]">
            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...SPRING_SOFT, delay: 0.1 }}
              className={`eyebrow ${onDark ? "!text-[var(--peach)]" : ""}`}
            >
              {eyebrow}
            </motion.p>

            <motion.h1
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.18 } } }}
              className="font-display mt-4 text-[38px] font-medium leading-[1.06] sm:text-[46px] md:text-[54px]"
            >
              {lines.map((line, i) => (
                <motion.span
                  key={`${line}-${i}`}
                  className={`block ${lines.length > 1 && i === lines.length - 1 ? `display-accent ${onDark ? "!text-[var(--sage-pale)]" : ""}` : ""}`}
                  variants={{
                    hidden: { y: 40, opacity: 0, clipPath: "inset(0 0 100% 0)" },
                    show: { y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)", transition: SPRING_SOFT },
                  }}
                >
                  {line}
                </motion.span>
              ))}
            </motion.h1>

            {lede ? (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.4 }}
                className={`mt-5 max-w-[600px] text-[15px] leading-relaxed md:text-[16.5px] ${
                  onDark ? "text-[var(--on-dark-muted)]" : "text-[var(--foreground)]/80"
                }`}
              >
                {lede}
              </motion.p>
            ) : null}

            {children ? (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.5 }}
                className="mt-7"
              >
                {children}
              </motion.div>
            ) : null}
          </div>
        </div>
      </section>
      <div className="zigzag bg-[var(--background)]" aria-hidden />
    </>
  );
}
