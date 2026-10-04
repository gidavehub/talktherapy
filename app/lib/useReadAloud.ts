"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { StreamPlayer } from "./audio/player";
import type { Language } from "./ai/protocol";
import { COMPANION } from "./ai/endpoints";

/**
 * Read something on this screen aloud, in the person's own language.
 *
 * Talk is built for people who in many cases cannot read well, or cannot see.
 * Any surface — a provider's details, a message, a question — can hand its
 * text to this and have it spoken; the server renders it into their language
 * first (see the companionSpeak Cloud Function).
 *
 * The AudioContext is created inside the click that asks for speech, which is
 * the only moment a browser will allow it to make sound.
 */
export function useReadAloud(language: Language | null | undefined) {
  const { user } = useAuth();
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Which item is speaking, so a list can show it on the right row. */
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.stop();
    setSpeakingId(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      playerRef.current?.dispose();
      void ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const read = useCallback(
    async (id: string, text: string) => {
      if (!text.trim()) return;
      // A second tap on the same thing stops it.
      if (speakingId === id) {
        stop();
        return;
      }
      stop();

      if (!ctxRef.current) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      if (!playerRef.current) playerRef.current = new StreamPlayer(ctx);
      const player = playerRef.current;

      const controller = new AbortController();
      abortRef.current = controller;
      setSpeakingId(id);

      try {
        const token = user ? await user.getIdToken().catch(() => null) : null;
        const res = await fetch(COMPANION.speak, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ text, language: language ?? "english" }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setSpeakingId(null);
          return;
        }

        player.begin(() => setSpeakingId(null));
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
            if (!line) continue;
            const ev = JSON.parse(line) as { type: string; pcm?: string; sampleRate?: number };
            if (ev.type === "audio" && ev.pcm && ev.sampleRate) player.push(ev.pcm, ev.sampleRate);
          }
        }
        player.end();
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setSpeakingId(null);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [language, speakingId, stop, user],
  );

  return { read, stop, speakingId };
}
