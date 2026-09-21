"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import TalkBlob from "@/components/voice/TalkBlob";
import { useAuth } from "@/components/AuthProvider";
import { useConversation, type Line, type Phase } from "@/lib/ai/useConversation";
import { LANGUAGE_LABEL } from "@/lib/ai/protocol";

/**
 * The voice surface — a spoken conversation with Talk.
 *
 * You speak; gemini-3.8-flash hears the audio, transcribes and translates it
 * and writes Talk's reply in the language you used; gemini-3.1-flash-tts
 * speaks it. The blob follows whoever is talking. See useConversation for the
 * turn cycle and /api/companion/turn for the server half.
 */

/**
 * Blob sizing, shared between CSS and the canvas.
 *
 * The body's diameter is 30% of the smaller viewport side, clamped — the same
 * formula TalkBlob uses for its radius (15%, 88..150px), so the clickable disc
 * lines up with what is drawn. The canvas is far larger than the body: it is
 * where thrown particles and the ember halo live, and a canvas the size of
 * the body clips every reaction worth seeing.
 */
const BLOB_VARS = {
  "--blob-d": "clamp(176px, 30vmin, 300px)",
  "--blob-canvas": "calc(var(--blob-d) * 4.4)",
} as CSSProperties;

const STATUS: Record<Phase, string> = {
  idle: "Tap to begin. You can stop at any time.",
  starting: "Opening your microphone…",
  listening: "Listening — speak whenever you're ready.",
  hearing: "Listening…",
  thinking: "Thinking…",
  speaking: "Talk is speaking. Tap to interrupt.",
};

