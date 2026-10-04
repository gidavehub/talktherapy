"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import { Alert, Avatar, EmptyState, Spinner } from "../ui/Feedback";
import { IconCalendar, IconSpeaker } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useReadAloud } from "../../lib/useReadAloud";
import { getProvider } from "../../lib/providers";
import { formatDalasi } from "../../lib/money";
import {
  SESSION_MINUTES,
  bookSlot,
  byDay,
  spokenSlot,
  timeLabel,
  watchOpenSlots,
} from "../../lib/booking";
import type { AvailabilitySlot, ProviderProfile } from "../../lib/models";

/**
 * Pick a time with a provider.
 *
 * Every time on this page can be HEARD. Talk is built for people who in many
 * cases cannot read a calendar, and a booking screen that only works by
 * reading would undo the whole point of a voice-first intake — so each day
 * carries a speaker button that reads its times aloud in the person's own
 * language, and the times themselves are large tap targets rather than a grid.
 *
 * The booking itself is made by the server, which is the only thing that can
 * take a time and mark it taken in the same breath. A refusal here is almost
 * always "somebody else just took it", which is why the list stays live
 * underneath: the taken time disappears while they are reading the message.
 */
export default function SlotPicker({ providerId }: { providerId: string }) {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The language they chose when they talked to Talk — the whole reason this
  // screen reads itself aloud is for somebody who cannot read it, and reading
  // it to them in English would not help.
  const { read, speakingId } = useReadAloud(profile?.intake?.language ?? null);

  useEffect(() => {
    let cancelled = false;
    getProvider(providerId)
      .then((found) => {
        if (!cancelled) setProvider(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => watchOpenSlots(providerId, setSlots), [providerId]);

  const confirm = useCallback(async () => {
    if (!chosen || !user) return;
    setBooking(true);
    setError(null);

    const result = await bookSlot(providerId, chosen, note);
    if (result.ok) {
      router.push("/sessions?booked=1");
      return;
    }

    setBooking(false);
    setChosen(null);
    setError(result.error ?? "Could not book that time.");
  }, [chosen, note, providerId, router, user]);

  if (slots === null) {
    return (
      <div className="flex justify-center py-16 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  const days = byDay(slots);
  const picked = slots.find((s) => s.id === chosen) ?? null;

  return (
    <div className="max-w-[620px] space-y-5">
      {provider ? (
        <div className="flex items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5">
          <Avatar name={provider.displayName} size={46} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-tight">
              {provider.displayName}
            </p>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
              {formatDalasi(provider.sessionRateMinor)} · {SESSION_MINUTES} minutes · by video
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert tone="warning" title="Not booked">
          {error}
        </Alert>
      ) : null}

      {days.length === 0 ? (
        <EmptyState
          icon={<IconCalendar />}
          title="No times free just now"
          description="This provider has not put any hours up yet, or the ones they had are taken. Message them and ask — they can add a time for you."
          action={<Button href={`/providers/${providerId}`}>Back to their profile</Button>}
        />
      ) : (
        <div className="space-y-3">
          {days.map(({ day, slots: ofDay }, index) => (
            <motion.div
              key={day}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...SPRING_SOFT, delay: Math.min(index * 0.05, 0.25) }}
              className="rounded-[22px] bg-white px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium">{day}</p>
                <button
                  type="button"
                  // Reads the whole day out: "Tuesday 7 October. Times free:
                  // 9, 10, 2." Somebody who cannot read the screen gets the
                  // same information as somebody who can.
                  onClick={() =>
                    read(
                      day,
                      `${day}. Times free: ${ofDay.map((s) => timeLabel(s.startsAt)).join(", ")}`,
                    )
                  }
                  aria-label={speakingId === day ? "Stop reading aloud" : `Read ${day} aloud`}
                  aria-pressed={speakingId === day}
                  className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                    speakingId === day
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)]"
                  }`}
                >
                  <IconSpeaker size={15} />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {ofDay.map((slot) => {
                  const on = chosen === slot.id;
                  return (
                    <motion.button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        setChosen(on ? null : slot.id);
                        setError(null);
                      }}
                      whileTap={{ scale: 0.95 }}
                      transition={SPRING_SNAP}
                      aria-pressed={on}
                      aria-label={spokenSlot(slot.startsAt, slot.endsAt)}
                      className={`min-w-[84px] rounded-full px-4 py-3 text-[14px] tabular-nums transition-colors ${
                        on
                          ? "bg-[var(--dark)] text-white"
                          : "bg-[var(--background)] text-[var(--foreground)] hover:bg-black/[.06]"
                      }`}
                    >
                      {timeLabel(slot.startsAt)}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {picked ? (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="rounded-[22px] bg-white px-4 py-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] leading-snug">
              {spokenSlot(picked.startsAt, picked.endsAt)}
            </p>
            <button
              type="button"
              onClick={() =>
                read(
                  picked.id,
                  `You are booking ${spokenSlot(picked.startsAt, picked.endsAt)}${
                    provider ? ` with ${provider.displayName}` : ""
                  }.`,
                )
              }
              aria-label="Read this aloud"
              aria-pressed={speakingId === picked.id}
              className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                speakingId === picked.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-black/5"
              }`}
            >
              <IconSpeaker size={15} />
            </button>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Anything you want them to know beforehand (optional)"
            aria-label="Anything you want them to know beforehand"
            className="w-full resize-none rounded-2xl bg-[var(--background)] px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-[var(--muted)]"
          />

          <div className="flex items-center gap-3">
            <Button onClick={() => void confirm()} disabled={booking}>
              {booking ? "Booking…" : "Book this time"}
            </Button>
            <p className="text-[12px] text-[var(--muted)] leading-relaxed">
              You can cancel whenever you need to.
            </p>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
