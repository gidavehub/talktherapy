"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useAuth } from "../components/AuthProvider";
import Orb from "../components/Orb";
import { SPRING_SOFT, SPRING_SNAP } from "../components/motion/primitives";

export default function OnboardingPage() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-[var(--background)] relative overflow-hidden flex flex-col">
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        className="px-4 sm:px-6 md:px-10 pt-5 md:pt-8 flex items-start justify-between"
      >
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
          <Link
            href="/therapy"
            className="h-11 px-5 rounded-full bg-[var(--dark)] text-white text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-[var(--dark-soft)] transition-colors"
          >
            Start Session
          </Link>
        </motion.div>
      </motion.header>

      <section className="flex-1 grid place-items-center px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center max-w-[600px] w-full">
          <motion.div
            initial={{ y: 60, scale: 0.85, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.2, mass: 1.2 }}
          >
            <Orb size={220} className="mx-auto" />
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.5 }}
            className="mt-10 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
          >
            {loading
              ? "Checking your session…"
              : user
                ? `Hi ${user.displayName || user.email}`
                : "Welcome"}
          </motion.p>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06, delayChildren: 0.6 } },
            }}
            className="mt-3 text-[32px] sm:text-[40px] md:text-[56px] leading-[1.05] tracking-tight font-medium"
          >
            {"Let's find the right therapist for you.".split(" ").map((word, i) => (
              <motion.span
                key={i}
                variants={{
                  hidden: { y: 40, opacity: 0 },
                  show: { y: 0, opacity: 1, transition: SPRING_SOFT },
                }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 1.05 }}
            className="mt-5 text-[15px] text-[var(--muted)] leading-relaxed"
          >
            We&apos;ll start with a short conversation — about 15 minutes —
            so we can understand what you&apos;re going through and match you
            with someone who genuinely fits.
          </motion.p>

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 1.2 }}
            className="mt-9 inline-block"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
              <Link
                href="/therapy"
                className="inline-flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white pl-6 pr-2 text-[12px] uppercase tracking-[0.14em] font-medium transition-colors"
              >
                Begin Intake
                <motion.span
                  className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center"
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
      </section>
    </main>
  );
}
