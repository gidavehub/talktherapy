"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useAuth } from "../AuthProvider";
import { EmptyState, Spinner } from "../ui/Feedback";
import { IconChat } from "../ui/icons";
import Composer from "./Composer";
import DateSeparator, { startsNewDay } from "./DateSeparator";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import { useChatPeer } from "./useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import type { VoiceRecording } from "./useVoiceRecorder";
import { useReadAloud } from "../../lib/useReadAloud";
import {
  clearTyping,
  markRead,
  nameOf,
  otherParticipant,
  sendImage,
  sendText,
  sendVoiceNote,
  setTyping,
  unreadFor,
  watchChat,
  watchMessages,
  watchTyping,
  type ChatTarget,
} from "../../lib/chat";
import type { Chat, ChatMessage } from "../../lib/models";

/**
 * The thread.
 *
 * Fills the viewport with the composer pinned to the bottom, which is the one
 * layout people already know from every messaging app. The height is computed
 * rather than set to 100dvh because this sits inside AppShell, which has its
 * own chrome above and below:
 *
 *   mobile — 64px sticky top bar + 24px pt-6 + 112px pb-28  = 200px
 *   desktop — no top bar in flow + 40px pt-10 + 64px pb-16  = 104px
 *
 * Those numbers come straight from AppShell's content wrapper. If that padding
 * changes, this has to change with it — hence spelling out the arithmetic
 * instead of leaving two magic numbers behind.
 *
 * Read-aloud is wired to every bubble. The language is the one the person
 * chose when they talked to Talk (`profile.intake.language`), not a guess from
 * the browser locale.
 */
export default function ChatThread({ chatId }: { chatId: string }) {
  const { user, profile, role } = useAuth();
  const isProvider = role === "provider";
  const uid = user?.uid ?? null;

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [typingUids, setTypingUids] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /**
   * Whether the view is parked at the bottom. A new message should follow the
   * conversation down, but not while someone is reading back through history —
   * yanking them to the bottom mid-sentence is the single most irritating bug
   * a chat can have.
   */
  const atBottomRef = useRef(true);

  const { read, speakingId } = useReadAloud(profile?.intake?.language ?? null);

  const peerUid = chat && uid ? otherParticipant(chat, uid) : null;
  // The name stored on the chat is the fallback, not the first choice: a live
  // read of the provider directory reflects a name that has since changed. It
  // is also the only name the provider side has for a patient.
  const peer = useChatPeer(
    peerUid,
    (chat && nameOf(chat, peerUid)) ||
      (isProvider ? "Someone you are working with" : "Your provider"),
  );

  useEffect(() => watchChat(chatId, setChat), [chatId]);
  useEffect(() => watchMessages(chatId, setMessages), [chatId]);

  useEffect(() => {
    if (!uid) return;
    return watchTyping(chatId, uid, setTypingUids);
  }, [chatId, uid]);

  /**
   * Mark the thread read whenever new messages land — but only while the tab
   * is actually visible. A background tab racking up read receipts tells the
   * other person their message was read by someone who never saw it.
   */
  useEffect(() => {
    if (!uid || !messages || !chat) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void markRead(chatId, uid, messages, unreadFor(chat, uid));
  }, [chat, chatId, messages, uid]);

  // Follow the conversation down, unless the reader has scrolled away.
  useEffect(() => {
    if (!messages) return;
    if (!atBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, typingUids]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    // 64px of slack: "near the bottom" should still count as following along.
    atBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 64;
  }, []);

  const target: ChatTarget | null = useMemo(
    () =>
      chat && uid
        ? { chatId, senderId: uid, participants: chat.participants }
        : null,
    [chat, chatId, uid],
  );

  // Any send puts the view back at the bottom: you always want to see your own
  // message land, wherever you happened to be scrolled to.
  const followOwnMessage = useCallback(() => {
    atBottomRef.current = true;
  }, []);

  const handleSendText = useCallback(
    async (text: string) => {
      if (!target) return;
      followOwnMessage();
      await sendText(target, text);
    },
    [followOwnMessage, target],
  );

  const handleSendVoice = useCallback(
    async (recording: VoiceRecording) => {
      if (!target) return;
      followOwnMessage();
      await sendVoiceNote(target, recording.blob, recording.durationSec);
    },
    [followOwnMessage, target],
  );

  const handleSendImage = useCallback(
    async (file: File) => {
      if (!target) return;
      followOwnMessage();
      await sendImage(target, file);
    },
    [followOwnMessage, target],
  );

  const handleTyping = useCallback(() => {
    if (!uid) return;
    void setTyping(chatId, uid);
  }, [chatId, uid]);

  // Leaving the thread with "typing…" still showing would strand the other
  // person waiting for a message that is not coming.
  useEffect(() => {
    if (!uid) return;
    return () => {
      void clearTyping(chatId, uid);
    };
  }, [chatId, uid]);

  const loading = messages === null || chat === null;
  const isGroup = (chat?.participants.length ?? 0) > 2;

  return (
    <div className="flex flex-col h-[calc(100dvh-200px)] md:h-[calc(100dvh-104px)] min-h-[420px] -mx-1 sm:mx-0 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-white/70 px-3 py-2.5 backdrop-blur-md">
        <Link
          href="/chats"
          aria-label="Back to all conversations"
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>

        <ProviderAvatar photoPath={peer.photoPath} name={peer.name} size={38} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-tight">
            {isGroup ? "Group conversation" : peer.name}
          </p>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {typingUids.length > 0
              ? "Typing"
              : isGroup
                ? `${chat?.participants.length} people`
                : isProvider
                  ? "In your care"
                  : "Provider"}
          </p>
        </div>
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-[var(--muted)]">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<IconChat />}
            title="Say hello"
            description="Write a message, or hold the microphone and speak — whichever is easier. Anything you send here stays between the two of you."
            className="border-0"
          />
        ) : (
          <div className="space-y-1.5">
            {messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const mine = message.senderId === uid;

              return (
                <div key={message.id}>
                  {startsNewDay(message.createdAt, previous?.createdAt ?? null) ? (
                    <DateSeparator timestamp={message.createdAt} />
                  ) : null}
                  <MessageBubble
                    message={message}
                    mine={mine}
                    // Only worth naming in a group — in a 1:1 the alignment
                    // already says who spoke.
                    senderName={isGroup && !mine ? peer.name : null}
                    onRead={read}
                    speaking={speakingId === message.id}
                  />
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {typingUids.length > 0 ? (
            <div className="pt-1.5">
              <TypingIndicator name={peer.name} />
            </div>
          ) : null}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      <Composer
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
        onSendImage={handleSendImage}
        onTyping={handleTyping}
        disabled={!target}
      />
    </div>
  );
}
