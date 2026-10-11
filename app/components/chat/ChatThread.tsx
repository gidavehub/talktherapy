"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import { EmptyState, Skeleton } from "../ui/Feedback";
import { IconChat } from "../ui/icons";
import MinorFlag from "../ui/MinorFlag";
import { useOpenMenu } from "../ui/AppShell";
import Composer from "./Composer";
import DateSeparator, { startsNewDay } from "./DateSeparator";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import { useChatPeer } from "./useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import CallButton from "./CallButton";
import GroupCallButton from "./GroupCallButton";
import GroupInfo from "./GroupInfo";
import type { VoiceRecording } from "./useVoiceRecorder";
import { useReadAloud } from "../../lib/useReadAloud";
import {
  clearTyping,
  markRead,
  groupTitle,
  isGroupChat,
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
 * The thread, laid out as WhatsApp lays one out — the layout people already
 * know from every messaging app.
 *
 * It fills its pane (ChatsSplit): on a phone that is the whole screen. The
 * header is the top bar — back to the list, who it is, call, and the app's
 * menu — and the composer is the bottom bar; AppShell draws neither of its
 * own bars over a conversation. On a computer the list sits to the left, so
 * there is no back button, and the app's rail holds the menu.
 *
 * Read-aloud is wired to every bubble. The language is the one the person
 * chose when they talked to Talk (`profile.intake.language`), not a guess from
 * the browser locale.
 */
export default function ChatThread({ chatId }: { chatId: string }) {
  const { user, profile, role } = useAuth();
  const openMenu = useOpenMenu();
  const isProvider = role === "provider";
  const uid = user?.uid ?? null;

  /** Undefined while loading; null when it is not yours to read (left, taken out, or never in it). */
  const [chat, setChat] = useState<Chat | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

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

  const loading = messages === null || chat === undefined;
  // By the group having been set up as one, not by head count: a group
  // somebody has left can be down to two and is still a group.
  const isGroup = chat ? isGroupChat(chat) : false;

  // Refused, not loading: somebody who has left a group, been taken out of
  // one while reading it, or followed a link to a conversation that is not
  // theirs. Say so — an endless skeleton under a header pretending to be a
  // two-person chat is the worst possible answer to "where did my group go".
  const back = (
    <Link
      href="/chats"
      aria-label="Back to all conversations"
      className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[var(--foreground)] hover:bg-black/5 transition-colors md:hidden"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
    </Link>
  );

  // The app's menu, in the top bar a conversation draws for itself on a phone.
  const menu = (
    <button
      type="button"
      aria-label="Menu"
      onClick={openMenu}
      className="h-10 w-10 shrink-0 rounded-full bg-[var(--dark)] text-white flex items-center justify-center md:hidden"
    >
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
        <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
        <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
        <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
      </svg>
    </button>
  );

  const bar = "flex h-16 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 md:px-4";

  if (chat === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--background)]">
        <div className={bar}>
          {back}
          <p className="flex-1 truncate text-[15px] font-medium">Conversation</p>
          {menu}
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
      <EmptyState
        icon={<IconChat />}
        title="You are not in this conversation any more"
        description="You may have left this group, or been taken out of it. Nothing said in it from now on will reach you."
        action={
          <Link
            href="/chats"
            className="inline-flex h-10 items-center rounded-full bg-[var(--dark)] px-5 text-[12.5px] text-white"
          >
            Your conversations
          </Link>
        }
      />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SPRING_SOFT}
      className="flex min-h-0 flex-1 flex-col bg-[var(--background)]"
    >
      {/* Top bar */}
      <div className={bar}>
        {back}

        <ProviderAvatar photoPath={peer.photoPath} name={peer.name} size={40} />

        <div className="min-w-0 flex-1">
          {isGroup && chat ? (
            // The group's name opens who is in it — and the ways out.
            <button
              type="button"
              onClick={() => setGroupInfoOpen(true)}
              aria-label={`${groupTitle(chat)}: who is in the group`}
              className="block max-w-full truncate text-left text-[14px] font-medium leading-tight hover:underline underline-offset-2"
            >
              {groupTitle(chat)}
            </button>
          ) : (
            <p className="truncate text-[14px] font-medium leading-tight">{peer.name}</p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {typingUids.length > 0
                ? "Typing"
                : isGroup
                  ? `${chat?.participants.length} people`
                  : isProvider
                    ? "In your care"
                    : "Provider"}
            </p>
            {/* Beside the name, where it cannot be scrolled past. Provider
                side only: nobody needs to be labelled to themselves. */}
            {isProvider && !isGroup && chat?.minor ? <MinorFlag size="row" className="text-[11px]" /> : null}
          </div>
        </div>

        {uid && peerUid && !isGroup ? (
          <CallButton selfUid={uid} peerUid={peerUid} canBook={!isProvider} />
        ) : null}
        {uid && isGroup && chat ? <GroupCallButton chat={chat} selfUid={uid} /> : null}
        {uid && isGroup && chat ? (
          <GroupInfo chat={chat} selfUid={uid} open={groupInfoOpen} onClose={() => setGroupInfoOpen(false)} />
        ) : null}
        {menu}
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 md:px-[5%]"
      >
        {loading ? (
          <div role="status" aria-label="Loading the conversation" aria-busy="true" className="space-y-2.5">
            {[
              ["justify-start", "w-[58%]"],
              ["justify-end", "w-[44%]"],
              ["justify-start", "w-[66%]"],
              ["justify-end", "w-[38%]"],
            ].map(([side, width], i) => (
              <div key={i} className={`flex ${side}`}>
                <Skeleton rounded="rounded-[22px]" className={`h-11 ${width}`} />
              </div>
            ))}
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
                    senderName={
                      isGroup && !mine
                        ? (chat?.names[message.senderId] ?? "Someone in the group")
                        : null
                    }
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
    </motion.div>
  );
}
