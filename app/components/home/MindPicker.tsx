"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import StartLink from "../StartLink";
import { ArchPortrait } from "../ui/Arch";
import Reveal from "./Reveal";

/**
 * "What's on your mind?" — a place to start, before anything is asked. Pick
 * what weighs on you and who you would feel easier with; TALK takes it from
 * there (the conversation asks properly, in your language).
 */

const TOPICS = [
  "Stress and pressure",
  "Money and work",
  "Relationships",
  "Anger",
  "Low mood",
  "Sleep",
  "Family",
  "Something else",
];

const WITH = [
  { id: "man", label: "A man" },
  { id: "woman", label: "A woman" },
  { id: "any", label: "No preference" },
];

export default function MindPicker() {
  const [topics, setTopics] = useState<string[]>(["Stress and pressure"]);
  const [withWho, setWithWho] = useState("any");

  const toggle = (t: string) => setTopics((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]));

  return (
    <section className="relative overflow-hidden bg-[var(--cream)] py-16 md:py-20">
      <div className="pointer-events-none absolute bottom-0 left-[4%] hidden h-[250px] w-[150px] xl:block">
        <ArchPortrait src="/people/mind-man.webp" alt="" tone="var(--sage-soft)" className="h-full w-full" sizes="150px" />
        <span className="absolute right-[18%] top-[12%] h-5 w-5 rounded-full bg-[var(--surface)]/85" aria-hidden />
      </div>
      <div className="pointer-events-none absolute bottom-0 right-[4%] hidden h-[250px] w-[150px] xl:block">
        <ArchPortrait src="/people/mind-woman.webp" alt="" tone="var(--peach)" className="h-full w-full" sizes="150px" />
        <span className="absolute right-[16%] top-[12%] h-5 w-5 rounded-full bg-[var(--surface)]/85" aria-hidden />
      </div>

      <div className="relative mx-auto max-w-[640px] px-5 text-center">
        <Reveal>
          <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">What&apos;s on your mind?</h2>
          <p className="mt-3 text-[15px] text-[var(--muted)]">Pick a place to start. TALK will take it from there.</p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5" role="group" aria-label="What is on your mind">
            {TOPICS.map((t) => {
              const on = topics.includes(t);
              return (
                <motion.button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING_SNAP}
                  className={`h-10 rounded-full border-[1.5px] px-5 text-[13.5px] transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--dark)]/55 text-[var(--foreground)] hover:bg-[var(--sand)]"
                  }`}
                >
                  {t}
                </motion.button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <p className="mt-10 text-[11px] uppercase tracking-[0.3em] text-[var(--muted)]">I&apos;d feel more comfortable with</p>
          <div
            role="radiogroup"
            aria-label="I would feel more comfortable with"
            className="mx-auto mt-4 grid w-full max-w-[420px] grid-cols-3 rounded-full border-[1.5px] border-[var(--dark)] bg-[var(--surface)] p-1"
          >
            {WITH.map((w) => {
              const on = withWho === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setWithWho(w.id)}
                  className="relative h-10 rounded-full text-[13.5px]"
                >
                  {on ? (
                    <motion.span
                      layoutId="with-who"
                      transition={SPRING_SNAP}
                      className="absolute inset-0 rounded-full bg-[var(--dark)]"
                    />
                  ) : null}
                  <span className={`relative ${on ? "text-[var(--cream)]" : ""}`}>{w.label}</span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <StartLink className="mt-9 inline-flex h-12 items-center rounded-full bg-[var(--accent)] px-8 text-[14.5px] font-medium text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--accent-deep)]">
            Begin with TALK
          </StartLink>
        </Reveal>
      </div>
    </section>
  );
}
