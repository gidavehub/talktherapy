"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import StartLink from "../StartLink";
import { ArchPortrait } from "../ui/Arch";

/**
 * The landing hero: "Talk it through, your own way." beside three arches,
 * each with somebody in it — and under it, the brown band of four facts.
 */

const LANGUAGES = ["English", "Wolof", "Mandinka", "Pulaar"];

/** A speech bubble, drawn on the arches the way the mockup has them. */
function Bubble({ tone, lines = false, className = "" }: { tone: string; lines?: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 44" className={className}>
      <path d="M8 2h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H26l-10 8v-8H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill={tone} />
      {lines ? (
        <g stroke="#7A6A61" strokeWidth="2.6" strokeLinecap="round">
          <path d="M14 13h32M14 22h22" />
        </g>
      ) : (
        <g fill="#F4EADD">
          <circle cx="20" cy="18" r="3" />
          <circle cx="30" cy="18" r="3" />
          <circle cx="40" cy="18" r="3" />
        </g>
      )}
    </svg>
  );
}

const rise = (delay: number) => ({
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { ...SPRING_SOFT, delay },
});

export default function HomeHero() {
  return (
    <>
      <section className="relative overflow-hidden bg-[var(--background)] pt-[84px] md:pt-[92px]">
        <div className="mx-auto grid max-w-[1200px] items-end gap-10 px-5 md:px-10 lg:grid-cols-[1fr_1.05fr] lg:gap-6">
          <div className="pb-6 pt-8 md:pt-12 lg:pb-20">
            <motion.p {...rise(0.05)} className="eyebrow flex items-center gap-3">
              <span className="h-[2px] w-8 bg-[var(--accent)]" aria-hidden />
              Care that understands your world
            </motion.p>
            <motion.h1
              {...rise(0.12)}
              className="font-display mt-6 text-[44px] font-medium leading-[1.04] sm:text-[54px] lg:text-[62px]"
            >
              Talk it through,
              <span className="display-accent block">your own way.</span>
            </motion.h1>
            <motion.p {...rise(0.2)} className="mt-6 max-w-[440px] text-[16px] leading-relaxed text-[var(--foreground)]/80">
              Private conversations with TALK and qualified providers, in the language you think in. Culturally rooted
              care, for everyone.
            </motion.p>
            <motion.div {...rise(0.28)} className="mt-8 flex flex-wrap gap-3">
              <StartLink className="inline-flex h-12 items-center rounded-full bg-[var(--accent)] px-7 text-[14.5px] font-medium text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--accent-deep)]">
                Begin with TALK
              </StartLink>
              <Link
                href="/providers"
                className="inline-flex h-12 items-center rounded-full border-[1.5px] border-[var(--dark)] px-7 text-[14.5px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
              >
                Meet providers
              </Link>
            </motion.div>
            <motion.ul {...rise(0.36)} aria-label="Languages" className="mt-7 flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <li key={l} className="rounded-full border border-[var(--dark)]/35 px-3.5 py-1 text-[12.5px]">
                  {l}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Three arches, standing on the brown band. */}
          <div className="relative mx-auto flex h-[360px] w-full max-w-[560px] items-end justify-center gap-3 sm:h-[440px] lg:h-[500px]">
            <motion.div {...rise(0.15)} className="relative h-[78%] w-[31%]">
              <ArchPortrait src="/people/hero-man.webp" alt="A man in a terracotta shirt, smiling, his phone in his hand" tone="var(--sage-soft)" className="h-full w-full" sizes="(min-width: 1024px) 260px, 45vw" scale={1.6} priority />
              <span className="absolute left-[18%] top-[16%] h-5 w-5 rounded-full bg-[var(--surface)]/80" aria-hidden />
            </motion.div>
            <motion.div {...rise(0.05)} className="relative h-full w-[33%]">
              <ArchPortrait src="/people/hero-woman-sage.webp" alt="A woman in a sage headwrap, smiling" tone="var(--peach)" className="h-full w-full" sizes="(min-width: 1024px) 280px, 48vw" scale={1.6} priority />
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.7 }}
                className="absolute left-[30%] top-[10%] w-[34%]"
              >
                <Bubble tone="#F4EADD" lines className="w-full" />
              </motion.div>
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.9 }}
                className="absolute left-[8%] top-[24%] w-[24%]"
              >
                <Bubble tone="#C8754E" className="w-full" />
              </motion.div>
            </motion.div>
            <motion.div {...rise(0.25)} className="relative h-[86%] w-[31%]">
              <ArchPortrait src="/people/hero-woman-terracotta.webp" alt="A woman in a terracotta headwrap, smiling" tone="var(--sage)" className="h-full w-full" sizes="(min-width: 1024px) 260px, 45vw" scale={1.6} priority />
              <span className="absolute left-[16%] top-[13%] h-6 w-6 rounded-full bg-[var(--cream)]" aria-hidden />
            </motion.div>
          </div>
        </div>
      </section>

      {/* The four facts. */}
      <section aria-label="TALK at a glance" className="bg-[var(--dark)] text-[var(--cream)]">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 md:grid-cols-4">
          {[
            ["4", "languages"],
            ["24/7", "always open"],
            ["D200", "first conversation"],
            ["Free", "urgent help, no account"],
          ].map(([big, small], i) => (
            <div
              key={small}
              className={`flex flex-col items-center justify-center px-4 py-6 text-center md:py-7 ${
                i % 2 === 1 ? "border-l border-[var(--cream)]/15" : ""
              } ${i === 2 ? "md:border-l md:border-[var(--cream)]/15" : ""} ${i > 1 ? "border-t border-[var(--cream)]/15 md:border-t-0" : ""}`}
            >
              <dt className="sr-only">{small}</dt>
              <dd className="font-display text-[28px] font-medium leading-none md:text-[32px]">{big}</dd>
              <dd className="mt-2 text-[12.5px] text-[var(--cream)]/70">{small}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
    </>
  );
}
