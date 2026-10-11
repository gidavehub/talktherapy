"use client";

import { useSyncExternalStore } from "react";
import manifest from "../ai/voice-lines.generated.json";
import { VoiceAnalyser, type AudioFeed } from "./analysis";
import { voiceOutput } from "./loudness";

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
  /**
   * The browser refused to play a line: nobody has tapped this page yet (a
   * refresh, a redirect, a plain link). The captions carry on regardless; the
   * page can replay the line on the first tap.
   */
  blocked: boolean;
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
/**
 * Which clip is current. Every callback a clip leaves behind — its ended,
 * error and fallback handlers, its play() rejection — checks it first, so a
 * clip that was superseded (a slow download overtaken, a stop, a new say())
 * can never cut short the one that replaced it.
 */
let token = 0;

let state: VoiceState = { saying: null, spoken: [], muted: false, blocked: false };
const SERVER_STATE: VoiceState = { saying: null, spoken: [], muted: false, blocked: false };
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
  const mine = ++token;
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
    if (mine !== token) return;
    clearFallback();
    audio.onended = null;
    audio.onerror = null;
    playNext();
  };
  const after = (ms: number) => {
    if (mine !== token) return;
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
  audio.play().then(
    () => {
      if (state.blocked) set({ blocked: false });
    },
    (error: unknown) => {
      if ((error as { name?: string } | null)?.name === "NotAllowedError" && !state.blocked) set({ blocked: true });
      after(clip.seconds * 1000);
    },
  );
}

/**
 * 50ms of silence, as a WAV data URI. Played inside a tap, it is what an
 * iPhone needs before it will let this element speak LATER — after a page
 * change, after a network round trip. Creating an AudioContext in the tap is
 * not enough on its own; the element itself has to have played.
 */
let silence: string | null = null;
function silentWav(): string {
  if (silence) return silence;
  const samples = 400; // 50ms at 8kHz
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence is the midpoint
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  silence = `data:audio/wav;base64,${btoa(binary)}`;
  return silence;
}
let primed = false;

export const voice = {
  /**
   * Call SYNCHRONOUSLY inside a tap, before say(). It creates the element and
   * the audio graph inside the gesture, which is what lets everything after
   * it — on this page or the next — make a sound.
   */
  unlock() {
    if (typeof window === "undefined") return;
    const audio = element();
    // Prime the element with silence inside this tap — unless a line is
    // about to be played in the same tap anyway (say() right after), which
    // replaces the source and primes it just the same.
    if (!primed && audio.paused) {
      primed = true;
      audio.src = silentWav();
      audio.play().then(
        () => {
          if (audio.src.startsWith("data:audio/wav")) audio.pause();
        },
        () => {
          // Interrupted by a real line (fine), or refused (try again next tap).
          if (audio.src.startsWith("data:audio/wav")) primed = false;
        },
      );
    }
    if (!ctx) {
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        void ctx.resume().catch(() => {});
        const source = ctx.createMediaElementSource(audio);
        // Through the loudness chain — the recorded lines were the quietest
        // and most uneven thing Talk said. The particles read the line itself.
        source.connect(voiceOutput(ctx));
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
    token += 1;
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

  /**
   * Stop, and forget what has been said. For leaving the screen for good: the
   * next visit is a new visit, not the end of this one.
   */
  forget() {
    voice.stop();
    if (state.spoken.length) set({ spoken: [] });
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
