"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import TalkBlob, { type BlobState } from "@/components/voice/TalkBlob";
import { useAudioLevel } from "@/lib/audio/useAudioLevel";

/**
 * The voice surface.
 *
 * The blob is a controlled component — this page owns the microphone through
 * `useAudioLevel` and hands the amplitude down, so when the companion engine
 * lands it consumes the same stream rather than opening a second one.
 *
 * The conversation itself is not wired yet: `state` moves on the user's
 * actions and on audio, not on a model. That is deliberate — the UI is real
 * and the engine slots in behind it.
 */

const STATUS: Record<BlobState, string> = {
  idle: "Tap to begin. You can stop at any time.",
  listening: "Listening — speak naturally.",
  thinking: "Thinking…",
  speaking: "Talk is speaking.",
};

export default function TherapyPage() {
  const { level, status, start, stop } = useAudioLevel();
  const [active, setActive] = useState(false);

  // Derived, not stored. The original version kept a separate `status` string
  // and set it from the pre-toggle value of `listening`, so the label was
  // always one tap behind what the button did. Deriving it removes the bug
  // rather than fixing it.
  const blobState: BlobState = !active
    ? "idle"
    : status === "requesting"
      ? "thinking"
      : "listening";

  const begin = useCallback(async () => {
    setActive(true);
    await start();
  }, [start]);

  const end = useCallback(() => {
    setActive(false);
    stop();
  }, [stop]);

  useEffect(() => stop, [stop]);

  const denied = status === "denied" || status === "unsupported" || status === "error";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--dark)] text-white">
      {/* Ambient warmth behind the field. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 52%, rgba(255,90,31,0.30) 0%, rgba(255,90,31,0) 58%)," +
            "radial-gradient(circle at 80% 18%, rgba(255,90,31,0.14), transparent 52%)",
        }}
      />

      <header className="relative z-10 px-4 sm:px-6 md:px-10 pt-5 md:pt-8 flex items-center justify-between">
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <Link
          href="/dashboard"
          className="h-10 px-4 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
        >
          Exit
        </Link>
      </header>

      <main className="relative z-[1] min-h-[calc(100vh-120px)] flex flex-col items-center justify-center px-4 sm:px-6 py-10">
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="text-[12px] uppercase tracking-[0.22em] text-white/65"
        >
          AI companion
        </motion.p>

        <motion.button
          type="button"
          onClick={active ? end : begin}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={SPRING_SNAP}
          aria-label={active ? "End session" : "Begin session"}
          className="mt-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--dark)]"
        >
          <TalkBlob state={blobState} level={level} size={340} />
        </motion.button>

        <AnimatePresence mode="wait">
          <motion.p
            key={blobState + String(denied)}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={SPRING_SOFT}
            className="mt-8 text-[14px] md:text-[15px] text-white/75 text-center max-w-[420px]"
            aria-live="polite"
          >
            {denied
              ? "Talk cannot hear you — microphone access was blocked. You can still type, or allow the microphone in your browser settings."
              : STATUS[blobState]}
          </motion.p>
        </AnimatePresence>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={active ? end : begin}
            className="h-12 px-7 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white text-[12px] uppercase tracking-[0.14em] font-medium transition-colors"
          >
            {active ? "End session" : "Begin"}
          </button>
          <Link
            href="/therapists"
            className="h-12 px-6 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
          >
            Talk to a human
          </Link>
        </div>

        {/* Never further than one line away, on the surface most likely to
            be open when someone is struggling. */}
        <p className="mt-12 text-[11px] uppercase tracking-[0.18em] text-white/45 text-center max-w-[460px] leading-relaxed">
          Talk is an AI companion, not a therapist, and cannot respond to an
          emergency.{" "}
          <Link href="/crisis" className="underline underline-offset-4 text-white/70">
            Urgent help
          </Link>
        </p>
      </main>
    </div>
  );
}
