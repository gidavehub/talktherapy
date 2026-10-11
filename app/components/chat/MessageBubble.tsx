"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconAlert, IconImage, IconRetry, IconSpeaker } from "../ui/icons";
import { Spinner } from "../ui/Feedback";
import MessageTicks from "./MessageTicks";
import VoiceNotePlayer, { type UploadState } from "./VoiceNotePlayer";
import { chatMediaUrl } from "../../lib/chat";
import type { ChatMessage } from "../../lib/models";

/**
 * One message.
 *
 * Own messages are near-black and right-aligned; incoming are white cards on
 * the bone background. The accent orange is NOT used for the bubble fill — it
 * is the product's call-to-action colour, and a thread of forty orange blocks
 * would both shout and leave nothing to mark the send button with. The accent
 * appears here only on the read ticks and on a bubble being read aloud.
 *
 * The squared-off bottom corner on the sender's side is what gives the bubble
 * its direction without drawing a tail.
 *
 * Every bubble carries a speaker button. Many of the people this is built for
 * cannot read comfortably, so hearing a message is not an accessibility
 * afterthought — it is a primary way to use the thread, and it has to be on
 * every message rather than behind a long-press nobody will discover.
 *
 * A photo or voice note still on its way carries `upload`: its progress, or —
 * if it did not go — a red "Not sent" with Retry and Delete. Nothing a person
 * sent ever just disappears.
 */

/** A sending photo or voice note, as the thread tracks it. */
export type Upload = UploadState & { error: string | null; onDiscard: () => void };

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A photo in a bubble.
 *
 * Loaded through the same authenticated `getBlob()` path as voice notes, so a
 * chat image is never reachable by URL alone.
 */
