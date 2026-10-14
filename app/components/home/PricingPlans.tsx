"use client";

import Link from "next/link";
import StartLink from "../StartLink";
import Reveal from "./Reveal";
import type { ContentOf, HomeContent } from "../../lib/content/schema";

/**
 * "Pay for what you use." — the first conversation, sessions with a provider
 * (where TALK leads you), and a longer talk. The cards' words are the site
 * content's (plans.first, .provider and .longer), shown here and on /plans.
 * Every number in them is a placeholder the server fills from the constants
 * the payments use, so the page can never say a price the checkout does not
 * charge.
 */

type PricingCards = Pick<ContentOf<"plans">, "first" | "provider" | "longer">;

function Dot() {
  return <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />;
}

function Points({ points }: { points: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5 text-[13.5px]">
      {points.map((point, i) => (
        <li key={i} className="flex gap-3">
          <Dot />
          {point}
        </li>
      ))}
    </ul>
  );
}

export default function PricingPlans({
  cards,
  heading,
}: {
  cards: PricingCards;
  /** The heading over the cards on the front page; none on /plans, whose own heading says it. */
  heading?: HomeContent["pricing"];
}) {
  const { first, provider, longer } = cards;
  return (
    <section id="pricing" className="bg-[var(--background)] py-16 md:py-20">
      <div className="mx-auto max-w-[1100px] px-5 md:px-10">
        {heading ? (
          <Reveal className="text-center">
            <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">{heading.heading}</h2>
            <p className="mt-3 text-[15px] text-[var(--muted)]">{heading.lede}</p>
          </Reveal>
        ) : null}

        <div className="mt-12 grid grid-cols-1 items-center gap-6 md:grid-cols-3 md:gap-5">
          <Reveal className="rounded-[26px] bg-[var(--surface)] p-7 shadow-[var(--shadow-card)]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">{first.eyebrow}</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">{first.price}</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">{first.unit}</p>
            <p className="mt-5 text-[14px] leading-relaxed">{first.body}</p>
            <Points points={first.points} />
            <StartLink className="mt-7 flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]">
              {first.button}
            </StartLink>
          </Reveal>

          <Reveal delay={0.06} className="relative rounded-[26px] bg-[var(--sage)] p-7 pt-10 text-[var(--cream)] shadow-[var(--shadow-floating)] md:-my-4 md:py-11">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--accent)] px-4 py-1.5 text-[10.5px] uppercase tracking-[0.24em] text-white">
              {provider.badge}
            </span>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--cream)]/75">{provider.eyebrow}</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">{provider.price}</p>
            <p className="mt-2 text-[13px] text-[var(--cream)]/75">{provider.unit}</p>
            <p className="mt-5 text-[14px] leading-relaxed">{provider.body}</p>
            <Points points={provider.points} />
            <Link
              href="/providers"
              className="mt-7 flex h-11 items-center justify-center rounded-full bg-[var(--accent)] text-[14px] font-medium text-white transition-colors hover:bg-[var(--accent-deep)]"
            >
              {provider.button}
            </Link>
          </Reveal>

          <Reveal delay={0.12} className="rounded-[26px] bg-[var(--surface)] p-7 shadow-[var(--shadow-card)]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">{longer.eyebrow}</p>
            <p className="font-display mt-3 text-[46px] font-medium leading-none">{longer.price}</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">{longer.unit}</p>
            <p className="mt-5 text-[14px] leading-relaxed">{longer.body}</p>
            <Points points={longer.points} />
            <StartLink className="mt-7 flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]">
              {longer.button}
            </StartLink>
          </Reveal>
        </div>

        <Reveal className="mt-10 flex justify-center">
          <Link
            href="/crisis"
            className="inline-flex items-center gap-3 rounded-full bg-[var(--sage-pale)] px-6 py-3 text-[13.5px] text-[var(--foreground)]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden />
            Emergency numbers are free to call — 117 police, 116 ambulance, 118 fire.
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
