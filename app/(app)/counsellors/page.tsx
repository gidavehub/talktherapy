"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "@/components/motion/primitives";
import { useAuth } from "@/components/AuthProvider";
import CounsellorCard from "@/components/counsellors/CounsellorCard";
import Button from "@/components/ui/Button";
import { EmptyState, Pill, Spinner } from "@/components/ui/Feedback";
import { IconPeople } from "@/components/ui/icons";
import { intakeChips } from "@/lib/matching";
import { useMatches } from "@/lib/useMatches";

/**
 * Counsellors for you.
 *
 * Where onboarding ends: Talk has learned what someone needs, and this is who
 * fits — ranked, each card saying why. Also where "View all" on the dashboard
 * leads. Everyone available is listed; the ones that fit come first.
 */
export default function CounsellorsForYouPage() {
  const { profile } = useAuth();
  const intake = profile?.intake ?? null;
  const { matches, error, loading } = useMatches(intake);
  const [welcome] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome"),
  );

  const chips = intakeChips(intake);
  const name = intake?.preferredName ?? profile?.displayName?.split(" ")[0] ?? null;

  return (
    <div className="space-y-8">
      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">For you</p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          {welcome && name ? `${name}, these people fit you.` : "People who fit you."}
        </h1>

        {chips.length ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <Pill key={c}>{c}</Pill>
            ))}
            <Link
              href="/therapy?intake"
              className="ml-1 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors"
            >
              Change
            </Link>
          </div>
        ) : null}

        {welcome ? (
          <div className="mt-6">
            <Button href="/dashboard" variant="secondary" size="sm">
              Go to dashboard
            </Button>
          </div>
        ) : null}
      </motion.div>

      {/* No intake yet (an account from before onboarding was a conversation). */}
      {!intake ? (
        <Link
          href="/therapy?intake"
          className="flex items-center justify-between gap-4 rounded-[28px] bg-[var(--dark)] text-white px-6 md:px-8 py-6 hover:bg-[var(--dark-soft)] transition-colors"
        >
          <span className="text-[16px] md:text-[18px] font-medium">Tell Talk what you need</span>
          <span className="h-10 w-10 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 text-[var(--muted)] py-16 justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <EmptyState
          icon={<IconPeople />}
          title="We could not load counsellors"
          description="Please try again in a moment."
          action={<Button href="/support" variant="secondary">Contact support</Button>}
        />
      ) : !matches || matches.length === 0 ? (
        <EmptyState
          icon={<IconPeople />}
          title="Counsellors are being verified"
          description="Every counsellor is credential-checked before they appear here. We will show you who fits as soon as they are ready."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {matches.map((m, i) => (
            <CounsellorCard
              key={m.profile.uid}
              profile={m.profile}
              index={i}
              reasons={intake ? m.reasons : undefined}
              best={Boolean(intake) && i === 0 && m.reasons.length > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
