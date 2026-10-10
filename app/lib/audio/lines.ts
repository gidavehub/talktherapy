"use client";

import { useSyncExternalStore } from "react";
import manifest from "../ai/voice-lines.generated.json";
import { VoiceAnalyser, type AudioFeed } from "./analysis";

/**
 * Talk's pre-recorded lines, played in English and then in Wolof.
 *
 * The way in cannot wait on a model, so what she says there was recorded once
 * (scripts/build-voice-lines.mjs) and is played from files.
 *
 * ONE player for the whole page's life — a module, not a component — because
 * the sequence crosses a navigation: the tap on the landing page starts her
 * speaking, and she carries on, without another tap, on the screen with the
 * particles. Browsers only let a page make sound after the person has touched
 * it, and only for audio started inside that touch; this element was, so it
 * keeps that permission for as long as the tab is open.
 *
 * It also drives the particles: her voice is routed through an analyser so the
 * blob moves as she speaks, exactly as it does for the live conversation.
 *
 * The sequence never depends on the sound. A muted phone, a blocked play or a
 * file that fails to load still advances, on the clip's own length, so the
 * captions turn and the steps appear for somebody who cannot hear her.
 */

export type LineLocale = "en" | "wo";
export type Saying = { id: string; locale: LineLocale; text: string; draft: boolean };

type Clip = { src: string; text: string; seconds: number; draft?: boolean };
const CLIPS = new Map<string, Partial<Record<LineLocale, Clip>>>(
  manifest.lines.map((line) => [line.id, line.clips as Partial<Record<LineLocale, Clip>>]),
);
/** English first — the owner's order — then Wolof. */
const ORDER: LineLocale[] = ["en", "wo"];

export const LOCALE_NAMES: Record<LineLocale, string> = { en: "English", wo: "Wolof" };

export type VoiceState = {
  /** The clip playing now, or null. */
  saying: Saying | null;
  /** Every line that has STARTED since the page loaded, in order. */
  spoken: string[];
  muted: boolean;
};

// ------------------------------------------------------------------ the player

let el: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: VoiceAnalyser | null = null;
let frame = 0;
let queue: { id: string; locale: LineLocale }[] = [];
let fallback: ReturnType<typeof setTimeout> | null = null;
let onLine: ((id: string, locale: LineLocale) => void) | null = null;
let onDone: (() => void) | null = null;

let state: VoiceState = { saying: null, spoken: [], muted: false };
const SERVER_STATE: VoiceState = { saying: null, spoken: [], muted: false };
const listeners = new Set<() => void>();

function set(next: Partial<VoiceState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

function clearFallback() {
  if (fallback) clearTimeout(fallback);
  fallback = null;
}

/** Move the particles: one analyser reading per frame while she speaks. */
function animate() {
  cancelAnimationFrame(frame);
  const tick = () => {
    analyser?.update();
    if (state.saying) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

function playNext(): void {
  clearFallback();
  const audio = element();
  const item = queue.shift();
  if (!item) {
    set({ saying: null });
    const done = onDone;
    onDone = null;
    onLine = null;
    done?.();
    return;
  }
  const clip = CLIPS.get(item.id)?.[item.locale];
  if (!clip) {
    playNext();
    return;
  }

  set({
    saying: { id: item.id, locale: item.locale, text: clip.text, draft: Boolean(clip.draft) },
    spoken: state.spoken.includes(item.id) ? state.spoken : [...state.spoken, item.id],
  });
  onLine?.(item.id, item.locale);
  animate();

  // Whatever happens to the sound, the line ends on time.
  const advance = () => {
    clearFallback();
    audio.onended = null;
    audio.onerror = null;
    playNext();
  };
  const after = (ms: number) => {
    clearFallback();
    fallback = setTimeout(advance, ms);
  };
  audio.onended = advance;
  audio.onerror = () => after(clip.seconds * 1000);
  if (!audio.src.endsWith(clip.src)) audio.src = clip.src;
  audio.currentTime = 0;
  // An element that neither ends nor errors (a stalled download) still moves
  // on, a little after it should have finished.
  after(clip.seconds * 1000 + 2500);
  audio.play().catch(() => after(clip.seconds * 1000));
}

export const voice = {
  /**
   * Call SYNCHRONOUSLY inside a tap, before say(). It creates the element and
   * the audio graph inside the gesture, which is what lets everything after
   * it — on this page or the next — make a sound.
   */
  unlock() {
    if (typeof window === "undefined") return;
    const audio = element();
    if (!ctx) {
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        void ctx.resume().catch(() => {});
        const source = ctx.createMediaElementSource(audio);
        source.connect(ctx.destination);
        analyser = new VoiceAnalyser(ctx, source);
      } catch {
        // No graph — she still speaks, the particles just do not follow her.
        ctx = null;
        analyser = null;
      }
    } else if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  },

  /**
   * Say these lines, each in English then Wolof. `onLine` fires as each clip
   * STARTS, so whatever it announces can appear while she says it; `onDone`
   * after the last.
   */
  say(
    ids: string[],
    callbacks: { onLine?: (id: string, locale: LineLocale) => void; onDone?: () => void } = {},
  ) {
    if (typeof window === "undefined") return;
    clearFallback();
    element().pause();
    queue = ids.flatMap((id) => ORDER.map((locale) => ({ id, locale })));
    onLine = callbacks.onLine ?? null;
    onDone = callbacks.onDone ?? null;
    playNext();
  },

  /** Stop, and forget what was queued — nothing fires afterwards. */
  stop() {
    clearFallback();
    queue = [];
    onLine = null;
    onDone = null;
    if (el) {
      el.onended = null;
      el.onerror = null;
      el.pause();
    }
    if (state.saying) set({ saying: null });
  },

  /** Silence her without stopping the sequence — the captions carry on. */
  setMuted(muted: boolean) {
    element().muted = muted;
    set({ muted });
  },

  /** Her voice, for the particles. Null until unlock() built the graph. */
  feed(): AudioFeed | null {
    return analyser?.feed ?? null;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  getServerSnapshot: () => SERVER_STATE,
};

/** What she is saying, and what she has said, as React state. */
export function useVoice(): VoiceState {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getServerSnapshot);
}
