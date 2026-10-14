"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Reveal from "./Reveal";
import { AI_TIERS } from "../../lib/models";
import { formatDalasi } from "../../lib/money";

/** "Questions, answered" — two columns of plain answers. */

// Prices and lengths come from the constants the checkout uses, so an answer
// can never quote a number the payment does not take.
const FIRST = AI_TIERS.initial;
const LONGER = AI_TIERS.extended;

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "What happens in my first conversation?",
    a: `You talk with TALK for up to ${FIRST.durationSec / 60} minutes — in English, Wolof, Mandinka or Pulaar — by voice or by tapping. It costs ${formatDalasi(FIRST.amountMinor)}. TALK then introduces you to providers who fit.`,
  },
  {
    q: "Do I have to speak to a person?",
    a: `No. You can keep talking with TALK — a longer talk is ${formatDalasi(LONGER.amountMinor)} for up to ${LONGER.durationSec / 60} minutes. When you are ready, a provider is one message away.`,
  },
  {
    q: "What if I am in danger?",
    a: "Call 117 for the police, 116 for an ambulance, or 118 for fire and rescue — free from any phone. TALK is not an emergency service and nobody is watching the app, but if you tell her you are in danger she will give you these numbers straight away.",
  },
  {
    q: "Who can see my journal and mood?",
    a: "Only you. Providers never see your journal or mood check-ins — only what you choose to send them.",
  },
  {
    q: "How do I pay?",
    a: "With Wave or another mobile money wallet, or a card. No plans, no subscription: you see the price first, and pay per conversation.",
  },
  {
    q: "Can I choose a male or female provider?",
    a: "Yes. TALK asks who you would feel more comfortable with, and you can filter the providers by it too.",
  },
];

function Item({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[20px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-[14.5px] font-medium">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING_SNAP}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            open ? "bg-[var(--accent)] text-white" : "bg-[var(--sage-pale)] text-[var(--sage-deep)]"
          }`}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {open ? null : <path d="M6 2v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-[13.5px] leading-relaxed text-[var(--muted)]">{a}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  const [open, setOpen] = useState(0);
  const half = Math.ceil(QUESTIONS.length / 2);
  const columns = [QUESTIONS.slice(0, half), QUESTIONS.slice(half)];
  return (
    <section className="bg-[var(--cream)] py-16 md:py-20">
      <div className="mx-auto max-w-[1100px] px-5 md:px-10">
        <Reveal className="text-center">
          <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">Questions, answered</h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {columns.map((col, c) => (
            <div key={c} className="flex flex-col gap-4">
              {col.map((item, i) => {
                const index = c * half + i;
                return (
                  <Reveal key={item.q} delay={i * 0.05}>
                    <Item {...item} open={open === index} onToggle={() => setOpen(open === index ? -1 : index)} />
                  </Reveal>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
