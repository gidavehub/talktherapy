"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconCalendar, IconVideo } from "../ui/icons";
import { useNow } from "../../lib/useNow";
import { joinWindow } from "../../lib/call";
import { timeLabel, watchMyBookings } from "../../lib/booking";
import type { Booking } from "../../lib/models";

/**
 * The call control in a conversation's header — where anyone who has used
 * WhatsApp will look for it.
 *
 * A call here belongs to a SESSION. The call room's id is the booking's id,
 * and firestore.rules checks the room's participants against that booking:
 * that is what stops a stranger squatting on somebody's call, and what stops
 * a call happening without the session it is part of having been booked. So
 * this does one of three honest things rather than pretending every chat can
 * ring:
 *
 *   - a session with this person is open now        → Join, in the accent colour
 *   - one is coming up                               → its time, linking to Sessions
 *   - none, and you are the one who books            → Book, to their free times
 *
 * A provider with nothing booked sees nothing at all. They cannot book on a
 * client's behalf, and a control that only explains why it is useless is
 * clutter in the one place they look most.
 */
export default function CallButton({
  selfUid,
  peerUid,
  canBook,
}: {
  selfUid: string;
  peerUid: string;
  /** True for the patient side — the one who books a provider's time. */
  canBook: boolean;
}) {
  const now = useNow(30_000);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => watchMyBookings(selfUid, setBookings, 25), [selfUid]);

  const next =
    bookings.find(
      (b) => b.participants.includes(peerUid) && b.status !== "cancelled" && b.endsAt >= now,
    ) ?? null;

  if (next && joinWindow(next.startsAt, next.endsAt, now)) {
    return (
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SNAP}>
        <Link
          href={`/call/${next.id}`}
          aria-label="Join your session now"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white shadow-[var(--shadow-accent)] hover:bg-[var(--accent-soft)] transition-colors"
        >
          <IconVideo size={15} />
          Join
        </Link>
      </motion.div>
    );
  }

  if (next) {
    return (
      <Link
        href="/sessions"
        aria-label={`Your next session is at ${timeLabel(next.startsAt)}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] tabular-nums text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
      >
        <IconVideo size={14} />
        {timeLabel(next.startsAt)}
      </Link>
    );
  }

  if (!canBook) return null;

  return (
    <Link
      href={`/book/${peerUid}`}
      aria-label="Book a session to call"
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
    >
      <IconCalendar size={14} />
      Book
    </Link>
  );
}
