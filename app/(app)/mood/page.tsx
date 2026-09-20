"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import { useAuth } from "@/components/AuthProvider";
import MoodTrendChart from "@/components/app/MoodTrendChart";
import Card, { StatTile } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Alert, Pill, Spinner, EmptyState } from "@/components/ui/Feedback";
import { IconMood } from "@/components/ui/icons";
import { MOOD_LABELS, type MoodEntry, type MoodScore } from "@/lib/models";
import {
  MOOD_TAGS,
  averageMood,
  deleteMoodEntry,
  hasCheckedInToday,
  moodStreak,
  saveMoodEntry,
  watchMoodEntries,
} from "@/lib/wellbeing";

/**
 * Mood check-ins.
 *
 * The scale is 1–5 with words rather than numbers on the buttons, because
 * "rate your mood 1 to 10" invites analysis and this wants a gut answer. Tags
 * and the note are both optional — a check-in that takes four taps gets done
 * daily; one that takes a paragraph does not.
 */

const SCORES: MoodScore[] = [1, 2, 3, 4, 5];

/** Faces rather than a numeric ramp — the scale is ordinal, not a magnitude. */
const FACES: Record<MoodScore, string> = {
  1: "M8 15.5c1-1.2 2.4-1.8 4-1.8s3 .6 4 1.8",
  2: "M8 15c1-.7 2.4-1.1 4-1.1s3 .4 4 1.1",
  3: "M8 14.8h8",
  4: "M8 14c1 .7 2.4 1.1 4 1.1s3-.4 4-1.1",
  5: "M8 13.5c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8",
};

function MoodFace({ score, size = 28 }: { score: MoodScore; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.4" />
      <path d={FACES[score]} />
    </svg>
  );
}

export default function MoodPage() {
  const { user } = useAuth();

  const [entries, setEntries] = useState<MoodEntry[] | null>(null);
  const [score, setScore] = useState<MoodScore | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchMoodEntries(user.uid, setEntries);
  }, [user]);

  async function submit() {
    if (!user || score == null) return;
    setSaving(true);
    setError(null);
    try {
      await saveMoodEntry(user.uid, { score, tags, note });
      setScore(null);
      setTags([]);
      setNote("");
      setSaved(true);
      // The confirmation is transient on purpose — a permanent "saved" banner
      // becomes furniture and stops being read.
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that check-in.");
    } finally {
      setSaving(false);
    }
  }

  const list = entries ?? [];
  const streak = moodStreak(list);
  const avg = averageMood(list.slice(0, 14));
  const checkedInToday = hasCheckedInToday(list);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Mood
        </p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          {checkedInToday ? "Checked in today." : "How are you, really?"}
        </h1>
      </div>

      {/* Check-in */}
      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <AnimatePresence mode="wait">
          {saved ? (
            <motion.div
              key="saved"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SOFT}
            >
              <Alert tone="success" title="Check-in saved">
                That is recorded and visible only to you. Come back tomorrow — the
                trend gets more useful the longer you keep it.
              </Alert>
            </motion.div>
          ) : (
            <motion.div key="form" exit={{ opacity: 0 }}>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                {checkedInToday ? "Check in again" : "Today"}
              </p>

              <div className="mt-6 grid grid-cols-5 gap-2 md:gap-3">
                {SCORES.map((s) => {
                  const active = score === s;
                  return (
                    <motion.button
                      key={s}
                      type="button"
                      onClick={() => setScore(s)}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING_SNAP}
                      aria-pressed={active}
                      aria-label={MOOD_LABELS[s]}
                      className={`rounded-2xl border py-4 px-2 flex flex-col items-center gap-2 transition-colors ${
                        active
                          ? "bg-[var(--dark)] text-white border-[var(--dark)]"
                          : "bg-[var(--background)] border-[var(--border)] hover:bg-black/[.04]"
                      }`}
                    >
                      <MoodFace score={s} />
                      <span className="text-[10px] md:text-[11px] leading-tight text-center">
                        {MOOD_LABELS[s]}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence>
                {score != null ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={SPRING_SOFT}
                    className="overflow-hidden"
                  >
                    <div className="pt-8">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
                        What is contributing? (optional)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {MOOD_TAGS.map((tag) => (
                          <Pill
                            key={tag}
                            active={tags.includes(tag)}
                            onClick={() =>
                              setTags((t) =>
                                t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag],
                              )
                            }
                          >
                            {tag}
                          </Pill>
                        ))}
                      </div>

                      <Textarea
                        label="Anything you want to add? (optional)"
                        className="mt-6"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={1000}
                        placeholder="Just for you — nobody else sees this."
                      />

                      {error ? (
                        <Alert tone="warning" className="mt-4">
                          {error}
                        </Alert>
                      ) : null}

                      <div className="mt-6">
                        <Button onClick={submit} loading={saving} disabled={saving} withArrow={false}>
                          Save check-in
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Stats */}
      {entries === null ? (
        <div className="flex items-center gap-3 text-[var(--muted)] py-8">
          <Spinner />
          <span className="text-[13px]">Loading your history…</span>
        </div>
      ) : list.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatTile
              label="Current streak"
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
              label="Check-ins"
              value={list.length}
              caption="recorded"
              delay={0.1}
              className="col-span-2 md:col-span-1"
            />
          </div>

          <Card radius="md" padding="p-6 md:p-8" reveal={false}>
            <MoodTrendChart entries={list} />
          </Card>

          <div>
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)] mb-4">
              Recent check-ins
            </h2>
            <ul className="space-y-2">
              {list.slice(0, 10).map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-2xl bg-white px-5 py-4 flex items-start gap-4 group"
                >
                  <span className="mt-0.5 text-[var(--accent)] shrink-0">
                    <MoodFace score={entry.score} size={24} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">
                      {MOOD_LABELS[entry.score]}
                      <span className="ml-2 text-[12px] font-normal text-[var(--muted)]">
                        {new Date(entry.recordedAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    {entry.tags.length ? (
                      <p className="mt-1 text-[12px] text-[var(--muted)]">
                        {entry.tags.join(" · ")}
                      </p>
                    ) : null}
                    {entry.note ? (
                      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                        {entry.note}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => user && deleteMoodEntry(user.uid, entry.id)}
                    aria-label="Delete this check-in"
                    className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--danger)] hover:bg-black/5 transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<IconMood />}
          title="No check-ins yet"
          description="Check in above and your trend will start building. One tap a day is enough — the value is in the pattern over weeks, not in any single entry."
        />
      )}
    </div>
  );
}
