"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Reveal from "./Reveal";
import type { HomeContent } from "../../lib/content/schema";

/**
 * "Questions, answered" — two columns of plain answers. The questions are the
 * site content's (home.faq), prices already filled in by the server.
 */

type Question = { q: string; a: string };

/**
 * Set in code, never content: the emergency numbers must not be one edit away
 * from being wrong. Always third, where it has always been.
 */
const DANGER: Question = {
  q: "What if I am in danger?",
  a: "Call 117 for the police, 116 for an ambulance, or 118 for fire and rescue — free from any phone. TALK is not an emergency service and nobody is watching the app, but if you tell her you are in danger she will give you these numbers straight away.",
};
const DANGER_AT = 2;

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

export default function Faq({ content }: { content: HomeContent["faq"] }) {
  const [open, setOpen] = useState(0);
  const questions = [...content.items.slice(0, DANGER_AT), DANGER, ...content.items.slice(DANGER_AT)];
  const half = Math.ceil(questions.length / 2);
  const columns = [questions.slice(0, half), questions.slice(half)];
  return (
    <section className="bg-[var(--cream)] py-16 md:py-20">
      <div className="mx-auto max-w-[1100px] px-5 md:px-10">
        <Reveal className="text-center">
          <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">{content.heading}</h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {columns.map((col, c) => (
            <div key={c} className="flex flex-col gap-4">
              {col.map((item, i) => {
                const index = c * half + i;
                return (
                  <Reveal key={index} delay={i * 0.05}>
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