function ChatImage({ mediaPath, upload }: { mediaPath: string; upload?: Upload | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    chatMediaUrl(mediaPath)
      .then((next) => {
        if (revoked) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => setFailed(true));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaPath]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-[12px] opacity-70">
        <IconImage size={14} />
        Could not load this photo
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center justify-center py-10 opacity-60">
        <Spinner size={18} />
      </div>
    );
  }

  const sending = upload && !upload.failed && upload.progress < 1;
  return (
    <div className="relative">
      {/*
        A plain <img>, not next/image. The optimiser runs on the server and
        fetches `src` itself; a blob: URL exists only in this tab's memory, so
        there is nothing for it to fetch.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Photo sent in this conversation"
        className={`block max-h-[320px] w-full rounded-[14px] object-cover transition-[filter] duration-300 ${sending || upload?.failed ? "brightness-75" : ""}`}
      />
      {sending ? (
        <div className="absolute inset-0 flex items-center justify-center" role="progressbar" aria-label="Sending" aria-valuenow={Math.round(upload.progress * 100)}>
          <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
            <circle cx="26" cy="26" r="22" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <motion.circle
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 22}
              animate={{ strokeDashoffset: 2 * Math.PI * 22 * (1 - Math.max(0.06, upload.progress)) }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </svg>
        </div>
      ) : upload?.failed ? (
        <button
          type="button"
          onClick={upload.onRetry}
          aria-label="Not sent. Send again"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger)] text-white">
            <IconRetry size={20} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

export default function MessageBubble({
  message,
  mine,
  /** Shown above the bubble in a group thread; null in 1:1, where it is noise. */
  senderName,
  onRead,
  speaking,
  upload = null,
  animateIn = true,
}: {
  message: ChatMessage;
  mine: boolean;
  senderName?: string | null;
  /** Read this message aloud. Wired to useReadAloud in the thread. */
  onRead: (id: string, text: string) => void;
  speaking: boolean;
  /** Still being sent from this device. */
  upload?: Upload | null;
  /** Slide in — for a message that arrives while the thread is open, not for history. */
  animateIn?: boolean;
}) {
  // A voice note with no transcript has nothing to say out loud that the audio
  // does not already say, so the speaker button would be a dead control.
  const spokenText = message.kind === "voice" ? message.transcript : message.text;
  const canRead = Boolean(spokenText && spokenText.trim());

  const onDark = mine;

  return (
    <motion.div
      initial={animateIn ? { y: 14, opacity: 0, scale: 0.96 } : false}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
      style={{ transformOrigin: mine ? "bottom right" : "bottom left" }}
      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
    >
      <div
        className={`flex max-w-[86%] sm:max-w-[72%] items-end gap-1.5 ${
          mine ? "flex-row-reverse" : "flex-row"
        }`}
      >
        <div
          className={`min-w-0 px-3.5 py-2.5 ${
            mine
              ? "rounded-[22px] rounded-br-[8px] bg-[var(--dark)] text-white"
              : "rounded-[22px] rounded-bl-[8px] bg-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.2)]"
          } ${
            // A ring rather than a different fill: the bubble keeps its
            // identity while it is speaking.
            speaking ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]" : ""
          }`}
        >
          {senderName ? (
            <p
              className={`mb-1 text-[11px] uppercase tracking-[0.14em] ${
                onDark ? "text-white/60" : "text-[var(--accent)]"
              }`}
            >
              {senderName}
            </p>
          ) : null}

          {message.kind === "voice" && message.mediaPath ? (
            <div className="w-[210px] sm:w-[240px] py-0.5">
              <VoiceNotePlayer
                messageId={message.id}
                mediaPath={message.mediaPath}
                durationSec={message.durationSec}
                waveform={message.waveform}
                onDark={onDark}
                upload={upload}
              />
              {message.transcript ? (
                <p
                  className={`mt-1.5 text-[13px] leading-relaxed ${
                    onDark ? "text-white/80" : "text-[var(--muted)]"
                  }`}
                >
                  {message.transcript}
                </p>
              ) : null}
            </div>
          ) : null}

          {message.kind === "image" && message.mediaPath ? (
            <div className="w-[220px] sm:w-[260px] py-0.5">
              <ChatImage mediaPath={message.mediaPath} upload={upload} />
            </div>
          ) : null}

          {message.kind === "text" ? (
            // whitespace-pre-line keeps the line breaks someone typed;
            // break-words stops a pasted URL widening the whole thread.
            <p className="text-[14.5px] leading-relaxed whitespace-pre-line break-words">
              {message.text}
            </p>
          ) : null}

          {message.kind === "file" ? (
            <p className="text-[14px] leading-relaxed">{message.text || "File"}</p>
          ) : null}

          <div
            className={`mt-1 flex items-center gap-1.5 ${
              mine ? "justify-end" : "justify-start"
            }`}
          >
            <span
              className={`text-[10.5px] tabular-nums ${
                onDark ? "text-white/55" : "text-[var(--muted)]"
              }`}
            >
              {timeLabel(message.createdAt)}
            </span>
            {mine ? <MessageTicks message={message} onDark={onDark} /> : null}
          </div>
        </div>

        {canRead ? (
          <motion.button
            type="button"
            onClick={() => onRead(message.id, spokenText as string)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAP}
            aria-label={speaking ? "Stop reading aloud" : "Read this message aloud"}
            aria-pressed={speaking}
            className={`mb-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
              speaking
                ? "bg-[var(--accent)] text-white"
                : "bg-white text-[var(--muted)] shadow-[0_6px_16px_-10px_rgba(0,0,0,0.3)] hover:text-[var(--foreground)]"
            }`}
          >
            <IconSpeaker size={14} />
          </motion.button>
        ) : null}
      </div>

      {upload?.failed ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 flex items-center gap-3 px-1 text-[12px]"
        >
          <span className="inline-flex items-center gap-1 text-[var(--danger)]">
            <IconAlert size={12} /> Not sent{upload.error ? ` · ${upload.error}` : ""}
          </span>
          <button type="button" onClick={upload.onRetry} className="font-medium text-[var(--foreground)] underline underline-offset-2">
            Retry
          </button>
          <button type="button" onClick={upload.onDiscard} className="text-[var(--muted)] underline underline-offset-2">
            Delete
          </button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
