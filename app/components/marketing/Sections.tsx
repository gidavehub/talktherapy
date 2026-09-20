"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { SectionHeading } from "../ui/Typography";
import Button from "../ui/Button";

/**
 * Composable blocks for the public pages.
 *
 * Every one of these obeys the landing page's rhythm — `px-4 sm:px-6 md:px-10`,
 * `py-16 md:py-24`, `max-w-[1400px]` — so pages assembled from them line up
 * with the hero without anyone measuring.
 */

export function Section({
  children,
  tone = "light",
  className = "",
  padding = "py-16 md:py-24",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark" | "surface";
  className?: string;
  padding?: string;
}) {
  const tones = {
    light: "bg-[var(--background)]",
    surface: "bg-white",
    dark: "bg-[var(--dark)] text-white",
  } as const;

  return (
    <section className={`px-4 sm:px-6 md:px-10 ${padding} ${tones[tone]} ${className}`}>
      <div className="max-w-[1400px] mx-auto">{children}</div>
    </section>
  );
}

/** Grid of short feature/benefit cards. */
export function FeatureGrid({
  items,
  columns = 3,
  tone = "light",
}: {
  items: { title: string; body: string; icon?: React.ReactNode }[];
  columns?: 2 | 3 | 4;
  tone?: "light" | "dark";
}) {
  const cols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  }[columns];

  const onDark = tone === "dark";

  return (
    <div className={`grid grid-cols-1 ${cols} gap-4 md:gap-6`}>
      {items.map((item, i) => (
        <motion.div
          key={item.title}
          initial={{ y: 30, opacity: 0, rotate: i % 2 ? 1 : -1 }}
          whileInView={{ y: 0, opacity: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING_SOFT, delay: i * 0.06 }}
          whileHover={{ y: -4 }}
          className={`rounded-[28px] p-6 md:p-8 ${
            onDark
              ? "bg-white/[0.06] border border-white/10"
              : "bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)]"
          }`}
        >
          {item.icon ? (
            <span
              className={`mb-5 h-10 w-10 rounded-full flex items-center justify-center ${
                onDark ? "bg-[var(--accent)] text-white" : "bg-[var(--dark)] text-white"
              }`}
            >
              {item.icon}
            </span>
          ) : null}
          <h3 className="text-[16px] md:text-[17px] font-medium leading-tight">
            {item.title}
          </h3>
          <p
            className={`mt-3 text-[13px] md:text-[14px] leading-relaxed ${
              onDark ? "text-white/65" : "text-[var(--muted)]"
            }`}
          >
            {item.body}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

/** Numbered process steps — used by How It Works and the implementation phases. */
export function StepList({
  steps,
  tone = "light",
}: {
  steps: { title: string; body: string }[];
  tone?: "light" | "dark";
}) {
  const onDark = tone === "dark";

  return (
    <ol className="mt-10 md:mt-14 space-y-8 md:space-y-10">
      {steps.map((step, i) => (
        <motion.li
          key={step.title}
          initial={{ x: -30, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ ...SPRING_SOFT, delay: i * 0.05 }}
          className="grid grid-cols-[auto_1fr] gap-5 md:gap-8 items-start"
        >
          <span
            className={`h-11 w-11 md:h-14 md:w-14 rounded-full flex items-center justify-center text-[13px] md:text-[15px] font-medium shrink-0 ${
              onDark ? "bg-[var(--accent)] text-white" : "bg-[var(--dark)] text-white"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="pt-1 md:pt-3">
            <h3 className="text-[18px] md:text-[22px] leading-tight tracking-tight font-medium">
              {step.title}
            </h3>
            <p
              className={`mt-2 text-[13px] md:text-[15px] leading-relaxed max-w-[620px] ${
                onDark ? "text-white/65" : "text-[var(--muted)]"
              }`}
            >
              {step.body}
            </p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** Long-form prose block for the legal and policy pages. */
export function Prose({
  sections,
}: {
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <div className="max-w-[760px] space-y-12 md:space-y-16">
      {sections.map((section, i) => (
        <motion.div
          key={section.heading}
          initial={{ y: 24, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING_SOFT, delay: Math.min(i, 4) * 0.04 }}
        >
          <h2 className="text-[22px] md:text-[28px] leading-tight tracking-tight font-medium">
            {section.heading}
          </h2>
          <div className="mt-4 space-y-4">
            {section.body.map((paragraph, j) => (
              <p
                key={j}
                className="text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-[820px] divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full py-6 flex items-start justify-between gap-6 text-left group"
            >
              <span className="text-[16px] md:text-[18px] leading-snug font-medium">
                {item.q}
              </span>
              <motion.span
                animate={{ rotate: open ? 45 : 0 }}
                transition={SPRING_SNAP}
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-[var(--border)] flex items-center justify-center group-hover:bg-black/5 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING_SOFT}
                  className="overflow-hidden"
                >
                  <p className="pb-6 pr-12 text-[14px] leading-relaxed text-[var(--muted)]">
                    {item.a}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Closing call to action — the dark card with ambient orange blooms. */
export function CTABlock({
  eyebrow = "Get started",
  lines,
  body,
  primary = { label: "Create your account", href: "/sign-up" },
  secondary,
}: {
  eyebrow?: string;
  lines: string[];
  body?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <Section padding="py-12 md:py-16">
      <div className="relative overflow-hidden rounded-[28px] md:rounded-[40px] bg-[var(--dark)] text-white px-6 md:px-12 py-12 md:py-16">
        <div
          aria-hidden
          className="absolute -right-20 -top-24 h-[320px] w-[320px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,122,69,0.55), rgba(255,90,31,0))",
            filter: "blur(12px)",
          }}
        />
        <div
          aria-hidden
          className="absolute -left-16 -bottom-20 h-[260px] w-[260px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,90,31,0.35), rgba(255,90,31,0))",
            filter: "blur(20px)",
          }}
        />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-center">
          <SectionHeading eyebrow={eyebrow} lines={lines} lede={body} onDark size="section" />
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Button href={primary.href} variant="primary" size="lg">
              {primary.label}
            </Button>
            {secondary ? (
              <Button href={secondary.href} variant="onDark" withArrow={false}>
                {secondary.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Section>
  );
}
