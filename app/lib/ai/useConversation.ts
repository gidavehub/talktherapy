"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioLevel } from "../audio/useAudioLevel";
import { UtteranceCapture } from "../audio/capture";
import { StreamPlayer } from "../audio/player";
import type { AudioFeed } from "../audio/analysis";
import type { BlobState } from "../../components/voice/TalkBlob";
import { EMPTY_INTAKE, type Intake } from "../matching";
import {
  FOLD_TURNS,
  MAX_HISTORY_TURNS,
  type ConversationMode,
  type HistoryTurn,
  type Language,
  type Risk,
  type TurnEvent,
} from "./protocol";

/**
 * The voice conversation, end to end, on the client.
 *
 *   (greeting) ─► listening ──(speech)──► hearing ──(pause)──► thinking ──► speaking ──┐
 *                    ▲                                                               │
 *                    └───────────────────────────────────────────────────────────────┘
 *
 * Turn-based on purpose: the microphone stays open (so the blob keeps
 * reacting) but utterances are only captured while listening. Tapping while
 * Talk is thinking or speaking interrupts her and hands the floor back.
 *
 * In intake mode this IS the onboarding: Talk speaks first, every turn
 * carries what she has learned so far, and once she has everything she needs
 * `onIntakeDone` fires after she finishes her closing line.
 */

export type Phase = "idle" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

export type Line = {
  id: number;
  role: "user" | "talk";
  text: string;
  /** English rendering when `text` is in another language. */
  english?: string;
  language?: Language;
};

export type ConversationError =
  | { kind: "auth"; message: string }
  | { kind: "busy"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "voice"; message: string };

type Options = {
  getToken: () => Promise<string | null>;
  mode?: ConversationMode;
  /** Intake mode: what is already known (resuming a half-finished intake). */
  initialIntake?: Intake | null;
  displayName?: string | null;
  /** Intake mode: fires after every turn that learned something. Persist it here. */
  onIntake?: (intake: Intake) => void;
  /** Intake mode: fires once Talk has everything and has finished speaking. */
  onIntakeDone?: (intake: Intake) => void;
};

const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, elevated: 2, urgent: 3 };
/** Pause after Talk stops before listening again, so her tail is not heard. */
const AFTER_SPEAKING_MS = 250;

let lineId = 0;

