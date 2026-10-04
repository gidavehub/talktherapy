"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { IconChat, IconVideo } from "../ui/icons";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
import { useNow } from "../../lib/useNow";
import { nameOf, otherParticipant, unreadFor, watchChats } from "../../lib/chat";
import { spokenSlot, watchMyBookings } from "../../lib/booking";
import { joinWindow } from "../../lib/call";
import type { Booking, Chat } from "../../lib/models";

/**
 * The two things a returning person opens Talk for: did they write back, and
 * when am I seeing them.
 *
 * Both were missing from home entirely — the page led with providers, which is
 * right for somebody's first visit and wrong for every visit after they have
 * found one. Mood and journal stay on the page, below this: they are useful,
 * but they are not what anyone came for.
 *
 * Renders NOTHING until there is something to say. Somebody who has not yet
 * started a conversation should see providers and a check-in, not two empty
 * boxes explaining what they have not done.
 */

function MessagesCard({ chat, selfUid, unread }: { chat: Chat; selfUid: string; unread: number }) {
  const peerUid = otherParticipant(chat, selfUid);
  const peer = useChatPeer(peerUid, nameOf(chat, peerUid) || "Your provider");

  return (
    <Link
      href={`/chats/${chat.id}`}
      className="group flex items-center gap-3.5 rounded-[22px] bg-white px-4 py-4 hover:bg-black/[.02] transition-colors"
    >
      <span
        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${
          unread > 0 ? "bg-[var(--accent)] text-white" : "bg-[var(--background)] text-[var(--muted)]"
        }`}
      >
        <IconChat size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {unread > 0 ? `${unread} new` : "Conversation"}
        </span>
        <span className="mt-0.5 block truncate text-[14.5px] font-medium leading-tight">
          {peer.name}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--muted)]">
          {chat.lastMessage || "No messages yet"}
        </span>
      </span>
    </Link>
  );
}

function SessionCard({ booking, selfUid, now }: { booking: Booking; selfUid: string; now: number }) {
  const otherUid = booking.participants.find((uid) => uid !== selfUid) ?? null;
  const peer = useChatPeer(otherUid, "Your provider");
  const open = joinWindow(booking.startsAt, booking.endsAt, now);

  return (
    <div className="rounded-[22px] bg-white px-4 py-4">
      <div className="flex items-center gap-3.5">
        <span
          className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${
            open ? "bg-[var(--accent)] text-white" : "bg-[var(--background)] text-[var(--muted)]"
          }`}
        >
          <IconVideo size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {open ? "Now" : "Next session"}
          </p>
          <p className="mt-0.5 truncate text-[14.5px] font-medium leading-tight">{peer.name}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--muted)] leading-snug">
            {spokenSlot(booking.startsAt, booking.endsAt)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {open ? (
          <Link
            href={`/call/${booking.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[12.5px] text-white hover:bg-[var(--accent-soft)] transition-colors"
          >
            <IconVideo size={14} />
            Join
          </Link>
        ) : null}
        <Link
          href="/sessions"
          className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
        >
          All sessions
        </Link>
      </div>
    </div>
  );
}

export default function HomeActivity() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useNow(60_000);

  const [chats, setChats] = useState<Chat[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!uid) return;
    return watchChats(uid, setChats, 10);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return watchMyBookings(uid, setBookings, 10);
  }, [uid]);

  if (!uid) return null;

  // The conversation with something waiting in it, or failing that the most
  // recent one. Only ever one on this page — the full list is a tap away.
  const withUnread = chats.find((chat) => unreadFor(chat, uid) > 0);
  const chat = withUnread ?? chats[0] ?? null;

  const next =
    bookings.find((b) => b.status !== "cancelled" && b.endsAt >= now) ?? null;

  if (!chat && !next) return null;

  return (
    <motion.section
      initial={{ y: 18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      aria-label="What is happening"
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      {chat ? (
        <MessagesCard chat={chat} selfUid={uid} unread={unreadFor(chat, uid)} />
      ) : null}
      {next ? <SessionCard booking={next} selfUid={uid} now={now} /> : null}
    </motion.section>
  );
}
