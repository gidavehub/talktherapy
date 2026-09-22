"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import TalkBlob from "@/components/voice/TalkBlob";
import { useAuth } from "@/components/AuthProvider";
import { updateUserProfile } from "@/lib/auth";
import { useConversation, type Line, type Phase } from "@/lib/ai/useConversation";
import { LANGUAGE_LABEL } from "@/lib/ai/protocol";
import { REQUIRED_FIELDS, localeOf, missingFields, type Intake } from "@/lib/matching";

/**
 * Talk — the voice surface, and for a new person, the whole onboarding.
 *
 * Someone who has just created an account lands here and Talk simply starts
 * talking: who she is, then one question at a time, in whatever language they
 * answer in. No forms, no steps, no instructions on screen. When she has what
 * she needs she says so, and they are taken straight to the counsellors who
 * fit. Everyone else gets the open companion conversation.
 *
 * You speak; gemini-3.8-flash hears the audio, transcribes and translates it
 * and writes Talk's reply in your language; gemini-3.1-flash-tts speaks it.
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
  idle: "Tap to begin.",
  starting: "Opening your microphone…",
  listening: "Listening…",
  hearing: "Listening…",
  thinking: "Thinking…",
  speaking: "Tap to interrupt.",
};

/**
 * Signed-out visitors are sent to sign in — except under `next dev`, where the
 * page stays usable so the conversation can be exercised locally (the API
 * then decides, via TALK_DEV_ALLOW_ANON_AI). NODE_ENV is inlined at build
 * time, so a production bundle always redirects.
 */
const DEV_ANON = process.env.NODE_ENV === "development";

