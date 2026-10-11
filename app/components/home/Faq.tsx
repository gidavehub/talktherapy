"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Reveal from "./Reveal";

/** "Questions, answered" — two columns of plain answers. */

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "What happens in my first conversation?",
    a: "You talk with TALK for up to eight minutes, in your own language, by voice or by tapping. TALK then introduces you to providers who fit.",
  },
  {
    q: "Do I have to speak to a person?",
    a: "No. You can keep talking with TALK for as long as you need — a longer conversation is twenty minutes. When you are ready, a provider is one message away.",
  },
  {
    q: "What if I need urgent help?",
    a: "Call 117 for the police or 116 for an ambulance. The urgent help page is free and needs no account, and TALK will always point you there if you are in danger.",
  },
  {
    q: "Who can see my journal and mood?",
    a: "Only you. The provider you choose sees a short summary of what you told TALK, and nothing else unless you share it.",
  },
  {
    q: "How do I pay?",
    a: "With Wave or another mobile money wallet, or a card. You see the price before you pay, and you only pay for what you use.",
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
