"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import {
  IconCamera,
  IconChevronLeft,
  IconChevronUp,
  IconImage,
  IconLock,
  IconMic,
  IconPaperclip,
  IconPause,
  IconPlay,
  IconSend,
  IconTrash,
} from "../ui/icons";
import { Spinner } from "../ui/Feedback";
import { useVoiceRecorder, type VoiceRecording } from "./useVoiceRecorder";
import Waveform, { resample } from "./Waveform";
import { PhotoPreview, Webcam, compressPhoto, opensCameraItself } from "./PhotoTools";

/**
 * The composer — WhatsApp's, as closely as a web page can have it.
 *
 *   Write a message ·  📎  📷   (🎤)       the mic turns into send as you type
 *
 * Voice notes, both ways WhatsApp has:
 *   - HOLD the mic: it records while held. Release to send, slide left to
 *     bin it, slide up to lock it on and let go.
 *   - TAP the mic: it records hands-free straight away — the same as locked.
 *     A press-and-hold nobody has shown you is a hidden gesture, and voice is
 *     how many people here will use this; so the obvious tap works too.
 * Locked: a live waveform and the time; bin it, pause it (and listen back),
 * carry on, or send.
 *
 * Photos: 📎 offers Camera or Gallery; 📷 opens the camera at once. Every
 * photo is shown full screen before it goes, and squeezed small first.
 *
 * Sending is the thread's job: a voice note or photo appears in it at once,
 * with its progress, and says so if it did not go (ChatThread).
 */

/** Rejected before upload — the Storage rule caps it too, but this explains why. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** How far to slide left to bin a held recording. */
const CANCEL_PX = 110;
/** How far to slide up to lock it on. */
const LOCK_PX = 80;
/** Shorter than this, a press on the mic was a tap. */
const TAP_MS = 300;