export function useConversation({
  getToken,
  mode = "companion",
  initialIntake = null,
  displayName = null,
  onIntake,
  onIntakeDone,
}: Options) {
  const mic = useAudioLevel();
  // The hook returns a fresh object every render; its functions are stable.
  // Depending on `mic` itself would re-create stop() each render, and the
  // unmount effect below would then end the session on every render.
  const { start: micStart, stop: micStop, graph: micGraph } = mic;
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  /** Highest risk seen this session. Sticky: help stays on screen once needed. */
  const [risk, setRisk] = useState<Risk>("none");
  const [heardLanguage, setLanguage] = useState<Language | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [talkFeed, setTalkFeed] = useState<AudioFeed | null>(null);
  /** The microphone was refused: Talk still speaks, the person types. */
  const [textOnly, setTextOnly] = useState(false);
  // What this session has learned. Until the first turn returns, the saved
  // intake from the profile stands in — derived, not copied, so a profile
  // that loads after mount needs no effect to sync it.
  const [sessionIntake, setIntake] = useState<Intake | null>(null);
  const intake = sessionIntake ?? initialIntake ?? EMPTY_INTAKE;
  const language = heardLanguage ?? intake.language;

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const captureRef = useRef<UtteranceCapture | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<HistoryTurn[]>([]);
  const summaryRef = useRef("");
  const foldingRef = useRef(false);
  const intakeRef = useRef<Intake>(initialIntake ?? EMPTY_INTAKE);
  const doneRef = useRef(false);
  const rafRef = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest callbacks and settings, read at call time so the session never
  // needs rebuilding when the page re-renders with new closures.
  const opts = useRef({ getToken, mode, displayName, onIntake, onIntakeDone, intake });

  useEffect(() => {
    opts.current = { getToken, mode, displayName, onIntake, onIntakeDone, intake };
  }, [getToken, mode, displayName, onIntake, onIntakeDone, intake]);

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
    captureRef.current?.setEnabled(true);
    go("listening");
  }, [go]);

  /** Talk has finished a line: listen again — or, if the intake is done, hand over. */
  const afterSpeaking = useCallback(() => {
    if (doneRef.current) {
      opts.current.onIntakeDone?.(intakeRef.current);
      return;
    }
    listen();
  }, [listen]);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await opts.current.getToken().catch(() => null);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  /** Fold the oldest turns into the summary, in the background. */
  const maybeFold = useCallback(async () => {
    if (foldingRef.current || historyRef.current.length <= MAX_HISTORY_TURNS) return;
    foldingRef.current = true;
    const folded = historyRef.current.slice(0, FOLD_TURNS);
    try {
      const res = await fetch("/api/companion/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ summary: summaryRef.current, turns: folded }),
      });
      if (res.ok) {
        const { summary } = (await res.json()) as { summary: string };
        summaryRef.current = summary;
        historyRef.current = historyRef.current.filter((t) => !folded.includes(t));
      }
    } catch {
      // Keep the turns; the server only sends the newest window anyway.
    } finally {
      foldingRef.current = false;
    }
  }, [authHeader]);

  /**
   * One request that makes Talk speak — a turn or the greeting. Streams the
   * words, then her voice, then hands the floor back.
   */
  const speakRequest = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!activeRef.current) return;
      captureRef.current?.setEnabled(false);
      go("thinking");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const player = playerRef.current;
      let replied = false;
      let speaking = false;

      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 401) {
            setError({ kind: "auth", message: payload.error ?? "Sign in to talk to Talk." });
            return; // the auth effect below ends the session
          }
          setError({
            kind: res.status === 429 ? "busy" : "failed",
            message: payload.error ?? "Talk couldn't respond just then. Please try again.",
          });
          listen();
          return;
        }

        const handle = (ev: TurnEvent) => {
          if (ev.type === "turn") {
            if (!ev.transcript && !ev.blocked && !ev.greeting) return; // nothing intelligible was said
            const lang = ev.language === "none" ? undefined : ev.language;
            const heard: Line[] = ev.transcript
              ? [
                  {
                    id: ++lineId,
                    role: "user",
                    text: ev.transcript,
                    english: lang && lang !== "english" ? ev.english : undefined,
                    language: lang,
                  },
                ]
              : [];
            const said: Line[] = ev.reply
              ? [
                  {
                    id: ++lineId,
                    role: "talk",
                    text: ev.reply,
                    english: lang && lang !== "english" ? ev.replyEnglish : undefined,
                    language: lang,
                  },
                ]
              : [];
            setLines((prev) => [...prev, ...heard, ...said]);
            setRisk((prev) => (RISK_RANK[ev.risk] > RISK_RANK[prev] ? ev.risk : prev));

            if (ev.intake) {
              intakeRef.current = ev.intake;
              setIntake(ev.intake);
              if (ev.intake.language) setLanguage(ev.intake.language);
              if (ev.transcript) opts.current.onIntake?.(ev.intake);
            } else if (lang) {
              setLanguage(lang);
            }
            if (ev.intakeComplete) doneRef.current = true;

            if (ev.transcript) {
              historyRef.current.push({ role: "user", text: ev.transcript, english: ev.english, language: lang });
            }
            if (ev.reply) {
              // The greeting is remembered too, so Talk knows what she asked.
              historyRef.current.push({ role: "talk", text: ev.reply, english: ev.replyEnglish, language: lang });
            }
            if (ev.reply && player) {
              replied = true;
              player.begin(() => {
                if (phaseRef.current !== "speaking") return;
                resumeTimer.current = setTimeout(afterSpeaking, AFTER_SPEAKING_MS);
              });
            }
          } else if (ev.type === "audio" && player && replied) {
            if (!speaking) {
              speaking = true;
              go("speaking");
            }
            player.push(ev.pcm, ev.sampleRate);
          } else if (ev.type === "error") {
            setError({ kind: ev.stage === "voice" ? "voice" : "failed", message: ev.message });
          }
        };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line) handle(JSON.parse(line) as TurnEvent);
          }
        }

        if (replied && player) {
          // Voice may have failed entirely; end() then finishes at once and
          // the words stay on screen.
          if (!speaking) go("speaking");
          player.end();
        } else {
          afterSpeaking();
        }
        void maybeFold();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError({ kind: "failed", message: "Talk couldn't be reached. Check your connection and try again." });
        player?.stop();
        listen();
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [afterSpeaking, authHeader, go, listen, maybeFold],
  );

  const turnBody = useCallback(
    (message: { audio: string } | { text: string }) => ({
      ...message,
      history: historyRef.current,
      summary: summaryRef.current,
      mode: opts.current.mode,
      intake: opts.current.mode === "intake" ? intakeRef.current : undefined,
    }),
    [],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    abortRef.current?.abort();
    abortRef.current = null;
    cancelAnimationFrame(rafRef.current);
    captureRef.current?.dispose();
    captureRef.current = null;
    playerRef.current?.dispose();
    playerRef.current = null;
    setTalkFeed(null);
    micStop();
    go("idle");
  }, [go, micStop]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    doneRef.current = false;
    // Resume from whatever is known: the saved intake, or this session's.
    intakeRef.current = opts.current.intake;
    setError(null);
    go("starting");

    await micStart();
    const graph = micGraph();
    if (!graph || !activeRef.current) {
      // Denied, unsupported, or ended while the permission prompt was open.
      activeRef.current = false;
      go("idle");
      return;
    }

    const player = new StreamPlayer(graph.ctx);
    playerRef.current = player;
    setTalkFeed(player.feed);

    // No microphone (refused, or none present): carry on by text rather than
    // locking the person out of onboarding.
    setTextOnly(!graph.source);
    if (graph.source) {
      try {
        captureRef.current = await UtteranceCapture.attach(graph.ctx, graph.source, {
          onSpeechStart: () => {
            if (phaseRef.current === "listening") go("hearing");
          },
          onUtterance: (audio) => void speakRequest("/api/companion/turn", turnBody({ audio })),
        });
      } catch (e) {
        console.error("[useConversation] capture", e);
        setTextOnly(true);
      }
    }

    // Talk's voice moves the blob too: analyse playback every frame.
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (phaseRef.current === "speaking") playerRef.current?.analyse();
    };
    rafRef.current = requestAnimationFrame(loop);

    // Onboarding opens with Talk's voice, not instructions on a screen.
    if (opts.current.mode === "intake") {
      await speakRequest("/api/companion/greet", {
        mode: "intake",
        intake: intakeRef.current,
        displayName: opts.current.displayName,
      });
      return;
    }
    listen();
  }, [go, listen, micGraph, micStart, speakRequest, turnBody]);

  /** A typed message, for anyone who cannot or would rather not speak right now. */
  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || !activeRef.current) return;
      const p = phaseRef.current;
      if (p === "thinking" || p === "speaking") {
        abortRef.current?.abort();
        playerRef.current?.stop();
      }
      void speakRequest("/api/companion/turn", turnBody({ text: clean }));
    },
    [speakRequest, turnBody],
  );

  /**
   * A tap on the blob. While Talk thinks or speaks, it interrupts her; while
   * the user is mid-sentence it means "I'm done — go ahead".
   */
  const interrupt = useCallback(() => {
    const p = phaseRef.current;
    if (p === "thinking") {
      abortRef.current?.abort();
      listen();
    } else if (p === "speaking") {
      playerRef.current?.stop();
      // Cutting off her closing line still finishes the intake.
      afterSpeaking();
    } else if (p === "hearing") {
      captureRef.current?.flush();
    }
  }, [afterSpeaking, listen]);

  // An auth failure ends the session: nothing will succeed until sign-in.
  useEffect(() => {
    if (error?.kind === "auth" && activeRef.current) stop();
  }, [error, stop]);

  // Leaving the page ends everything — microphone light included.
  useEffect(() => () => stop(), [stop]);

  const blobState: BlobState =
    phase === "idle"
      ? "idle"
      : phase === "starting" || phase === "thinking"
        ? "thinking"
        : phase === "speaking"
          ? "speaking"
          : "listening";

  const feed = phase === "speaking" && talkFeed ? talkFeed : mic.feed;

  return {
    phase,
    blobState,
    feed,
    lines,
    risk,
    language,
    intake,
    error,
    mic,
    active: phase !== "idle",
    textOnly,
    start,
    stop,
    interrupt,
    sendText,
  };
}