export default function TherapyPage() {
  const { user } = useAuth();
  const getToken = useCallback(() => (user ? user.getIdToken() : Promise.resolve(null)), [user]);
  const talk = useConversation({ getToken });
  const { mic } = talk;

  // Capture diagnostics only with ?debug in the URL. Read once, lazily: the
  // gated markup renders only after Begin (client state), so the server and
  // first client render agree and there is nothing to mismatch on hydration.
  const [showDebug] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"),
  );
  const [showEnglish, setShowEnglish] = useState(true);

  const denied = mic.status === "denied" || mic.status === "unsupported" || mic.status === "error";
  const lastUser = findLast(talk.lines, "user");
  const lastTalk = findLast(talk.lines, "talk");
  const translated = Boolean(lastUser?.english || lastTalk?.english);

  // A tap on the blob never ends the session — that is the button's job. A
  // tap meant to interrupt Talk that lands a moment after she finished would
  // otherwise throw the whole conversation away.
  const onBlob = talk.active ? talk.interrupt : talk.start;
  const blobLabel = !talk.active
    ? "Begin session"
    : talk.phase === "hearing"
      ? "I'm done speaking"
      : talk.phase === "thinking" || talk.phase === "speaking"
        ? "Interrupt Talk"
        : "Talk is listening";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--dark)] text-white" style={BLOB_VARS}>
      {/* Ambient warmth behind the field. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(255,90,31,0.30) 0%, rgba(255,90,31,0) 58%)," +
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

      <main className="relative z-[1] min-h-[calc(100vh-120px)] flex flex-col items-center justify-center px-4 sm:px-6 py-8">
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="relative z-10 text-[12px] uppercase tracking-[0.22em] text-white/65"
        >
          AI companion
          {talk.language && talk.language !== "other" ? (
            <span className="text-white/40"> · {LANGUAGE_LABEL[talk.language]}</span>
          ) : null}
        </motion.p>

        <motion.button
          type="button"
          onClick={onBlob}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={SPRING_SNAP}
          aria-label={blobLabel}
          className="relative mt-8 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--dark)]"
          style={{ width: "var(--blob-d)", height: "var(--blob-d)" }}
        >
          {/* The feed switches to Talk's own voice while she speaks, so the
              blob follows whoever is talking. The canvas overflows the button
              on purpose and ignores the pointer, so only the body is the tap
              target; the page's overflow-hidden trims it at the viewport. */}
          <TalkBlob
            state={talk.blobState}
            feed={talk.feed}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "var(--blob-canvas)", height: "var(--blob-canvas)" }}
          />
        </motion.button>

        {/* Deliberately NOT wrapped in AnimatePresence mode="wait".
            It was, and the exit animation could deadlock — leaving the status
            reading "Tap to begin" while the session was actually running. A
            status line on this surface has to be correct before it is pretty. */}
        <p
          className={`relative z-10 mt-8 text-[13px] md:text-[14px] text-center max-w-[440px] ${
            denied ? "text-[var(--accent)]" : "text-white/60"
          }`}
          aria-live="polite"
        >
          {denied
            ? "Talk cannot hear you — your browser blocked microphone access. Allow the microphone for this site and press Begin again."
            : STATUS[talk.phase]}
        </p>

        {/* What was said, both ways. The newest exchange only: this is a
            conversation, not a chat log, and the words are there to confirm
            Talk heard you right — and for when her voice cannot be heard. */}
        <div className="relative z-10 mt-5 w-full max-w-[560px] min-h-[96px] text-center" aria-live="polite">
          <AnimatePresence initial={false}>
            {lastUser ? <Caption key={lastUser.id} line={lastUser} showEnglish={showEnglish} /> : null}
            {lastTalk ? <Caption key={lastTalk.id} line={lastTalk} showEnglish={showEnglish} /> : null}
          </AnimatePresence>
          {translated ? (
            <button
              type="button"
              onClick={() => setShowEnglish((v) => !v)}
              className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-white/60 transition-colors"
            >
              {showEnglish ? "Hide English" : "Show English"}
            </button>
          ) : null}
        </div>

        {talk.error ? (
          <div className="relative z-10 mt-4 max-w-[440px] text-center text-[13px] text-[var(--accent-soft)]">
            {talk.error.message}
            {talk.error.kind === "auth" ? (
              <>
                {" "}
                <Link href="/sign-in" className="underline underline-offset-4 text-white">
                  Sign in
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Once anything suggests danger, help stays on screen for the rest of
            the session. Talk says the numbers too — this is for anyone who
            cannot listen right now. */}
        {talk.risk === "elevated" || talk.risk === "urgent" ? (
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={SPRING_SOFT}
            role="alert"
            className="relative z-10 mt-6 w-full max-w-[440px] rounded-2xl border border-[var(--accent)]/60 bg-[var(--accent)]/10 px-5 py-4 text-center"
          >
            <p className="text-[13px] text-white/85">If you are in danger right now, call for help.</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <a
                href="tel:117"
                className="h-10 px-4 rounded-full bg-[var(--accent)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center"
              >
                Police 117
              </a>
              <a
                href="tel:116"
                className="h-10 px-4 rounded-full bg-[var(--accent)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center"
              >
                Ambulance 116
              </a>
            </div>
            <Link
              href="/crisis"
              className="mt-3 inline-block text-[11px] uppercase tracking-[0.18em] text-white/70 underline underline-offset-4"
            >
              More urgent help
            </Link>
          </motion.div>
        ) : null}

        {showDebug && talk.active && mic.status === "live" ? (
          <div className="relative z-10 mt-8 w-full max-w-[320px]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/50">
              <span>Level · {talk.phase}</span>
              <span className="tabular-nums">
                {/* Raw RMS alongside the bar: a flat bar with a non-zero RMS
                    means the scaling is wrong, a flat bar with zero RMS means
                    no audio is reaching the analyser at all. */}
                rms {mic.rms.toFixed(3)} · {mic.pitchHz > 0 ? `${Math.round(mic.pitchHz)} Hz` : "—"}
              </span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-75"
                style={{ width: `${Math.round(mic.level * 100)}%` }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-white/40 tabular-nums">
              <dt>context</dt>
              <dd className={mic.debug.contextState === "running" ? "text-white/70" : "text-[var(--accent)]"}>
                {mic.debug.contextState} @ {mic.debug.sampleRate}Hz
              </dd>
              <dt>frames</dt>
              <dd className={mic.debug.frames > 0 ? "text-white/70" : "text-[var(--accent)]"}>{mic.debug.frames}</dd>
              <dt>track</dt>
              <dd
                className={
                  mic.debug.trackState === "live" && !mic.debug.trackMuted ? "text-white/70" : "text-[var(--accent)]"
                }
              >
                {mic.debug.trackState}
                {mic.debug.trackMuted ? " · MUTED" : ""}
                {mic.debug.trackEnabled ? "" : " · DISABLED"}
              </dd>
              <dt className="truncate">device</dt>
              <dd className="truncate text-white/70">{mic.debug.trackLabel}</dd>
            </dl>
          </div>
        ) : null}

        <div className="relative z-10 mt-8 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={talk.active ? talk.stop : talk.start}
            className="h-12 px-7 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white text-[12px] uppercase tracking-[0.14em] font-medium transition-colors"
          >
            {talk.active ? "End session" : "Begin"}
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
        <p className="relative z-10 mt-10 text-[11px] uppercase tracking-[0.18em] text-white/45 text-center max-w-[460px] leading-relaxed">
          Talk is an AI companion, not a therapist, and cannot respond to an emergency.{" "}
          <Link href="/crisis" className="underline underline-offset-4 text-white/70">
            Urgent help
          </Link>
        </p>
      </main>
    </div>
  );
}

function findLast(lines: Line[], role: Line["role"]): Line | undefined {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].role === role) return lines[i];
  return undefined;
}

function Caption({ line, showEnglish }: { line: Line; showEnglish: boolean }) {
  const mine = line.role === "user";
  return (
    <motion.div
      layout
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
      className={mine ? "mb-3" : ""}
    >
      <p className={mine ? "text-[13px] text-white/50" : "text-[16px] md:text-[17px] leading-snug text-white/90"}>
        {mine ? <span className="uppercase tracking-[0.16em] text-[10px] text-white/35 mr-2">You</span> : null}
        {line.text}
      </p>
      {showEnglish && line.english ? (
        <p className={`mt-1 italic ${mine ? "text-[12px] text-white/30" : "text-[13px] text-white/45"}`}>
          {line.english}
        </p>
      ) : null}
    </motion.div>
  );
}
