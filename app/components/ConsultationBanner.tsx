"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";

/**
 * Slim full-width banner — about half a viewport at most. Sits between the
 * hero and the longer content sections to drive the free-consult CTA without
 * eating the whole page.
 */
export default function ConsultationBanner() {
  return (
    <section className="relative bg-[var(--background)] px-4 sm:px-6 md:px-10 py-12 md:py-16">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ ...SPRING_SOFT, mass: 1.1 }}
        className="relative overflow-hidden rounded-[28px] md:rounded-[40px] bg-[var(--dark)] text-white px-6 md:px-12 py-10 md:py-14 min-h-[40vh] md:min-h-[44vh] flex items-center"
      >
        {/* Ambient glow */}
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

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-center w-full">
          <div>
            <motion.p
              initial={{ x: -32, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ ...SPRING_SOFT, delay: 0.1 }}
              className="text-[11px] uppercase tracking-[0.22em] text-white/65"
            >
              No card. No pressure.
            </motion.p>
            <motion.h2
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
              }}
              className="mt-3 text-[32px] sm:text-[42px] md:text-[54px] leading-[1.02] tracking-[-0.02em] font-medium"
            >
              {["Your first session", "is on us."].map((line, i) => (
                <motion.span
                  key={i}
                  variants={{
                    hidden: { y: 50, opacity: 0, clipPath: "inset(0 0 100% 0)" },
                    show: {
                      y: 0,
                      opacity: 1,
                      clipPath: "inset(0 0 0% 0)",
                      transition: SPRING_SOFT,
                    },
                  }}
                  className="block"
                >
                  {line}
                </motion.span>
              ))}
            </motion.h2>
            <motion.p
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ ...SPRING_SOFT, delay: 0.4 }}
              className="mt-4 text-[14px] md:text-[15px] text-white/70 max-w-[460px] leading-relaxed"
            >
              Fifteen minutes with our AI to understand what you&apos;re going
              through, then a free intro call with a matched therapist.
            </motion.p>
          </div>

          <motion.div
            initial={{ x: 60, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ ...SPRING_SOFT, delay: 0.25 }}
            className="md:justify-self-end"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
              <Link
                href="/sign-up"
                className="inline-flex h-12 md:h-14 items-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors pl-6 md:pl-8 pr-2 text-white text-[12px] md:text-[13px] uppercase tracking-[0.14em] font-medium shadow-[0_18px_40px_-15px_rgba(255,90,31,0.65)]"
              >
                Book Free Consult
                <motion.span
                  className="h-10 w-10 md:h-11 md:w-11 rounded-full bg-white/15 flex items-center justify-center"
                  whileHover={{ x: 4 }}
                  transition={SPRING_SNAP}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
