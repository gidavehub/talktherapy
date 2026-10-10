"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Alert, EmptyState, Skeleton, SkeletonList } from "../ui/Feedback";
import { IconCalendar, IconChat, IconSpeaker, IconVideo } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import MeetLink from "./MeetLink";
import MinorFlag from "../ui/MinorFlag";
import { useReadAloud } from "../../lib/useReadAloud";
import { directChatId } from "../../lib/chat";
import { formatDalasi } from "../../lib/money";
import { cancelBooking, spokenSlot, startSessionPayment, watchMyBookings } from "../../lib/booking";
import { useNow } from "../../lib/useNow";
import { joinWindow } from "../../lib/call";
import { reportMissedSession } from "../../lib/payouts-client";
import { PAYOUT_HOLD_MS } from "../../lib/payouts";
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
  onPay,
  paying,
  onRead,
  speaking,
}: {
  booking: Booking;
  selfUid: string;
  /** Passed down rather than read here, so every row agrees on the time. */
  now: number;
  onCancel: (id: string) => void;
  cancelling: boolean;
  onPay: (id: string) => void;
  paying: boolean;
  onRead: (id: string, text: string) => void;
  speaking: boolean;
}) {
  const otherUid = booking.participants.find((uid) => uid !== selfUid) ?? null;
  const peer = useChatPeer(otherUid, "The other person");
  const past = booking.endsAt < now;
  const cancelled = booking.status === "cancelled";

  // Read from the booking, which the server stamped — on the provider's
  // screen the signed-in profile is the provider's own, not the patient's.
  const minor = booking.patientMinor && booking.providerId === selfUid;
  const line = `${when(booking)} with ${peer.name}${minor ? ", who is under 18" : ""}`;

  return (
    <motion.div
      initial={{ y: 14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className={`rounded-[22px] bg-white px-4 py-3.5 ${cancelled || past ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3.5">
        <ProviderAvatar photoPath={peer.photoPath} name={peer.name} size={44} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium leading-tight">{peer.name}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--muted)] leading-snug">
            {when(booking)}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {minor ? <MinorFlag size="row" /> : null}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* The way into the session itself, and only when it is nearly
              time — a join button on a session three weeks away is a button
              that does nothing, and the one thing somebody must not have to
              hunt for is the call they are already late for. */}
          {joinWindow(booking.startsAt, booking.endsAt, now) ? (
            <Link
              href={`/call/${booking.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[12.5px] text-white hover:bg-[var(--accent-soft)] transition-colors"
            >
              <IconVideo size={14} />
              Join
            </Link>
          ) : null}
          {/* Unpaid, and only on the patient's side — the person who owes the
              fee is the one who booked. A provider should never be shown a
              button asking them to pay for their own session. */}
          {booking.paymentStatus === "unpaid" &&
          booking.amountMinor > 0 &&
          booking.patientId === selfUid ? (
            <button
              type="button"
              onClick={() => onPay(booking.id)}
              disabled={paying}
              className="rounded-full bg-[var(--dark)] px-4 py-2 text-[12.5px] text-white hover:bg-[var(--dark-soft)] transition-colors disabled:opacity-60"
            >
              {paying ? "Opening…" : `Pay ${formatDalasi(booking.amountMinor)}`}
            </button>
          ) : null}
          {otherUid ? (
            <Link
              href={`/chats/${directChatId(selfUid, otherUid)}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--background)] px-4 py-2 text-[12.5px] hover:bg-black/[.06] transition-colors"
            >
              <IconChat size={14} />
              Message
            </Link>
          ) : null}
          <MeetLink
            bookingId={booking.id}
            meetUrl={booking.meetUrl}
            canEdit={booking.providerId === selfUid}
          />
          {/* Not once a paid session has begun: that is the provider's work,
              and the server refuses it. If it did not happen, the patient
              says so afterwards (below). */}
          {booking.paymentStatus === "paid" && booking.startsAt <= now ? null : (
            <button
              type="button"
              onClick={() => onCancel(booking.id)}
              disabled={cancelling}
              className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      ) : null}

      {/* A paid session that did not happen. For a day after it ends — the
          time the provider's fee is held — the patient can say so, and the
          fee waits for a person instead of being paid out. */}
      {!cancelled && past && booking.patientId === selfUid && booking.paymentStatus === "paid" ? (
        <MissedSession booking={booking} now={now} />
      ) : null}

      {/*
        Wave works — through mobile money on the payment page — but nothing
        here said so, and Wave is what most people in The Gambia pay with.
        Somebody deciding whether they CAN pay should not have to tap through
        to find out.
      */}
      {!cancelled && !past && booking.paymentStatus === "unpaid" && booking.amountMinor > 0 && booking.patientId === selfUid ? (
        <p className="mt-2.5 text-[11.5px] text-[var(--muted)] leading-relaxed">
          Pay with Wave, Afrimoney, QMoney or a card.
        </p>
      ) : null}
    </motion.div>
  );
}

function MissedSession({ booking, now }: { booking: Booking; now: number }) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (booking.disputed || sent) {
    return (
      <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
        You told us this session did not happen. A person from Talk is looking into it.
      </p>
    );
  }
  if (booking.payoutId || booking.endsAt + PAYOUT_HOLD_MS <= now) return null;

  return (
    <div className="mt-2.5 text-[12.5px]">
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--muted)]">Did the session not happen?</span>
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              setError(null);
              const result = await reportMissedSession(booking.id);
              setSending(false);
              if (result.ok) setSent(true);
              else setError(result.error);
            }}
            className="rounded-full bg-[var(--dark)] px-4 py-2 text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : "Yes, tell Talk"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3 py-2 text-[var(--muted)]">
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="rounded-full px-4 py-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
        >
          They didn&apos;t come
        </button>
      )}
      {error ? <p className="mt-1.5 text-[var(--accent)]">{error}</p> : null}
    </div>
  );
}

export default function SessionList() {
  const { user, profile, role } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { read, speakingId } = useReadAloud(profile?.intake?.language ?? null);
  const now = useNow();

  useEffect(() => {
    if (!user) return;
    return watchMyBookings(user.uid, setBookings);
  }, [user]);

  async function pay(id: string) {
    setPaying(id);
    setError(null);
    const result = await startSessionPayment(id);
    if (result.ok) {
      // The gateway's own page. Leaving Talk is unavoidable for a hosted
      // checkout; the return URL brings them back to this list.
      window.location.href = result.paymentLink;
      return;
    }
    setError(result.error);
    setPaying(null);
  }

  async function cancel(id: string) {
    setCancelling(id);
    setError(null);
    const result = await cancelBooking(id);
    if (!result.ok) setError(result.error ?? "Could not cancel that session.");
    setCancelling(null);
  }

  if (!user || bookings === null) {
    return (
      <SkeletonList count={3} label="Loading your sessions">
        <div className="rounded-[22px] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3.5">
            <Skeleton rounded="rounded-full" className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </div>
      </SkeletonList>
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
              onPay={(id) => void pay(id)}
              paying={paying === booking.id}
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
              onPay={(id) => void pay(id)}
              paying={paying === booking.id}
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