export default function TherapyPage() {
  const router = useRouter();
  const { user, profile, ready } = useAuth();

  // Read once, lazily, from the URL: ?intake redoes the intake for someone
  // already set up; ?debug shows capture diagnostics.
  const [params] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams(),
  );
  const intakeMode = params.has("intake") || Boolean(profile && !profile.onboarded);
  const showDebug = params.has("debug");
  const [showEnglish, setShowEnglish] = useState(true);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (ready && !user && !DEV_ANON) router.replace("/sign-in?next=%2Ftherapy");
  }, [ready, user, router]);

  const uid = user?.uid ?? null;
  const getToken = useCallback(() => (user ? user.getIdToken() : Promise.resolve(null)), [user]);

  // Progress is saved after every answer, so leaving halfway and coming back
  // picks up where Talk left off rather than starting again.
  const onIntake = useCallback(
    (intake: Intake) => {
      if (!uid) return;
      const locale = localeOf(intake.language);
      void updateUserProfile(uid, { intake, ...(locale ? { locale } : {}) }).catch(() => {});
    },
    [uid],
  );

  const onIntakeDone = useCallback(
    async (intake: Intake) => {
      if (uid) {
        const locale = localeOf(intake.language);
        await updateUserProfile(uid, { intake, onboarded: true, ...(locale ? { locale } : {}) }).catch(() => {});
      }
      router.replace("/counsellors?welcome=1");
    },
    [router, uid],
  );

  const talk = useConversation({
    getToken,
    mode: intakeMode ? "intake" : "companion",
    initialIntake: profile?.intake ?? null,
    displayName: profile?.displayName ?? user?.displayName ?? null,
    onIntake,
    onIntakeDone,
  });
  const { mic } = talk;

  const begin = useCallback(async () => {
    // Pressing Start under "By starting you agree…" is the consent. Recorded
    // once, with the time, the first time it happens.
    if (uid && profile && !profile.consents.acceptedTermsAt) {
      void updateUserProfile(uid, {
        consents: { ...profile.consents, dataProcessing: true, aiDisclosure: true, acceptedTermsAt: Date.now() },
      }).catch(() => {});
    }
    await talk.start();
  }, [profile, talk, uid]);

  const denied = mic.status === "denied" || mic.status === "unsupported" || mic.status === "error";
  // Without a microphone the keyboard is the only way to answer, so it is open.
  const showKeyboard = typing || talk.textOnly;
  const lastUser = findLast(talk.lines, "user");
  const lastTalk = findLast(talk.lines, "talk");
  const translated = Boolean(lastUser?.english || lastTalk?.english);
  const learned = REQUIRED_FIELDS.length - missingFields(talk.intake).length;
  const canStart = ready || DEV_ANON;

  // A tap on the blob never ends the session — that is the button's job. A
  // tap meant to interrupt Talk that lands a moment after she finished would
  // otherwise throw the whole conversation away.
  const onBlob = talk.active ? talk.interrupt : begin;
  const blobLabel = !talk.active
    ? "Begin"
    : talk.phase === "hearing"
      ? "I'm done speaking"
      : talk.phase === "thinking" || talk.phase === "speaking"
        ? "Interrupt Talk"
        : "Talk is listening";

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    talk.sendText(draft);
    setDraft("");
  }

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
        {/* Mid-onboarding, "home" is the only way out: the dashboard would
            send them straight back here. */}
        <Link
          href={intakeMode && !profile?.onboarded ? "/" : "/dashboard"}
          onClick={() => talk.stop()}
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
          Talk
          {talk.language && talk.language !== "other" ? (
            <span className="text-white/40"> · {LANGUAGE_LABEL[talk.language]}</span>
          ) : null}
        </motion.p>

        {/* Intake progress — four dots, no words. */}
        {intakeMode ? (
          <div className="relative z-10 mt-3 flex gap-1.5" aria-label={`${learned} of ${REQUIRED_FIELDS.length}`}>
            {REQUIRED_FIELDS.map((f, i) => (
              <motion.span
                key={f}
                className="h-1.5 w-1.5 rounded-full"
                animate={{ backgroundColor: i < learned ? "rgba(255,90,31,1)" : "rgba(255,255,255,0.2)" }}
                transition={SPRING_SOFT}
              />
            ))}
          </div>
        ) : null}

        <motion.button
          type="button"
          onClick={canStart ? onBlob : undefined}
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
            denied ? "text-[var(--accent)]" : "text-white/50"
          }`}
          aria-live="polite"
        >
          {denied
            ? "Microphone blocked — type your answers below, or allow the microphone and start again."
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
                <Link href="/sign-in?next=%2Ftherapy" className="underline underline-offset-4 text-white">
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

        {/* Typing, for a noisy room, a shared space, or a blocked microphone. */}
        <AnimatePresence>
          {showKeyboard && talk.active ? (
            <motion.form
              key="type"
              onSubmit={submitDraft}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SOFT}
              className="relative z-10 mt-6 w-full max-w-[440px] flex items-center gap-2"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Type to Talk"
                className="flex-1 h-12 rounded-full bg-white/10 border border-white/15 px-5 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Type…"
              />
              <button
                type="submit"
                aria-label="Send"
                className="h-12 w-12 shrink-0 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] flex items-center justify-center transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </motion.form>
          ) : null}
        </AnimatePresence>

        <div className="relative z-10 mt-8 flex items-center gap-3">
          <button
            type="button"
            disabled={!canStart}
            onClick={talk.active ? talk.stop : begin}
            className="h-12 px-7 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40 text-white text-[12px] uppercase tracking-[0.14em] font-medium transition-colors"
          >
            {talk.active ? "End" : intakeMode ? "Start" : "Begin"}
          </button>
          {talk.active && !talk.textOnly ? (
            <button
              type="button"
              onClick={() => setTyping((v) => !v)}
              aria-label={typing ? "Hide keyboard" : "Type instead"}
              aria-pressed={typing}
              className={`h-12 w-12 rounded-full border flex items-center justify-center transition-colors ${
                typing ? "bg-white text-[var(--dark)] border-white" : "border-white/20 hover:bg-white/10"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
                <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" strokeLinecap="round" />
              </svg>
            </button>
          ) : !intakeMode ? (
            <Link
              href="/counsellors"
              className="h-12 px-6 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
            >
              Talk to a human
            </Link>
          ) : null}
        </div>

        {intakeMode && !talk.active ? (
          <p className="relative z-10 mt-4 text-[11px] text-white/40 text-center max-w-[320px] leading-relaxed">
            By starting, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 text-white/60">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 text-white/60">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}

        {/* Never further than one line away, on the surface most likely to
            be open when someone is struggling. */}
        <p className="relative z-10 mt-10 text-[11px] uppercase tracking-[0.18em] text-white/45 text-center max-w-[460px] leading-relaxed">
          Talk is an AI, not a therapist, and cannot respond to an emergency.{" "}
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
