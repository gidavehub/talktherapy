"use client";

import Reveal from "./Reveal";
import { AI_TIERS } from "../../lib/models";

/** "How it works" — three steps, each under a sage arch. */

const STEPS = [
  {
    title: "Talk with TALK",
    text: `Speak or type — English, Wolof, Mandinka or Pulaar — for up to ${AI_TIERS.initial.durationSec / 60} minutes.`,
    icon: (
      <path d="M7 9h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-5 4v-4H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill="#F4EADD" />
    ),
    dot: <circle cx="14" cy="15" r="2.4" fill="#C8754E" />,
  },
  {
    title: "Meet providers who fit",
    text: "A short-list matched to what you need and how you feel.",
    icon: <circle cx="11.5" cy="15" r="6" fill="#F4EADD" />,
    dot: <circle cx="18.5" cy="15" r="6" fill="#C8754E" />,
  },
  {
    title: "Begin your sessions",
    text: "By video or voice call, private, whenever you are ready.",
    icon: <rect x="4" y="10" width="14" height="10" rx="2.5" fill="#F4EADD" />,
    dot: <path d="M19 13.5l5-3v9l-5-3z" fill="#F4EADD" />,
  },
];

export default function HowSteps({ heading = true }: { heading?: boolean }) {
  return (
    <section className="bg-[var(--cream)] py-16 md:py-20">
      <div className="mx-auto max-w-[1100px] px-5 md:px-10">
        {heading ? (
          <Reveal className="text-center">
            <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">How it works</h2>
            <p className="mt-3 text-[15px] text-[var(--muted)]">Three simple steps, at your own pace.</p>
          </Reveal>
        ) : null}
        <ol className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08} className="flex flex-col items-center text-center">
              <div className="arch flex h-[96px] w-[104px] items-center justify-center rounded-b-[18px] bg-[var(--sage)]">
                <svg aria-hidden viewBox="0 0 28 30" className="h-12 w-12">
                  {step.icon}
                  {step.dot}
                </svg>
              </div>
              <p className="eyebrow mt-5 !text-[10.5px]">Step {i + 1}</p>
              <h3 className="font-display mt-2 text-[22px] font-medium">{step.title}</h3>
              <p className="mt-2 max-w-[240px] text-[14px] leading-relaxed text-[var(--muted)]">{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
