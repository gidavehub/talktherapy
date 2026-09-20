"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single owner of the microphone.
 *
 * Everything that needs the user's audio goes through here: the blob's
 * amplitude, and later the companion engine's PCM feed for Gemini. Two
 * getUserMedia calls on the same page compete for the device, and on mobile
 * Safari the second one can fail outright — which is exactly the bug that
 * would have shipped if the blob kept acquiring its own stream the way the
 * old Orb did.
 *
 * The level is published as React state at roughly 15fps rather than every
 * frame. Re-rendering a tree 60 times a second to move one number is waste,
 * and the consumer smooths it anyway — `TalkBlob` lerps toward whatever it is
 * given, so a coarser input is indistinguishable once it lands.
 */

export type MicStatus = "idle" | "requesting" | "live" | "denied" | "unsupported" | "error";

export type AudioLevel = {
  /** 0..1, smoothed RMS. */
  level: number;
  /**
   * Fundamental frequency mapped to 0..1 across the speech range, or 0 when
   * no periodic pitch is detectable (silence, consonants, noise).
   */
  pitch: number;
  /** Raw f0 in Hz, for anything that needs the real number. */
  pitchHz: number;
  status: MicStatus;
  /** The live stream, for the AI engine. Null until start() succeeds. */
  stream: MediaStream | null;
  /** Per-frame amplitude for anything that cannot wait for a re-render. */
  levelRef: React.RefObject<number>;
  pitchRef: React.RefObject<number>;
  start: () => Promise<void>;
  stop: () => void;
};

/** How often the React-visible value is refreshed. */
const PUBLISH_MS = 66;
/** Below this, treat it as silence — room tone should not wobble the blob. */
const NOISE_FLOOR = 0.012;
/**
 * Speech f0 range. Roughly a low male voice to a high female one; anything
 * outside is almost certainly noise or a harmonic misfire rather than pitch.
 */
const MIN_HZ = 70;
const MAX_HZ = 400;
/** Autocorrelation below this is not a confident periodicity — report no pitch. */
const PITCH_CONFIDENCE = 0.55;

/**
 * Fundamental frequency by autocorrelation.
 *
 * Chosen over an FFT peak because the loudest bin in speech is frequently a
 * harmonic rather than f0, which makes a naive spectral peak jump an octave
 * mid-vowel — the blob would twitch on timbre instead of tracking the voice.
 * Autocorrelation finds the repeat period directly and is stable across it.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), buf.length - 1);

  let bestLag = -1;
  let bestCorr = 0;
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (energy <= 0) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    // Normalised so long lags are not penalised for overlapping less.
    corr /= buf.length - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag < 0) return 0;
  const normalised = bestCorr / (energy / buf.length);
  if (normalised < PITCH_CONFIDENCE) return 0;
  return sampleRate / bestLag;
}

export function useAudioLevel(): AudioLevel {
  const [level, setLevel] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [pitchHz, setPitchHz] = useState(0);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const levelRef = useRef(0);
  const pitchRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastPublish = useRef(0);
  // Float rather than byte: 8-bit quantisation is too coarse for reliable
  // autocorrelation, and the pitch estimate jitters badly on quiet speech.
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    // Closing can reject if the context is already closed — the page may be
    // unloading. Nothing useful to do about it either way.
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;

    levelRef.current = 0;
    pitchRef.current = 0;
    setLevel(0);
    setPitch(0);
    setPitchHz(0);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return; // already live

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = media;
      setStream(media);

      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;

      // Browsers start the context suspended until a user gesture. start() is
      // expected to be called from a click, so this usually resolves at once.
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(media);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      setStatus("live");

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const a = analyserRef.current;
        const buf = bufRef.current;
        if (!a || !buf) return;

        a.getFloatTimeDomainData(buf);

        // RMS over the waveform, not an average of the FFT bins. Time-domain
        // RMS tracks loudness; a frequency average also rises when the timbre
        // changes at constant volume, which makes the blob react to vowels
        // rather than to speech.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);

        const gated = rms < NOISE_FLOOR ? 0 : (rms - NOISE_FLOOR) / (1 - NOISE_FLOOR);
        // Speech RMS rarely exceeds ~0.3, so scale into a usable 0..1 before
        // the curve — otherwise the blob barely moves at normal volume.
        const scaled = Math.min(1, gated * 3.2);
        levelRef.current = scaled;

        // Pitch only while there is enough signal to be periodic. Running it
        // on silence returns confident nonsense.
        let hz = 0;
        if (scaled > 0.06) {
          hz = detectPitch(buf, ctx.sampleRate);
        }
        // Hold the last pitch briefly through consonants rather than snapping
        // to zero between every syllable, which reads as flicker.
        if (hz > 0) {
          const norm = (hz - MIN_HZ) / (MAX_HZ - MIN_HZ);
          pitchRef.current = Math.min(1, Math.max(0, norm));
        } else {
          pitchRef.current *= 0.92;
        }

        const now = performance.now();
        if (now - lastPublish.current >= PUBLISH_MS) {
          lastPublish.current = now;
          setLevel(scaled);
          setPitch(pitchRef.current);
          setPitchHz(hz);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useAudioLevel] microphone unavailable:", e);
      }
    }
  }, []);

  // Tracks keep the browser's recording indicator lit, so they must be
  // released when the component goes — not left to GC.
  useEffect(() => stop, [stop]);

  return { level, pitch, pitchHz, status, stream, levelRef, pitchRef, start, stop };
}
