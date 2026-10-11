"use client";

import Link from "next/link";
import StartLink from "../StartLink";
import Reveal from "./Reveal";
import { AI_TIERS, HUMAN_RATE_MIN_MINOR } from "../../lib/models";
import { formatDalasi } from "../../lib/money";

/**
 * "Pay for what you use." — the first conversation, sessions with a provider
 * (where TALK leads you), and a longer talk. Every number comes from the same
 * constants the payments use, so the page can never say a price the checkout
 * does not charge.
 */

function Dot() {
  return <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />;
}

export default function PricingPlans({ heading = true }: { heading?: boolean }) {
  const first = AI_TIERS.initial;
  const longer = AI_TIERS.extended;
  return (
    <section id="pricing" className="bg-[var(--background)] py-16 md:py-20">
      <div className="mx-auto max-w-[1100px] px-5 md:px-10">
        {heading ? (
          <Reveal className="text-center">
            <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">Pay for what you use.</h2>
            <p className="mt-3 text-[15px] text-[var(--muted)]">No plans, no subscription. Pay with mobile money or a card.</p>
          </Reveal>
        ) : null}

        <div className="mt-12 grid grid-cols-1 items-center gap-6 md:grid-cols-3 md:gap-5">
          <Reveal className="rounded-[26px] bg-[var(--surface)] p-7 shadow-[var(--shadow-card)]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">First conversation</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">{formatDalasi(first.amountMinor)}</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">up to {first.durationSec / 60} minutes</p>
            <p className="mt-5 text-[14px] leading-relaxed">
              Up to eight minutes with TALK, in your own language, then providers who fit.
            </p>
            <ul className="mt-5 space-y-2.5 text-[13.5px]">
              {["Your choice of language", "Speak, or tap your answers", "Ends with providers matched to you"].map((t) => (
                <li key={t} className="flex gap-3">
                  <Dot />
                  {t}
                </li>
              ))}
            </ul>
            <StartLink className="mt-7 flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]">
              Begin with TALK
            </StartLink>
          </Reveal>

          <Reveal delay={0.06} className="relative rounded-[26px] bg-[var(--sage)] p-7 pt-10 text-[var(--cream)] shadow-[var(--shadow-floating)] md:-my-4 md:py-11">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--accent)] px-4 py-1.5 text-[10.5px] uppercase tracking-[0.24em] text-white">
              Where TALK leads you
            </span>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--cream)]/75">Sessions with a provider</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">From {formatDalasi(HUMAN_RATE_MIN_MINOR)}</p>
            <p className="mt-2 text-[13px] text-[var(--cream)]/75">per session</p>
            <p className="mt-5 text-[14px] leading-relaxed">
              A qualified provider, by video or audio call. Fee shown before you book.
            </p>
            <ul className="mt-5 space-y-2.5 text-[13.5px]">
              {["Message your provider any time", "Video or audio calls in the app", "Mobile money or card"].map((t) => (
                <li key={t} className="flex gap-3">
                  <Dot />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/providers"
              className="mt-7 flex h-11 items-center justify-center rounded-full bg-[var(--accent)] text-[14px] font-medium text-white transition-colors hover:bg-[var(--accent-deep)]"
            >
              Find your provider
            </Link>
          </Reveal>

          <Reveal delay={0.12} className="rounded-[26px] bg-[var(--surface)] p-7 shadow-[var(--shadow-card)]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">A longer talk</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">{formatDalasi(longer.amountMinor)}</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">up to {longer.durationSec / 60} minutes</p>
            <p className="mt-5 text-[14px] leading-relaxed">
              Twenty minutes with TALK, for when you&apos;re not ready to speak to a person.
            </p>
            <ul className="mt-5 space-y-2.5 text-[13.5px]">
              {["Everything in the first conversation", "Twenty minutes instead of eight", "Urgent help is always free"].map((t) => (
                <li key={t} className="flex gap-3">
                  <Dot />
                  {t}
                </li>
              ))}
            </ul>
            <StartLink className="mt-7 flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]">
              Talk again
            </StartLink>
          </Reveal>
        </div>

        <Reveal className="mt-10 flex justify-center">
          <Link
            href="/crisis"
            className="inline-flex items-center gap-3 rounded-full bg-[var(--sage-pale)] px-6 py-3 text-[13.5px] text-[var(--foreground)]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden />
            Urgent help is always free. No payment, no account.
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