type Mode = "idle" | "holding" | "locked";

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not on this device. Nothing depends on it.
  }
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The red dot, breathing while it records. */
function RecDot() {
  return (
    <motion.span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--danger)]"
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** One choice in the attach menu: a coloured circle, its name beneath. */
function AttachItem({
  label,
  tone,
  delay,
  onClick,
  children,
}: {
  label: string;
  tone: string;
  delay: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      role="menuitem"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SNAP, delay }}
      whileTap={{ scale: 0.92 }}
      className="flex flex-col items-center gap-2"
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${tone}`}>{children}</span>
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
    </motion.button>
  );
}

export default function Composer({
  onSendText,
  onSendVoice,
  onSendImage,
  onTyping,
  disabled = false,
}: {
  onSendText: (text: string) => Promise<void>;
  /** Hand-off: the thread shows it at once and sends it. */
  onSendVoice: (recording: VoiceRecording) => void;
  onSendImage: (photo: Blob) => void;
  /** Called as the person types. Throttling lives in the data layer. */
  onTyping: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>("idle");
  const [binned, setBinned] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [draftPlaying, setDraftPlaying] = useState(false);
  const [draftAt, setDraftAt] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const draftAudio = useRef<HTMLAudioElement | null>(null);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const modeRef = useRef<Mode>("idle");
  const binTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recorder = useVoiceRecorder();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const hintX = useTransform(dragX, (x) => x * 0.6);
  const hintOpacity = useTransform(dragX, [-CANCEL_PX, 0], [0.1, 1]);
  const lockY = useTransform(dragY, [-LOCK_PX, 0], [-18, 0]);

  const setMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  const canSendText = text.trim().length > 0;
  // The phone ended a recording (a call came in): it is kept, as a draft.
  const locked = mode === "locked" || recorder.state === "stopped";

  // Grow with the content up to a ceiling, then scroll.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [text]);

  useEffect(
    () => () => {
      if (binTimer.current) clearTimeout(binTimer.current);
    },
    [],
  );

  const springBack = useCallback(() => {
    void animate(dragX, 0, SPRING_SNAP);
    void animate(dragY, 0, SPRING_SNAP);
  }, [dragX, dragY]);

  // ------------------------------------------------------------------ text

  const submitText = useCallback(async () => {
    const value = text.trim();
    if (!value || busy) return;
    // Cleared optimistically: Firestore shows it at once and queues the write.
    setText("");
    setBusy(true);
    try {
      await onSendText(value);
    } catch {
      setText(value);
      setNotice("That did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, onSendText, text]);

  // ----------------------------------------------------------------- voice

  const beginRecording = useCallback(async () => {
    setNotice(null);
    const result = await recorder.start();
    if (!result.ok) {
      setMode("idle");
      setNotice(result.reason);
    }
  }, [recorder, setMode]);

  const stopDraft = () => {
    draftAudio.current?.pause();
    setDraftPlaying(false);
    setDraftAt(0);
  };

  const sendRecording = useCallback(async () => {
    stopDraft();
    const recording = await recorder.finish();
    setMode("idle");
    if (!recording) {
      setNotice("Hold on a moment longer — that was too short to send.");
      return;
    }
    vibrate(10);
    onSendVoice(recording);
  }, [onSendVoice, recorder, setMode]);

  const binRecording = useCallback(() => {
    gesture.current = null;
    stopDraft();
    recorder.cancel();
    setMode("idle");
    springBack();
    vibrate([8, 40, 8]);
    setBinned(true);
    if (binTimer.current) clearTimeout(binTimer.current);
    binTimer.current = setTimeout(() => setBinned(false), 750);
  }, [recorder, setMode, springBack]);

  const lockRecording = useCallback(() => {
    gesture.current = null;
    setMode("locked");
    springBack();
    vibrate(10);
  }, [setMode, springBack]);

  const onMicDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (canSendText || disabled || busy || modeRef.current !== "idle") return;
    event.preventDefault();
    try {
      // Keep receiving the finger's moves when it slides off the button.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not every browser lets it be captured; the hold still works in place.
    }
    gesture.current = { x: event.clientX, y: event.clientY, at: performance.now() };
    dragX.set(0);
    dragY.set(0);
    setAttachOpen(false);
    vibrate(12);
    setMode("holding");
    void beginRecording();
  };

  const onMicMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = gesture.current;
    if (!start || modeRef.current !== "holding") return;
    const dx = Math.min(0, event.clientX - start.x);
    const dy = Math.min(0, event.clientY - start.y);
    // One way at a time, as WhatsApp does: left to bin, or up to lock.
    if (Math.abs(dx) > Math.abs(dy)) {
      dragX.set(Math.max(dx, -CANCEL_PX - 20));
      dragY.set(0);
    } else {
      dragY.set(Math.max(dy, -LOCK_PX - 10));
      dragX.set(0);
    }
    if (dx < -CANCEL_PX) binRecording();
    else if (dy < -LOCK_PX) lockRecording();
  };

  const onMicUp = () => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || modeRef.current !== "holding") return;
    springBack();
    // A tap, or let go while the phone was still asking about the
    // microphone: record hands-free rather than send nothing.
    if (performance.now() - start.at < TAP_MS || recorder.state === "requesting") {
      lockRecording();
      return;
    }
    void sendRecording();
  };

  const onMainClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (canSendText) {
      void submitText();
      return;
    }
    // Enter or Space on the mic (no pointer): hands-free, as a tap is.
    if (event.detail === 0 && modeRef.current === "idle") {
      setMode("locked");
      void beginRecording();
    }
  };

  const toggleDraft = () => {
    const url = recorder.draftUrl;
    if (!url) return;
    let audio = draftAudio.current;
    if (!audio || audio.src !== url) {
      audio?.pause();
      audio = new Audio(url);
      audio.addEventListener("timeupdate", () => setDraftAt(audio?.currentTime ?? 0));
      audio.addEventListener("ended", () => {
        setDraftPlaying(false);
        setDraftAt(0);
      });
      draftAudio.current = audio;
    }
    if (audio.paused) {
      void audio.play().then(() => setDraftPlaying(true)).catch(() => setDraftPlaying(false));
    } else {
      audio.pause();
      setDraftPlaying(false);
    }
  };

  // ---------------------------------------------------------------- photos

  const takePhoto = () => {
    setAttachOpen(false);
    if (opensCameraItself()) cameraRef.current?.click();
    else setWebcamOpen(true);
  };

  const choosePhoto = () => {
    setAttachOpen(false);
    galleryRef.current?.click();
  };

  const preparePhoto = async (file: Blob | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("That is not a photo. Pick a picture to send.");
      return;
    }
    const small = await compressPhoto(file);
    if (small.size > MAX_IMAGE_BYTES) {
      setNotice("That photo is too large. Pick one under 8MB.");
      return;
    }
    setPhoto(small);
  };

  const onWebcamUnavailable = useCallback((reason: string) => {
    setWebcamOpen(false);
    setNotice(reason);
    galleryRef.current?.click();
  }, []);

  // ------------------------------------------------------------------ view

  const elapsed = clock(recorder.elapsedMs);
  const draftBars = resample(recorder.draftWaveform, 40);
  const draftProgress = recorder.elapsedMs > 0 ? Math.min(1, (draftAt * 1000) / recorder.elapsedMs) : 0;

  return (
    <div className="relative shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void preparePhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void preparePhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <AnimatePresence>
        {notice ? (
          <motion.button
            type="button"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING_SOFT}
            onClick={() => setNotice(null)}
            className="mb-2 w-full rounded-2xl bg-[var(--accent)]/10 px-4 py-2.5 text-left text-[12.5px] leading-snug text-[var(--accent)]"
          >
            {notice}
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Attach: Camera or Gallery, popping up from the paperclip. */}
      <AnimatePresence>
        {attachOpen ? (
          <>
            <div className="fixed inset-0 z-10" onPointerDown={() => setAttachOpen(false)} aria-hidden />
            <motion.div
              key="attach"
              role="menu"
              aria-label="Send a photo"
              initial={{ opacity: 0, scale: 0.85, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={SPRING_SNAP}
              style={{ transformOrigin: "bottom right" }}
              className="absolute bottom-full right-16 z-20 mb-2 flex gap-6 rounded-3xl bg-[var(--surface)] px-6 py-5 shadow-[var(--shadow-floating)]"
            >
              <AttachItem label="Camera" tone="bg-[var(--accent)]" delay={0} onClick={takePhoto}>
                <IconCamera size={22} />
              </AttachItem>
              <AttachItem label="Gallery" tone="bg-[#7C5CFC]" delay={0.04} onClick={choosePhoto}>
                <IconImage size={22} />
              </AttachItem>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {locked ? (
        // ---- locked on: waveform and time above; bin, pause, send below.
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SOFT}>
          <div className="flex h-12 items-center gap-3 rounded-full bg-[var(--background)] px-4">
            {recorder.state === "recording" || recorder.state === "requesting" ? (
              <>
                <RecDot />
                <span role="timer" className="w-10 shrink-0 text-[14px] tabular-nums">
                  {elapsed}
                </span>
                <div className="min-w-0 flex-1">
                  <Waveform
                    live
                    bars={recorder.levels.map((l) => l * 100)}
                    played="var(--foreground)"
                    unplayed="var(--foreground)"
                    height={26}
                  />
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleDraft}
                  aria-label={draftPlaying ? "Pause" : "Listen back"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-black/5"
                >
                  {draftPlaying ? <IconPause size={17} /> : <IconPlay size={17} />}
                </button>
                <div className="min-w-0 flex-1">
                  <Waveform
                    bars={draftBars}
                    progress={draftProgress}
                    played="var(--accent)"
                    unplayed="rgba(10,10,10,0.25)"
                    height={26}
                  />
                </div>
                <span className="shrink-0 text-[13px] tabular-nums text-[var(--muted)]">{elapsed}</span>
              </>
            )}
          </div>

          {recorder.interrupted ? (
            <p className="mt-1.5 px-3 text-[12px] text-[var(--muted)]">
              Your phone stopped the recording. Listen back, send it, or bin it.
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-between px-1">
            <motion.button
              type="button"
              onClick={binRecording}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_SNAP}
              aria-label="Bin this recording"
              className="flex h-12 w-12 items-center justify-center rounded-full text-[var(--muted)] hover:bg-black/5"
            >
              <IconTrash size={21} />
            </motion.button>

            {recorder.state === "recording" ? (
              <motion.button
                type="button"
                onClick={() => void recorder.pause()}
                whileTap={{ scale: 0.9 }}
                transition={SPRING_SNAP}
                aria-label="Pause recording"
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--danger)] text-[var(--danger)]"
              >
                <IconPause size={17} />
              </motion.button>
            ) : recorder.state === "paused" ? (
              <motion.button
                type="button"
                onClick={() => {
                  stopDraft();
                  recorder.resume();
                }}
                whileTap={{ scale: 0.9 }}
                transition={SPRING_SNAP}
                aria-label="Carry on recording"
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--danger)] text-[var(--danger)]"
              >
                <IconMic size={18} />
              </motion.button>
            ) : (
              <span className="h-11 w-11" />
            )}

            <motion.button
              type="button"
              onClick={() => void sendRecording()}
              disabled={recorder.state === "requesting"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAP}
              aria-label="Send this voice note"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-accent)] disabled:opacity-60"
            >
              <IconSend size={19} />
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="relative flex min-h-12 min-w-0 flex-1 items-end overflow-hidden rounded-[24px] bg-[var(--background)]">
            <AnimatePresence mode="popLayout" initial={false}>
              {mode === "holding" ? (
                // ---- holding: the time, and "slide to cancel" moving with the finger.
                <motion.div
                  key="holding"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={SPRING_SNAP}
                  className="flex h-12 w-full items-center gap-3 px-4"
                >
                  <motion.span
                    className="text-[var(--danger)]"
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  >
                    <IconMic size={18} />
                  </motion.span>
                  <span role="timer" className="text-[14px] tabular-nums">
                    {recorder.state === "requesting" ? "0:00" : elapsed}
                  </span>
                  <motion.span
                    style={{ x: hintX, opacity: hintOpacity }}
                    className="ml-auto flex items-center gap-1 whitespace-nowrap text-[13px] text-[var(--muted)]"
                  >
                    <motion.span animate={{ x: [0, -4, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
                      <IconChevronLeft size={15} />
                    </motion.span>
                    Slide to cancel
                  </motion.span>
                </motion.div>
              ) : binned ? (
                // ---- binned: the mic drops into the bin.
                <motion.div
                  key="binned"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative flex h-12 w-full items-center px-4 text-[var(--muted)]"
                >
                  <motion.span
                    className="absolute left-4 text-[var(--danger)]"
                    initial={{ y: -22, rotate: 0, opacity: 1 }}
                    animate={{ y: 4, rotate: -60, opacity: 0 }}
                    transition={{ duration: 0.45, ease: "easeIn" }}
                  >
                    <IconMic size={16} />
                  </motion.span>
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [0.6, 1.15, 1], opacity: 1 }}
                    transition={{ duration: 0.45 }}
                  >
                    <IconTrash size={20} />
                  </motion.span>
                </motion.div>
              ) : (
                // ---- writing.
                <motion.div
                  key="writing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex w-full items-end"
                >
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      onTyping();
                    }}
                    onKeyDown={(event) => {
                      // Enter sends on a physical keyboard; Shift+Enter breaks
                      // the line. Left alone on touch, where Enter is the only
                      // newline a soft keyboard offers.
                      if (event.key === "Enter" && !event.shiftKey && !("ontouchstart" in window)) {
                        event.preventDefault();
                        void submitText();
                      }
                    }}
                    rows={1}
                    disabled={disabled}
                    placeholder="Message"
                    aria-label="Write a message"
                    className="min-w-0 flex-1 resize-none bg-transparent py-3 pl-4 text-[15px] leading-6 outline-none placeholder:text-[var(--muted)] disabled:opacity-60"
                  />
                  <motion.button
                    type="button"
                    onClick={() => setAttachOpen((open) => !open)}
                    disabled={disabled}
                    animate={{ rotate: attachOpen ? -45 : 0 }}
                    transition={SPRING_SNAP}
                    aria-label="Send a photo"
                    aria-expanded={attachOpen}
                    className="flex h-12 w-10 shrink-0 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                  >
                    <IconPaperclip size={20} />
                  </motion.button>
                  <AnimatePresence initial={false}>
                    {canSendText ? null : (
                      <motion.button
                        key="camera"
                        type="button"
                        onClick={takePhoto}
                        disabled={disabled}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 44, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={SPRING_SNAP}
                        aria-label="Take a photo"
                        className="flex h-12 shrink-0 items-center justify-center overflow-hidden pr-1.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                      >
                        <IconCamera size={20} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* One button: the mic, or send once there is text. While held it
              grows and follows the finger; the lock waits above it. */}
          <div className="relative h-12 w-12 shrink-0">
            <AnimatePresence>
              {mode === "holding" ? (
                <motion.div
                  key="lock"
                  initial={{ opacity: 0, y: 16, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={SPRING_SNAP}
                  className="pointer-events-none absolute bottom-[calc(100%+22px)] left-1/2 flex h-[92px] w-11 -translate-x-1/2 flex-col items-center justify-start gap-1 rounded-full bg-[var(--surface)] pt-3 shadow-[var(--shadow-raised)]"
                >
                  <motion.span style={{ y: lockY }} className="text-[var(--foreground)]">
                    <IconLock size={18} />
                  </motion.span>
                  <motion.span
                    animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="text-[var(--muted)]"
                  >
                    <IconChevronUp size={16} />
                  </motion.span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <motion.button
              type="button"
              onPointerDown={onMicDown}
              onPointerMove={onMicMove}
              onPointerUp={onMicUp}
              onPointerCancel={() => {
                // The system took the touch (a notification, a scroll): keep
                // recording, hands-free, rather than lose it.
                if (modeRef.current === "holding") lockRecording();
              }}
              onClick={onMainClick}
              onContextMenu={(event) => event.preventDefault()}
              disabled={disabled || busy}
              style={{ x: dragX, y: dragY, WebkitTouchCallout: "none" }}
              animate={{ scale: mode === "holding" ? 1.55 : 1 }}
              whileTap={mode === "idle" ? { scale: 0.92 } : undefined}
              transition={SPRING_SNAP}
              aria-label={canSendText ? "Send message" : "Record a voice note. Hold to talk, or tap to record hands-free"}
              className="absolute inset-0 z-10 flex touch-none select-none items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-accent)] disabled:opacity-60"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={busy ? "busy" : canSendText ? "send" : "mic"}
                  initial={{ scale: 0.4, opacity: 0, rotate: canSendText ? -45 : 45 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex"
                >
                  {busy ? <Spinner size={16} /> : canSendText ? <IconSend size={19} /> : <IconMic size={20} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      )}

      <PhotoPreview
        photo={photo}
        onClose={() => setPhoto(null)}
        onSend={() => {
          if (photo) onSendImage(photo);
          setPhoto(null);
        }}
      />
      <Webcam
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        onUnavailable={onWebcamUnavailable}
        onCapture={(shot) => {
          setWebcamOpen(false);
          void preparePhoto(shot);
        }}
      />
    </div>
  );
}
