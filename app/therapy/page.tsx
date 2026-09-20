"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
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
  const { level, pitch, pitchHz, status, start, stop } = useAudioLevel();
  const [active, setActive] = useState(false);

  // Derived, not stored. The original version kept a separate `status` string
  // and set it from the pre-toggle value of `listening`, so the label was
  // always one tap behind what the button did. Deriving it removes the bug
  // rather than fixing it.
  const denied = status === "denied" || status === "unsupported" || status === "error";

  // A blob that swells and ripples while the microphone is blocked is lying
  // about what the app can hear, so a failed mic falls back to idle rather
  // than sitting in a "listening" pose that never responds.
  const blobState: BlobState = !active || denied
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
          <TalkBlob state={blobState} level={level} pitch={pitch} size={340} />
        </motion.button>

        {/* Deliberately NOT wrapped in AnimatePresence mode="wait".
            It was, and the exit animation could deadlock — leaving the status
            reading "Tap to begin" while the session was actually running and
            the microphone had been refused. A status line on this surface has
            to be correct before it is pretty, so the text updates directly and
            only the opacity transitions. */}
        <motion.p
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={SPRING_SOFT}
          className={`mt-8 text-[14px] md:text-[15px] text-center max-w-[440px] ${
            denied ? "text-[var(--accent)]" : "text-white/75"
          }`}
          aria-live="polite"
        >
          {denied
            ? "Talk cannot hear you — your browser blocked microphone access. Allow the microphone for this site and press Begin again."
            : STATUS[blobState]}
        </motion.p>

        {/* Live input meter.
            Not decoration: when someone says the orb is not reacting, this is
            what distinguishes "the microphone is not being heard" from "the
            microphone works and the visual response is too weak". It also
            tells the user Talk can actually hear them, which a silent orb
            does not. */}
        {active && status === "live" ? (
          <div className="mt-8 w-full max-w-[320px]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/50">
              <span>Level</span>
              <span className="tabular-nums">
                {pitchHz > 0 ? `${Math.round(pitchHz)} Hz` : "—"}
              </span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-white/60 transition-[width] duration-75"
                style={{ width: `${Math.round(pitch * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

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
