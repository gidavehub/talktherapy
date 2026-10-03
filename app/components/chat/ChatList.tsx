"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import { Avatar, EmptyState, Spinner } from "../ui/Feedback";
import { IconChat, IconSpeaker } from "../ui/icons";
import Button from "../ui/Button";
import { useChatPeer } from "./useChatPeer";
import { useReadAloud } from "../../lib/useReadAloud";
import { nameOf, otherParticipant, unreadFor, watchChats } from "../../lib/chat";
import type { Chat } from "../../lib/models";

/**
 * Every conversation this person has, newest first.
 *
 * Each row is a link, a name, a preview and an unread count — all of it from
 * the chat document, with no message reads at all. That is what the
 * denormalised `lastMessage` / `unread` fields on the chat are for.
 *
 * Rows carry a speaker button too, not just the thread: someone who cannot
 * read the preview cannot tell which conversation to open, which would make
 * the read-aloud inside the thread useless to them.
 */

/** Short relative time. "14:32" today, "Yesterday", then the date. */
function whenLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ChatRow({
  chat,
  selfUid,
  index,
  onRead,
  speaking,
}: {
  chat: Chat;
  selfUid: string;
  index: number;
  onRead: (id: string, text: string) => void;
  speaking: boolean;
}) {
  const peerUid = otherParticipant(chat, selfUid);
  const isGroup = chat.participants.length > 2;
  const peer = useChatPeer(peerUid, nameOf(chat, peerUid) || "Your provider");
  const name = isGroup ? "Group conversation" : peer.name;
  const unread = unreadFor(chat, selfUid);

  const preview = chat.lastMessage || "No messages yet";

  return (
    <motion.div
      initial={{ y: 18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING_SOFT, delay: Math.min(index * 0.04, 0.24) }}
      className="flex items-center gap-1"
    >
      <Link
        href={`/chats/${chat.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5 transition-colors hover:bg-black/[.02]"
      >
        <Avatar name={name} size={46} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[15px] font-medium leading-tight">{name}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
              {chat.lastMessageAt ? whenLabel(chat.lastMessageAt) : ""}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p
              className={`truncate text-[13px] leading-snug ${
                unread > 0 ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {preview}
            </p>
            {unread > 0 ? (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] text-white tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <motion.button
        type="button"
        // Reads the name and the preview together, because either alone leaves
        // out the half you need to decide whether to open it.
        onClick={() => onRead(chat.id, `${name}. ${preview}`)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={SPRING_SNAP}
        aria-label={speaking ? "Stop reading aloud" : `Read this conversation aloud`}
        aria-pressed={speaking}
        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          speaking
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)]"
        }`}
      >
        <IconSpeaker size={16} />
      </motion.button>
    </motion.div>
  );
}

export default function ChatList() {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const { read, speakingId } = useReadAloud(profile?.intake?.language ?? null);

  useEffect(() => {
    if (!user) return;
    return watchChats(user.uid, setChats);
  }, [user]);

  if (!user || chats === null) {
    return (
      <div className="flex justify-center py-16 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={<IconChat />}
        title="No conversations yet"
        description="When you find a provider who fits you, open their profile and tap Message. You can write to them, or send a voice note if that is easier."
        action={<Button href="/matches">See providers for you</Button>}
      />
    );
  }

  return (
    <div className="space-y-2">
      {chats.map((chat, index) => (
        <ChatRow
          key={chat.id}
          chat={chat}
          selfUid={user.uid}
          index={index}
          onRead={read}
          speaking={speakingId === chat.id}
        />
      ))}
    </div>
  );
}
