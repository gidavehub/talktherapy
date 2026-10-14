"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { SectionHeading } from "../ui/Typography";
import Button from "../ui/Button";
import { ArchStack } from "../ui/Card";
import { parseRichText, richTextSections } from "../../lib/content/markdown";
import { RICH_TEXT_CLASSES, RichBlocks, RichInline } from "../../lib/content/richText";

/**
 * Composable blocks for the public pages, in the redesign's dress: cream and
 * sand bands, white cards with a warm shadow, sage arches for icons and
 * numbers, the serif for headings.
 *
 * Every one obeys the same rhythm — `px-5 md:px-10`, `max-w-[1200px]` — so
 * pages assembled from them line up with the header without anyone measuring.
 *
 * The words come from the site content, which staff edit: lists are keyed by
 * position, since two cards or questions may be written the same.
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
    surface: "bg-[var(--cream)]",
    // The big coloured band: sage, as the mockups have it.
    dark: "bg-[var(--sage)] text-[var(--cream)]",
  } as const;

  return (
    <section className={`px-5 md:px-10 ${padding} ${tones[tone]} ${className}`}>
      <div className="max-w-[1200px] mx-auto">{children}</div>
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
          key={i}
          initial={{ y: 30, opacity: 0, rotate: i % 2 ? 1 : -1 }}
          whileInView={{ y: 0, opacity: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING_SOFT, delay: i * 0.06 }}
          whileHover={{ y: -4 }}
          className={`rounded-[26px] p-6 md:p-8 ${
            onDark
              ? "bg-[var(--cream)]/[0.06] border border-[var(--cream)]/10"
              : "bg-[var(--surface)] shadow-[var(--shadow-card)]"
          }`}
        >
          {item.icon ? (
            <span
              className={`arch mb-5 flex h-12 w-11 items-center justify-center rounded-b-lg ${
                onDark ? "bg-[var(--accent)] text-white" : "bg-[var(--sage)] text-[var(--cream)]"
              }`}
            >
              {item.icon}
            </span>
          ) : null}
          <h3 className="font-display text-[20px] md:text-[22px] font-medium leading-tight">
            {item.title}
          </h3>
          <p
            className={`mt-3 text-[13px] md:text-[14px] leading-relaxed ${
              onDark ? "text-[var(--on-dark-muted)]" : "text-[var(--muted)]"
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
          key={i}
          initial={{ x: -30, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ ...SPRING_SOFT, delay: i * 0.05 }}
          className="grid grid-cols-[auto_1fr] gap-5 md:gap-8 items-start"
        >
          <span
            className={`arch font-display flex h-14 w-12 shrink-0 items-center justify-center rounded-b-xl pt-1 text-[20px] font-medium md:h-16 md:w-14 md:text-[22px] ${
              onDark ? "bg-[var(--accent)] text-white" : "bg-[var(--sage)] text-[var(--cream)]"
            }`}
          >
            {i + 1}
          </span>
          <div className="pt-1 md:pt-3">
            <h3 className="font-display text-[20px] md:text-[24px] leading-tight font-medium">
              {step.title}
            </h3>
            <p
              className={`mt-2 text-[14px] md:text-[15px] leading-relaxed max-w-[620px] ${
                onDark ? "text-[var(--on-dark-muted)]" : "text-[var(--muted)]"
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

/**
 * Long-form prose block for the legal and policy pages: rich text with "## "
 * headings (see lib/content/markdown), one block per heading, each rising into
 * view on its own.
 */
export function Prose({ source }: { source: string }) {
  const sections = richTextSections(parseRichText(source, { headings: true }).blocks);
  return (
    <div className="max-w-[760px] space-y-12 md:space-y-16">
      {sections.map((section, i) => (
        <motion.div
          key={i}
          initial={{ y: 24, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...SPRING_SOFT, delay: Math.min(i, 4) * 0.04 }}
        >
          {section.heading ? (
            <h2 className={RICH_TEXT_CLASSES.heading}>
              <RichInline nodes={section.heading} />
            </h2>
          ) : null}
          <div className={`${section.heading ? "mt-4 " : ""}space-y-4`}>
            <RichBlocks blocks={section.blocks} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-[820px] space-y-3">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={i} className="rounded-[20px] bg-[var(--surface)] px-6 shadow-[var(--shadow-card)]">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full py-5 flex items-start justify-between gap-6 text-left"
            >
              <span className="text-[15px] md:text-[16px] leading-snug font-medium">
                {item.q}
              </span>
              <motion.span
                animate={{ rotate: open ? 45 : 0 }}
                transition={SPRING_SNAP}
                className={`mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  open ? "bg-[var(--accent)] text-white" : "bg-[var(--sage-pale)] text-[var(--sage-deep)]"
                }`}
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
                  <p className="pb-5 pr-12 text-[14px] leading-relaxed text-[var(--muted)]">
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

/**
 * Closing call to action — the sage band with arches rising at the right. The
 * shape of the content's closing blocks, so a page passes its `cta` as it is.
 */
export function CTABlock({
  eyebrow,
  lines,
  body,
  primary,
  secondary,
}: {
  eyebrow: string;
  lines: string[];
  /** Optional: an empty one draws no line under the heading. */
  body?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <Section padding="py-12 md:py-16">
      <div className="relative overflow-hidden rounded-[28px] md:rounded-[36px] bg-[var(--sage)] text-[var(--cream)] px-6 md:px-12 py-12 md:py-16">
        <ArchStack className="absolute bottom-0 right-[3%] hidden h-[85%] opacity-60 lg:block" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-center lg:pr-[22%]">
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
