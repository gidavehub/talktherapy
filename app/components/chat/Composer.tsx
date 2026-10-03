"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconImage, IconMic, IconSend, IconStop, IconTrash } from "../ui/icons";
import { Spinner } from "../ui/Feedback";
import { useVoiceRecorder, type VoiceRecording } from "./useVoiceRecorder";
import { formatDuration } from "../../lib/chat";

/**
 * The composer: type, record, or attach a photo.
 *
 * Recording is tap-to-start, tap-to-send — NOT press-and-hold. Hold-to-record
 * is a hidden gesture: there is nothing on screen that teaches it, it fails
 * whenever a finger slips on a cheap resistive screen, and it is unusable
 * one-handed while holding a baby or standing on a gele-gele. Since voice is a
 * primary way to use this product rather than a shortcut for power users, the
 * obvious control wins over the clever one.
 *
 * While recording, the text field is replaced rather than disabled, so the
 * only three things on screen are cancel, the elapsed time, and send.
 */

/** Rejected before upload — the Storage rule caps it too, but this explains why. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default function Composer({
  onSendText,
  onSendVoice,
  onSendImage,
  onTyping,
  disabled = false,
}: {
  onSendText: (text: string) => Promise<void>;
  onSendVoice: (recording: VoiceRecording) => Promise<void>;
  onSendImage: (file: File) => Promise<void>;
  /** Called as the person types. Throttling lives in the data layer. */
  onTyping: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorder = useVoiceRecorder();

  const recording = recorder.state === "recording" || recorder.state === "requesting";

  /**
   * Grow with the content up to a ceiling, then scroll. Done by measuring
   * rather than with rows, because a wrapped line still has to count.
   */
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [text]);

  /**
   * Begin recording, surfacing why if the microphone is unavailable — usually
   * a denied permission, which is something the person can actually fix.
   */
  const beginRecording = useCallback(async () => {
    setNotice(null);
    const result = await recorder.start();
    if (!result.ok) setNotice(result.reason);
  }, [recorder]);

  const submitText = useCallback(async () => {
    const value = text.trim();
    if (!value || busy) return;

    // Cleared optimistically: a composer that holds the text while the write
    // is in flight feels broken on a slow connection, and Firestore queues the
    // write offline anyway.
    setText("");
    setBusy(true);
    try {
      await onSendText(value);
    } catch {
      // Put it back rather than losing what they wrote.
      setText(value);
      setNotice("That did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, onSendText, text]);

  const finishRecording = useCallback(async () => {
    const result = await recorder.stop();
    if (!result) {
      setNotice("That was too short to send. Hold on a moment longer.");
      return;
    }

    setBusy(true);
    try {
      await onSendVoice(result);
    } catch {
      setNotice("The voice note did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }, [onSendVoice, recorder]);

  const pickImage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > MAX_IMAGE_BYTES) {
        setNotice("That photo is too large. Pick one under 8MB.");
        return;
      }

      setBusy(true);
      try {
        await onSendImage(file);
      } catch {
        setNotice("The photo did not send. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [onSendImage],
  );

  const canSendText = text.trim().length > 0;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <AnimatePresence>
        {notice ? (
          <motion.button
            type="button"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNotice(null)}
            className="mb-2 w-full rounded-2xl bg-[var(--accent)]/10 px-4 py-2.5 text-left text-[12.5px] leading-snug text-[var(--accent)]"
          >
            {notice}
          </motion.button>
        ) : null}
      </AnimatePresence>

      {recording ? (
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={recorder.cancel}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAP}
            aria-label="Discard this recording"
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-black/5 transition-colors"
          >
            <IconTrash size={18} />
          </motion.button>

          <div className="flex h-12 flex-1 items-center gap-3 rounded-full bg-white px-5">
            <motion.span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]"
              animate={{ opacity: [1, 0.25, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <span
              role="timer"
              aria-live="off"
              className="text-[14px] tabular-nums text-[var(--foreground)]"
            >
              {formatDuration(recorder.elapsedSec)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] truncate">
              {recorder.state === "requesting" ? "Starting" : "Recording"}
            </span>
          </div>

          <motion.button
            type="button"
            onClick={() => void finishRecording()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            transition={SPRING_SNAP}
            aria-label="Send this voice note"
            className="h-12 w-12 shrink-0 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)]"
          >
            {busy ? <Spinner size={16} /> : <IconStop size={16} />}
          </motion.button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void pickImage(event.target.files?.[0]);
              // Reset so picking the same file twice still fires a change.
              event.target.value = "";
            }}
          />

          <motion.button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || busy}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAP}
            aria-label="Send a photo"
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          >
            <IconImage size={19} />
          </motion.button>

          <div className="flex-1 min-w-0 rounded-[24px] bg-white px-4 py-[11px]">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                onTyping();
              }}
              onKeyDown={(event) => {
                // Enter sends on a physical keyboard; Shift+Enter breaks the
                // line. Left alone on touch, where Enter is the only newline
                // a soft keyboard offers.
                if (event.key === "Enter" && !event.shiftKey && !("ontouchstart" in window)) {
                  event.preventDefault();
                  void submitText();
                }
              }}
              rows={1}
              disabled={disabled}
              placeholder="Write a message"
              aria-label="Write a message"
              className="w-full resize-none bg-transparent text-[14.5px] leading-relaxed outline-none placeholder:text-[var(--muted)] disabled:opacity-60"
            />
          </div>

          {/*
            One slot, two controls: the mic becomes a send button the moment
            there is something to send. Keeping both visible at once invites
            the wrong tap, and the mic has to be the resting state because for
            many people it is the only one they will use.
          */}
          <motion.button
            type="button"
            onClick={() => (canSendText ? void submitText() : void beginRecording())}
            disabled={disabled || busy}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            transition={SPRING_SNAP}
            aria-label={canSendText ? "Send message" : "Record a voice note"}
            className="h-12 w-12 shrink-0 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)] disabled:opacity-60"
          >
            {busy ? (
              <Spinner size={16} />
            ) : canSendText ? (
              <IconSend size={18} />
            ) : (
              <IconMic size={18} />
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}
