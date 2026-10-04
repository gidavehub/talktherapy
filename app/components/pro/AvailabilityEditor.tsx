"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { Alert, Spinner } from "../ui/Feedback";
import { useAuth } from "../AuthProvider";
import {
  SESSION_MINUTES,
  addSlot,
  dayLabel,
  removeSlot,
  timeLabel,
  watchAllSlots,
} from "../../lib/booking";
import { useNow } from "../../lib/useNow";
import type { AvailabilitySlot } from "../../lib/models";

/**
 * When a provider is free.
 *
 * Deliberately not a calendar widget. A provider setting up on a phone, on a
 * mobile connection, wants to tap the four hours they can do this week and
 * leave — so this is the next two weeks as rows of hours, and tapping one
 * turns it on or off. No date picker, no drag, nothing to learn.
 *
 * A booked hour is shown and locked. The way to undo a booking is to cancel
 * it, which tells the other person; deleting the slot underneath them would
 * make their session quietly disappear.
 */

/** Hours a session can start. Whole hours, because nobody offers 09:17. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/** How far ahead to let someone fill in. Two weeks is as far as anyone plans. */
const DAYS_AHEAD = 14;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The next fortnight, as midnight timestamps in the provider's own timezone. */
function days(): number[] {
  const first = startOfToday();
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });
}

function slotStart(dayStart: number, hour: number): number {
  const d = new Date(dayStart);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export default function AvailabilityEditor() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;

  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ticks, so an hour that passes while this is open stops being tappable.
  const now = useNow(60_000);

  useEffect(() => {
    if (!uid) return;
    return watchAllSlots(uid, setSlots);
  }, [uid]);

  /** Slot by start time, so a button knows its own state in one lookup. */
  const byStart = useMemo(() => {
    const map = new Map<number, AvailabilitySlot>();
    for (const slot of slots ?? []) map.set(slot.startsAt, slot);
    return map;
  }, [slots]);

  const offered = (slots ?? []).filter((s) => s.status === "open").length;
  const booked = (slots ?? []).filter((s) => s.status === "booked").length;

  async function toggle(startsAt: number) {
    if (!uid) return;
    const existing = byStart.get(startsAt);
    if (existing?.status === "booked") return;

    setBusy(startsAt);
    setError(null);
    try {
      if (existing) await removeSlot(uid, existing.id);
      else await addSlot(uid, startsAt);
    } catch {
      setError("That did not save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (profile && profile.role !== "provider") {
    return (
      <Alert tone="info" title="This page is for providers">
        Your account is set up as someone looking for support.
      </Alert>
    );
  }

  if (slots === null) {
    return (
      <div className="flex justify-center py-16 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[var(--muted)]">
        <span>
          <strong className="text-[var(--foreground)]">{offered}</strong> hours offered
        </span>
        <span>
          <strong className="text-[var(--foreground)]">{booked}</strong> booked
        </span>
        <span>Each session is {SESSION_MINUTES} minutes.</span>
      </div>

      {error ? (
        <Alert tone="warning" title="Not saved">
          {error}
        </Alert>
      ) : null}

      {offered === 0 && booked === 0 ? (
        <Alert tone="info" title="Nobody can book you yet">
          Tap the hours you can meet. You can change them whenever you like —
          an hour nobody has taken comes straight back off.
        </Alert>
      ) : null}

      <div className="space-y-3">
        {days().map((day) => (
          <div key={day} className="rounded-[22px] bg-white px-4 py-3.5">
            <p className="text-[13px] font-medium">{dayLabel(day)}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {HOURS.map((hour) => {
                const startsAt = slotStart(day, hour);
                const slot = byStart.get(startsAt);
                const past = startsAt < now;
                const isBooked = slot?.status === "booked";
                const isOpen = slot?.status === "open";

                return (
                  <motion.button
                    key={hour}
                    type="button"
                    disabled={past || isBooked || busy === startsAt}
                    onClick={() => void toggle(startsAt)}
                    whileTap={past || isBooked ? undefined : { scale: 0.94 }}
                    transition={SPRING_SNAP}
                    aria-pressed={isOpen || isBooked}
                    aria-label={
                      isBooked
                        ? `${timeLabel(startsAt)} — booked`
                        : isOpen
                          ? `${timeLabel(startsAt)} — offered, tap to withdraw`
                          : `${timeLabel(startsAt)} — tap to offer`
                    }
                    className={`min-w-[62px] rounded-full px-3 py-2 text-[12.5px] tabular-nums transition-colors ${
                      isBooked
                        ? "bg-[var(--accent)] text-white"
                        : isOpen
                          ? "bg-[var(--dark)] text-white"
                          : past
                            ? "text-[var(--muted)] opacity-35"
                            : "bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    } disabled:cursor-default`}
                  >
                    {timeLabel(startsAt)}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        Orange means somebody has booked that hour. To undo one of those, cancel
        the session from Sessions — that way the person knows.
      </p>
    </div>
  );
}
