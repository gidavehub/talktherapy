"use client";

import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";
import StartLink from "./StartLink";

type Tier = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Intro",
    price: "Free",
    cadence: "one consult",
    blurb: "A taste of what matching feels like. No card, no pressure.",
    features: [
      "AI-guided 15-minute intake",
      "One free intro call with a matched therapist",
      "Daily mood check-ins",
    ],
    cta: "Start Free",
  },
  {
    name: "Plus",
    price: "$49",
    cadence: "per month",
    blurb: "For people who want regular sessions without the friction.",
    features: [
      "Everything in Intro",
      "Two therapist sessions / month",
      "Unlimited text-chat with your therapist",
      "Guided meditations & journaling",
    ],
    cta: "Choose Plus",
    featured: true,
  },
  {
    name: "Premium",
    price: "$129",
    cadence: "per month",
    blurb: "Deep, ongoing support — with priority access on hard days.",
    features: [
      "Everything in Plus",
      "Weekly therapist sessions",
      "Same-day session rebooking",
      "Crisis-line priority routing",
    ],
    cta: "Choose Premium",
  },
];

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <section className="relative bg-[var(--background)] px-4 sm:px-6 md:px-10 py-16 md:py-24">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center max-w-[640px] mx-auto">
          <motion.p
            initial={{ y: 24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={SPRING_SOFT}
            className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
          >
            Pricing
          </motion.p>
          <motion.h2
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
            }}
            className="mt-3 text-[34px] sm:text-[44px] md:text-[54px] leading-[1.02] tracking-[-0.025em] font-medium"
          >
            {["Pick what fits.", "Change anytime."].map((line, i) => (
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
            className="mt-4 text-[14px] md:text-[15px] text-[var(--muted)]"
          >
            Cancel or move tiers whenever you want — no questions asked.
          </motion.p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12, delayChildren: 0.55 } },
          }}
          className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6"
        >
          {tiers.map((tier) => (
            <motion.div
              key={tier.name}
              variants={{
                hidden: { y: 60, opacity: 0, rotate: tier.featured ? 0 : -1 },
                show: { y: 0, opacity: 1, rotate: 0, transition: SPRING_SOFT },
              }}
              whileHover={{ y: -6 }}
              transition={SPRING_SNAP}
              className={
                tier.featured
                  ? "relative rounded-[28px] bg-[var(--dark)] text-white p-6 md:p-8 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.5)] md:-mt-4 md:mb-4"
                  : "relative rounded-[28px] bg-white p-6 md:p-8 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)]"
              }
            >
              {tier.featured ? (
                <span className="absolute -top-3 left-6 inline-flex h-6 items-center rounded-full bg-[var(--accent)] px-3 text-[10px] uppercase tracking-[0.18em] text-white">
                  Most chosen
                </span>
              ) : null}

              <p className="text-[12px] uppercase tracking-[0.18em] opacity-70">
                {tier.name}
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[42px] md:text-[48px] leading-none font-medium tracking-tight">
                  {tier.price}
                </span>
                <span className="text-[12px] opacity-60">{tier.cadence}</span>
              </div>
              <p
                className={
                  tier.featured
                    ? "mt-3 text-[13px] text-white/75 leading-relaxed"
                    : "mt-3 text-[13px] text-[var(--muted)] leading-relaxed"
                }
              >
                {tier.blurb}
              </p>

              <ul
                className={
                  tier.featured
                    ? "mt-6 space-y-3 text-[13px] text-white/90"
                    : "mt-6 space-y-3 text-[13px] text-[var(--foreground)]"
                }
              >
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span
                      className={
                        tier.featured
                          ? "mt-0.5 h-5 w-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0"
                          : "mt-0.5 h-5 w-5 rounded-full bg-[var(--background)] text-[var(--accent)] flex items-center justify-center shrink-0"
                      }
                    >
                      <Check />
                    </span>
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_SNAP}
                className="mt-8"
              >
                <StartLink
                  
                  className={
                    tier.featured
                      ? "inline-flex w-full h-12 items-center justify-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white text-[12px] uppercase tracking-[0.14em] font-medium"
                      : "inline-flex w-full h-12 items-center justify-center gap-3 rounded-full border border-[var(--foreground)] hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)] transition-colors text-[12px] uppercase tracking-[0.14em] font-medium"
                  }
                >
                  {tier.cta}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </StartLink>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
