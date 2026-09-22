"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "@/components/motion/primitives";
import { useAuth } from "@/components/AuthProvider";
import Card, { StatTile, DarkPanel } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import MoodTrendChart from "@/components/app/MoodTrendChart";
import CounsellorCard from "@/components/counsellors/CounsellorCard";
import { Spinner } from "@/components/ui/Feedback";
import { useMatches } from "@/lib/useMatches";
import {
  IconMood,
  IconJournal,
  IconMic,
  IconResources,
} from "@/components/ui/icons";
import {
  averageMood,
  hasCheckedInToday,
  moodStreak,
  watchJournalEntries,
  watchMoodEntries,
} from "@/lib/wellbeing";
import { SEED_RESOURCES } from "@/lib/resources-seed";
import type { JournalEntry, MoodEntry } from "@/lib/models";

/**
 * Patient home.
 *
 * Counsellors first. The point of Talk is getting someone to the right person,
 * so the first thing on the page is who fits them — picked from what they told
 * Talk at onboarding — with "View all" one tap away. The check-in and journal
 * follow for anyone who wants them. Crisis help is reachable from here without
 * scrolling past anything.
 */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const intake = profile?.intake ?? null;
  const { matches, loading: matchesLoading } = useMatches(intake);
  const [moods, setMoods] = useState<MoodEntry[] | null>(null);
  const [journal, setJournal] = useState<JournalEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubMood = watchMoodEntries(user.uid, setMoods, 30);
    const unsubJournal = watchJournalEntries(user.uid, setJournal, 3);
    return () => {
      unsubMood();
      unsubJournal();
    };
  }, [user]);

  const moodList = moods ?? [];
  const checkedIn = hasCheckedInToday(moodList);
  const streak = moodStreak(moodList);
  const avg = averageMood(moodList.slice(0, 14));

  const firstName =
    (profile?.displayName ?? user?.displayName ?? "").split(" ")[0] || null;

  // Suggest a resource matching what they said at intake, falling back to the
  // first published one rather than showing nothing.
  const suggested =
    SEED_RESOURCES.find((r) =>
      profile?.goals?.some((g) =>
        r.topics.some((t) => t.includes(g) || g.includes(t.split("-")[0])),
      ),
    ) ?? SEED_RESOURCES[0];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING_SOFT}
      >
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          {greeting()}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
      </motion.div>

      {/* Counsellors for you — the first option, always. */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 className="text-[20px] md:text-[24px] tracking-tight font-medium">Counsellors for you</h2>
          <Link
            href="/counsellors"
            className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors shrink-0"
          >
            View all
          </Link>
        </div>
        {matchesLoading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]">
            <Spinner />
          </div>
        ) : matches && matches.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {matches.slice(0, 3).map((m, i) => (
              <CounsellorCard
                key={m.profile.uid}
                profile={m.profile}
                index={i}
                reasons={intake ? m.reasons : undefined}
                best={Boolean(intake) && i === 0 && m.reasons.length > 0}
                compact
              />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-[var(--muted)]">
            Counsellors are being verified — who fits you will appear here.
          </p>
        )}
        {!intake ? (
          <Link
            href="/therapy?intake"
            className="mt-4 inline-block text-[12px] uppercase tracking-[0.14em] underline underline-offset-4 hover:text-[var(--accent)] transition-colors"
          >
            Tell Talk what you need for better matches
          </Link>
        ) : null}
      </section>

      {/* Check-in prompt */}
      {!checkedIn ? (
        <DarkPanel padding="px-6 md:px-10 py-8 md:py-10">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">
                Today
              </p>
              <h2 className="mt-3 text-[24px] md:text-[32px] leading-tight tracking-tight font-medium">
                How are you feeling?
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-[420px]">
                One tap. It takes ten seconds and it is the thing that makes the
                rest of this useful over time.
              </p>
            </div>
            <Button href="/mood" size="lg">
              Check in
            </Button>
          </div>
        </DarkPanel>
      ) : (
        <Alert tone="success" title="You checked in today">
          {streak > 1
            ? `That is ${streak} days in a row.`
            : "Come back tomorrow to start a streak."}
        </Alert>
      )}

      {/* Snapshot */}
      {moodList.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatTile
              label="Streak"
              value={streak}
              caption={streak === 1 ? "day" : "days"}
              icon={<IconMood />}
            />
            <StatTile
              label="14-day average"
              value={avg ? avg.toFixed(1) : "—"}
              caption="out of 5"
              delay={0.05}
            />
            <StatTile
              label="Journal entries"
              value={journal?.length ?? 0}
              caption="recent"
              delay={0.1}
              icon={<IconJournal />}
              className="col-span-2 md:col-span-1"
            />
          </div>

          <Card radius="md" padding="p-6 md:p-8" reveal={false}>
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="text-[16px] font-medium">Your mood</h2>
              <Link
                href="/mood"
                className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors"
              >
                All check-ins
              </Link>
            </div>
            <MoodTrendChart entries={moodList} />
          </Card>
        </>
      ) : null}

      {/* Recent journal */}
      {journal && journal.length > 0 ? (
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
              Recent writing
            </h2>
            <Link
              href="/journal"
              className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors"
            >
              All entries
            </Link>
          </div>
          <ul className="space-y-2">
            {journal.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/journal/${entry.id}`}
                  className="block rounded-2xl bg-white px-5 py-4 hover:bg-black/[.02] transition-colors"
                >
                  <p className="text-[14px] font-medium">
                    {entry.title || "Untitled entry"}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Next steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card hover radius="md" padding="p-6" delay={0}>
          <span className="h-10 w-10 rounded-full bg-[var(--dark)] text-white flex items-center justify-center">
            <IconJournal />
          </span>
          <h3 className="mt-5 text-[16px] font-medium">Write something</h3>
          <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
            Private, and there are prompts if you are stuck.
          </p>
          <Link
            href="/journal/new"
            className="mt-4 inline-block text-[12px] uppercase tracking-[0.14em] underline underline-offset-4 hover:text-[var(--accent)] transition-colors"
          >
            Open journal
          </Link>
        </Card>

        <Card hover radius="md" padding="p-6" delay={0.05}>
          <span className="h-10 w-10 rounded-full bg-[var(--dark)] text-white flex items-center justify-center">
            <IconResources />
          </span>
          <h3 className="mt-5 text-[16px] font-medium">{suggested.title}</h3>
          <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
            {suggested.summary}
          </p>
          <Link
            href={`/resources/${suggested.slug}`}
            className="mt-4 inline-block text-[12px] uppercase tracking-[0.14em] underline underline-offset-4 hover:text-[var(--accent)] transition-colors"
          >
            Read it
          </Link>
        </Card>

        <Card hover radius="md" padding="p-6" delay={0.1}>
          <span className="h-10 w-10 rounded-full bg-[var(--dark)] text-white flex items-center justify-center">
            <IconMic />
          </span>
          <h3 className="mt-5 text-[16px] font-medium">Talk it through</h3>
          <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
            Talk listens any time, in your language.
          </p>
          <Link
            href="/therapy"
            className="mt-4 inline-block text-[12px] uppercase tracking-[0.14em] underline underline-offset-4 hover:text-[var(--accent)] transition-colors"
          >
            Open Talk
          </Link>
        </Card>
      </div>

      <p className="text-[13px] text-[var(--muted)] pt-4">
        If you need urgent help,{" "}
        <Link
          href="/crisis"
          className="underline underline-offset-4 text-[var(--foreground)]"
        >
          crisis contacts are here
        </Link>
        .
      </p>
    </div>
  );
}
