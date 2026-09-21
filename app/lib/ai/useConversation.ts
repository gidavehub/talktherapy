"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioLevel } from "../audio/useAudioLevel";
import { UtteranceCapture } from "../audio/capture";
import { StreamPlayer } from "../audio/player";
import type { AudioFeed } from "../audio/analysis";
import type { BlobState } from "../../components/voice/TalkBlob";
import {
  FOLD_TURNS,
  MAX_HISTORY_TURNS,
  type HistoryTurn,
  type Language,
  type Risk,
  type TurnEvent,
} from "./protocol";

/**
 * The voice conversation, end to end, on the client.
 *
 *   listening ──(speech)──► hearing ──(pause)──► thinking ──► speaking ──┐
 *       ▲                                                              │
 *       └──────────────────────────────────────────────────────────────┘
 *
 * Turn-based on purpose: the microphone stays open (so the blob keeps
 * reacting) but utterances are only captured while listening. Tapping while
 * Talk is thinking or speaking interrupts her and hands the floor back.
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

const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, elevated: 2, urgent: 3 };
/** Pause after Talk stops before listening again, so her tail is not heard. */
const AFTER_SPEAKING_MS = 250;

let lineId = 0;

export function useConversation({ getToken }: { getToken: () => Promise<string | null> }) {
  const mic = useAudioLevel();
  // The hook returns a fresh object every render; its functions are stable.
  // Depending on `mic` itself would re-create stop() each render, and the
  // unmount effect below would then end the session on every render.
  const { start: micStart, stop: micStop, graph: micGraph } = mic;
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  /** Highest risk seen this session. Sticky: help stays on screen once needed. */
  const [risk, setRisk] = useState<Risk>("none");
  const [language, setLanguage] = useState<Language | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [talkFeed, setTalkFeed] = useState<AudioFeed | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const captureRef = useRef<UtteranceCapture | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<HistoryTurn[]>([]);
  const summaryRef = useRef("");
  const foldingRef = useRef(false);
  const tokenRef = useRef(getToken);
  const rafRef = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tokenRef.current = getToken;
  }, [getToken]);

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

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await tokenRef.current().catch(() => null);
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

  const takeTurn = useCallback(
    async (audio: string) => {
      if (!activeRef.current) return;
      captureRef.current?.setEnabled(false);
      go("thinking");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const player = playerRef.current;
      let replied = false;

      try {
        const res = await fetch("/api/companion/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ audio, history: historyRef.current, summary: summaryRef.current }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 401) {
            setError({ kind: "auth", message: body.error ?? "Sign in to talk to Talk." });
            return; // stop() runs in the caller's effect below
          }
          setError({
            kind: res.status === 429 ? "busy" : "failed",
            message: body.error ?? "Talk couldn't respond just then. Please try again.",
          });
          listen();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let speaking = false;

        const handle = (ev: TurnEvent) => {
          if (ev.type === "turn") {
            if (!ev.transcript && !ev.blocked) return; // nothing intelligible was said
            const heard: Line[] = ev.transcript
              ? [
                  {
                    id: ++lineId,
                    role: "user",
                    text: ev.transcript,
                    english: ev.language !== "english" ? ev.english : undefined,
                    language: ev.language === "none" ? undefined : ev.language,
                  },
                ]
              : [];
            const lang = ev.language === "none" ? undefined : ev.language;
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
            if (lang) setLanguage(lang);
            setRisk((prev) => (RISK_RANK[ev.risk] > RISK_RANK[prev] ? ev.risk : prev));

            if (ev.transcript) {
              historyRef.current.push({ role: "user", text: ev.transcript, english: ev.english, language: lang });
              if (ev.reply) historyRef.current.push({ role: "talk", text: ev.reply, english: ev.replyEnglish, language: lang });
            }
            if (ev.reply && player) {
              replied = true;
              player.begin(() => {
                if (phaseRef.current !== "speaking") return;
                resumeTimer.current = setTimeout(listen, AFTER_SPEAKING_MS);
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
          listen();
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
    [authHeader, go, listen, maybeFold],
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

    try {
      captureRef.current = await UtteranceCapture.attach(graph.ctx, graph.source, {
        onSpeechStart: () => {
          if (phaseRef.current === "listening") go("hearing");
        },
        onUtterance: (wav) => void takeTurn(wav),
      });
    } catch (e) {
      console.error("[useConversation] capture", e);
      setError({ kind: "failed", message: "This browser can't record for Talk. Try a recent Chrome, Edge or Safari." });
      stop();
      return;
    }

    // Talk's voice moves the blob too: analyse playback every frame.
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (phaseRef.current === "speaking") playerRef.current?.analyse();
    };
    rafRef.current = requestAnimationFrame(loop);

    listen();
  }, [go, listen, micGraph, micStart, stop, takeTurn]);

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
      listen();
    } else if (p === "hearing") {
      captureRef.current?.flush();
    }
  }, [listen]);

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
    error,
    mic,
    active: phase !== "idle",
    start,
    stop,
    interrupt,
  };
}
