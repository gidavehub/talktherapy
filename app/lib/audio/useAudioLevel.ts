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
  status: MicStatus;
  /** The live stream, for the AI engine. Null until start() succeeds. */
  stream: MediaStream | null;
  /** Per-frame amplitude for anything that cannot wait for a re-render. */
  levelRef: React.RefObject<number>;
  start: () => Promise<void>;
  stop: () => void;
};

/** How often the React-visible value is refreshed. */
const PUBLISH_MS = 66;
/** Below this, treat it as silence — room tone should not wobble the blob. */
const NOISE_FLOOR = 0.012;

export function useAudioLevel(): AudioLevel {
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const levelRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastPublish = useRef(0);
  // Explicitly ArrayBuffer-backed: getByteTimeDomainData rejects a view over
  // SharedArrayBuffer, which is what a bare `Uint8Array` widens to in the
  // current lib types.
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

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
    setLevel(0);
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
      bufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      setStatus("live");

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const a = analyserRef.current;
        const buf = bufRef.current;
        if (!a || !buf) return;

        a.getByteTimeDomainData(buf);

        // RMS over the waveform, not an average of the FFT bins. Time-domain
        // RMS tracks loudness; a frequency average also rises when the timbre
        // changes at constant volume, which makes the blob react to vowels
        // rather than to speech.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);

        const gated = rms < NOISE_FLOOR ? 0 : (rms - NOISE_FLOOR) / (1 - NOISE_FLOOR);
        // Speech RMS rarely exceeds ~0.3, so scale into a usable 0..1 before
        // the curve — otherwise the blob barely moves at normal volume.
        const scaled = Math.min(1, gated * 3.2);
        levelRef.current = scaled;

        const now = performance.now();
        if (now - lastPublish.current >= PUBLISH_MS) {
          lastPublish.current = now;
          setLevel(scaled);
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

  return { level, status, stream, levelRef, start, stop };
}
