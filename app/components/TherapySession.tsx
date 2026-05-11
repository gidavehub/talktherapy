"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";

const features = [
  {
    title: "Talk, type, or both",
    body: "Voice or text — the AI listens the way you want to be heard.",
  },
  {
    title: "Matched in minutes",
    body: "Fifteen-minute intake. A short-list of therapists tuned to you.",
  },
  {
    title: "Always private",
    body: "Anonymous sign-up. End-to-end encrypted chat with your therapist.",
  },
];

export default function TherapySession() {
  return (
    <section className="relative bg-[var(--background)] px-4 sm:px-6 md:px-10 py-16 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center max-w-[1400px] mx-auto">
        {/* Text block (left on desktop, top on mobile) */}
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={SPRING_SOFT}
          className="order-2 md:order-1"
        >
          <motion.p
            initial={{ x: -24, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ ...SPRING_SOFT, delay: 0.1 }}
            className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
          >
            A Real Therapy Session
          </motion.p>

          <motion.h2
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
            }}
            className="mt-3 text-[34px] sm:text-[44px] md:text-[52px] leading-[1.02] tracking-[-0.02em] font-medium"
          >
            {["Speak freely.", "We’ll handle", "the rest."].map((line, i) => (
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

          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.1, delayChildren: 0.45 } },
            }}
            className="mt-8 space-y-5"
          >
            {features.map((f) => (
              <motion.li
                key={f.title}
                variants={{
                  hidden: { x: -32, opacity: 0 },
                  show: { x: 0, opacity: 1, transition: SPRING_SOFT },
                }}
                className="flex items-start gap-4"
              >
                <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
                <div>
                  <p className="text-[16px] md:text-[17px] font-medium leading-tight">
                    {f.title}
                  </p>
                  <p className="mt-1 text-[13px] md:text-[14px] text-[var(--muted)] leading-relaxed max-w-[420px]">
                    {f.body}
                  </p>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ ...SPRING_SOFT, delay: 0.8 }}
            className="mt-10"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP} className="inline-block">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center gap-3 rounded-full border border-[var(--foreground)] hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)] transition-colors pl-6 pr-2 text-[12px] uppercase tracking-[0.14em] font-medium"
              >
                Try a Session
                <motion.span
                  className="h-9 w-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center"
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
        </motion.div>

        {/* Containerized image (right on desktop, bottom on mobile) */}
        <motion.div
          initial={{ x: 80, opacity: 0, rotate: -1.5 }}
          whileInView={{ x: 0, opacity: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING_SOFT, mass: 1.2 }}
          className="order-1 md:order-2 relative"
        >
          <motion.div
            whileHover={{ rotate: 0.6, scale: 1.01 }}
            transition={SPRING_SNAP}
            className="relative rounded-[28px] md:rounded-[36px] overflow-hidden bg-[var(--dark)] aspect-[4/3] shadow-[0_30px_70px_-25px_rgba(0,0,0,0.35)]"
          >
            <Image
              src="/session.png"
              alt="A person having a Talk Therapy session on their phone"
              fill
              sizes="(max-width: 768px) 92vw, 640px"
              quality={92}
              className="object-cover"
            />
            {/* Bottom darken so the stamp text reads */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
              }}
            />
            {/* Stamp-style overlay: bold italic display text */}
            <motion.div
              initial={{ y: 30, opacity: 0, clipPath: "inset(0 0 100% 0)" }}
              whileInView={{ y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ ...SPRING_SOFT, delay: 0.5, mass: 1.1 }}
              className="absolute inset-x-0 bottom-0 px-6 md:px-10 pb-7 md:pb-10"
            >
              <p className="stamp text-white leading-[0.88] tracking-[-0.03em] text-[44px] sm:text-[58px] md:text-[68px] lg:text-[76px]">
                Help in
                <br />
                one tap.
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
