"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { ProviderArch } from "../providers/ProviderCard";
import { Skeleton } from "../ui/Feedback";
import { LOCALE_LABELS, type ProviderProfile } from "../../lib/models";
import { listVerifiedProviders } from "../../lib/providers";
import { SERVICE_LABELS, SPECIALIZATION_LABELS, type Specialization } from "../../lib/matching";
import Reveal from "./Reveal";

/**
 * "Meet your providers" — four of the people in the directory, each in their
 * arch, and the way to all of them.
 */
export default function MeetProviders() {
  const [providers, setProviders] = useState<ProviderProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVerifiedProviders()
      .then((all) => {
        if (!cancelled) setProviders(all.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const samples = providers?.some((p) => p.sample);

  return (
    <section className="bg-[var(--background)] py-16 md:py-20">
      <div className="mx-auto max-w-[1200px] px-5 md:px-10">
        <Reveal className="text-center">
          <h2 className="font-display text-[34px] font-medium leading-tight md:text-[42px]">Meet your providers</h2>
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] text-[var(--muted)]">
            Qualified people who understand your world. Choose by language, specialty, and who you feel most comfortable
            with.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {providers === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center rounded-[26px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
                  <Skeleton rounded="arch" className="h-[130px] w-[112px]" />
                  <Skeleton className="mt-5 h-5 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                  <Skeleton rounded="rounded-full" className="mt-6 h-10 w-32" />
                </div>
              ))
            : providers.map((p, i) => (
                <motion.div
                  key={p.uid}
                  initial={{ y: 24, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ ...SPRING_SOFT, delay: i * 0.06 }}
                  whileHover={{ y: -4 }}
                  className="flex flex-col items-center rounded-[26px] bg-[var(--surface)] px-5 pb-6 pt-6 text-center shadow-[var(--shadow-card)]"
                >
                  <ProviderArch profile={p} index={i} className="h-[130px] w-[112px]" />
                  <h3 className="font-display mt-5 text-[20px] font-medium leading-tight">{p.displayName}</h3>
                  <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                    {p.headline.split(/\s[—–-]\s/)[0] || p.services.map((s) => SERVICE_LABELS[s]).join(", ") || "Provider"}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {p.specializations.slice(0, 2).map((s) => (
                      <span key={s} className="inline-flex h-6 items-center rounded-full bg-[var(--sand)] px-2.5 text-[11.5px]">
                        {SPECIALIZATION_LABELS[s as Specialization] ?? s}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[12.5px] text-[var(--muted)]">
                    Speaks {p.languages.map((l) => LOCALE_LABELS[l]).join(", ")}
                  </p>
                  <Link
                    href={`/providers/${p.uid}`}
                    className="mt-5 inline-flex h-10 items-center rounded-full border-[1.5px] border-[var(--dark)] px-6 text-[13.5px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
                  >
                    View profile
                  </Link>
                </motion.div>
              ))}
        </div>

        <Reveal className="mt-8 text-center">
          {samples ? <p className="text-[12px] text-[var(--muted)]">Sample profiles, for layout only</p> : null}
          <Link
            href="/providers"
            className="mt-4 inline-flex h-12 items-center rounded-full bg-[var(--accent)] px-8 text-[14.5px] font-medium text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--accent-deep)]"
          >
            View all providers
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
