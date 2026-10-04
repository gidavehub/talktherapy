"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Alert, Avatar, EmptyState, Spinner } from "../ui/Feedback";
import { IconCalendar, IconChat, IconSpeaker } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
import { useReadAloud } from "../../lib/useReadAloud";
import { directChatId } from "../../lib/chat";
import { formatDalasi } from "../../lib/money";
import { cancelBooking, spokenSlot, watchMyBookings } from "../../lib/booking";
import { useNow } from "../../lib/useNow";
import type { Booking } from "../../lib/models";

/**
 * Sessions, from both sides.
 *
 * One component for patient and provider, because `participants` means one
 * query serves both and the row says the same things either way — who, when,
 * and the two things you can do about it: open the conversation, or cancel.
 *
 * Past and cancelled sessions stay, below the line. A therapeutic record is
 * not something to tidy away, and "did I actually see her in September?" is a
 * question people ask.
 */

function when(booking: Booking): string {
  return spokenSlot(booking.startsAt, booking.endsAt);
}

function SessionRow({
  booking,
  selfUid,
  now,
  onCancel,
  cancelling,
  onRead,
  speaking,
}: {
  booking: Booking;
  selfUid: string;
  /** Passed down rather than read here, so every row agrees on the time. */
  now: number;
  onCancel: (id: string) => void;
  cancelling: boolean;
  onRead: (id: string, text: string) => void;
  speaking: boolean;
}) {
  const otherUid = booking.participants.find((uid) => uid !== selfUid) ?? null;
  const peer = useChatPeer(otherUid, "The other person");
  const past = booking.endsAt < now;
  const cancelled = booking.status === "cancelled";

  const line = `${when(booking)} with ${peer.name}`;

  return (
    <motion.div
      initial={{ y: 14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className={`rounded-[22px] bg-white px-4 py-3.5 ${cancelled || past ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3.5">
        <Avatar name={peer.name} size={44} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium leading-tight">{peer.name}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--muted)] leading-snug">
            {when(booking)}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {cancelled
              ? "Cancelled"
              : past
                ? "Done"
                : booking.paymentStatus === "paid"
                  ? "Paid"
                  : formatDalasi(booking.amountMinor)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRead(booking.id, line)}
          aria-label={speaking ? "Stop reading aloud" : "Read this session aloud"}
          aria-pressed={speaking}
          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
            speaking
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)]"
          }`}
        >
          <IconSpeaker size={15} />
        </button>
      </div>

      {booking.patientNote && !cancelled ? (
        <p className="mt-2.5 rounded-2xl bg-[var(--background)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
          {booking.patientNote}
        </p>
      ) : null}

      {!cancelled && !past ? (
        <div className="mt-3 flex items-center gap-2">
          {otherUid ? (
            <Link
              href={`/chats/${directChatId(selfUid, otherUid)}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--background)] px-4 py-2 text-[12.5px] hover:bg-black/[.06] transition-colors"
            >
              <IconChat size={14} />
              Message
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => onCancel(booking.id)}
            disabled={cancelling}
            className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      ) : null}
    </motion.div>
  );
}

export default function SessionList() {
  const { user, profile, role } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { read, speakingId } = useReadAloud(profile?.intake?.language ?? null);
  const now = useNow();

  useEffect(() => {
    if (!user) return;
    return watchMyBookings(user.uid, setBookings);
  }, [user]);

  async function cancel(id: string) {
    setCancelling(id);
    setError(null);
    const result = await cancelBooking(id);
    if (!result.ok) setError(result.error ?? "Could not cancel that session.");
    setCancelling(null);
  }

  if (!user || bookings === null) {
    return (
      <div className="flex justify-center py-16 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  const upcoming = bookings.filter((b) => b.status !== "cancelled" && b.endsAt >= now);
  const rest = bookings.filter((b) => b.status === "cancelled" || b.endsAt < now).reverse();

  if (bookings.length === 0) {
    return role === "provider" ? (
      <EmptyState
        icon={<IconCalendar />}
        title="Nothing booked yet"
        description="Put some hours up and people who match what you offer can take one. You will see them here, with a way to message them beforehand."
        action={<Button href="/pro/availability">Set your hours</Button>}
      />
    ) : (
      <EmptyState
        icon={<IconCalendar />}
        title="No sessions yet"
        description="When you are ready to see somebody, open a provider's profile and pick a time that suits you."
        action={<Button href="/matches">See providers for you</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="warning" title="Not cancelled">
          {error}
        </Alert>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="space-y-2">
          {upcoming.map((booking) => (
            <SessionRow
              key={booking.id}
              booking={booking}
              selfUid={user.uid}
              now={now}
              onCancel={(id) => void cancel(id)}
              cancelling={cancelling === booking.id}
              onRead={read}
              speaking={speakingId === booking.id}
            />
          ))}
        </div>
      ) : (
        <Alert tone="info" title="Nothing coming up">
          {role === "provider"
            ? "No sessions booked at the moment."
            : "You have no sessions booked at the moment."}
        </Alert>
      )}

      {rest.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Earlier
          </p>
          {rest.map((booking) => (
            <SessionRow
              key={booking.id}
              booking={booking}
              selfUid={user.uid}
              now={now}
              onCancel={(id) => void cancel(id)}
              cancelling={cancelling === booking.id}
              onRead={read}
              speaking={speakingId === booking.id}
            />
          ))}
        </div>
      ) : null}

      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        Sessions happen by video inside Talk. We will tell you when that is
        ready — until then, use the conversation.
      </p>
    </div>
  );
}
