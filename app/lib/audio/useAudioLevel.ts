"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND_COUNT, VoiceAnalyser, type AudioFeed } from "./analysis";

/**
 * Single owner of the microphone.
 *
 * Everything that needs the user's audio goes through here: the blob's
 * amplitude, and the utterance recorder that feeds the companion. Two
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

// Moved to ./analysis so Talk's own voice drives the blob through the same
// processing as the microphone. Re-exported for existing importers.
export { BAND_COUNT, type AudioFeed } from "./analysis";

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
  /** Raw RMS before gating and scaling. Diagnostic. */
  rms: number;
  /**
   * Live state of the capture chain. Exists because "the meter is flat" has
   * several completely different causes — a suspended context, a muted track,
   * a device that reports live but sends silence — and they are
   * indistinguishable from the outside.
   */
  debug: {
    contextState: string;
    sampleRate: number;
    trackLabel: string;
    trackMuted: boolean;
    trackEnabled: boolean;
    trackState: string;
    frames: number;
  };
  status: MicStatus;
  /** The live stream, for the AI engine. Null until start() succeeds. */
  stream: MediaStream | null;
  /** Per-frame amplitude for anything that cannot wait for a re-render. */
  levelRef: React.RefObject<number>;
  pitchRef: React.RefObject<number>;
  /** Everything a visual needs, as refs, for per-frame reading. */
  feed: AudioFeed;
  /**
   * The live audio graph, for anything else that needs the microphone — the
   * utterance recorder attaches here rather than opening a second stream.
   * Null until start() succeeds.
   */
  graph: () => MicGraph | null;
  start: () => Promise<void>;
  stop: () => void;
};

export type MicGraph = { ctx: AudioContext; source: MediaStreamAudioSourceNode };

/** How often the React-visible value is refreshed. */
const PUBLISH_MS = 66;

const IDLE_DEBUG = {
  contextState: "-",
  sampleRate: 0,
  trackLabel: "-",
  trackMuted: false,
  trackEnabled: false,
  trackState: "-",
  frames: 0,
};

export function useAudioLevel(): AudioLevel {
  const [level, setLevel] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [pitchHz, setPitchHz] = useState(0);
  const [rms, setRms] = useState(0);
  const [debug, setDebug] = useState(IDLE_DEBUG);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const levelRef = useRef(0);
  const pitchRef = useRef(0);
  const bandsRef = useRef<Float32Array>(new Float32Array(BAND_COUNT));
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<VoiceAnalyser | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastPublish = useRef(0);
  const framesRef = useRef(0);

  // Refs are stable for the component's lifetime, so this object is too — a
  // consumer can hold it in an effect without resubscribing.
  const feed = useMemo<AudioFeed>(() => ({ levelRef, pitchRef, bandsRef }), []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);

    analyserRef.current?.dispose();
    analyserRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;

    // Closing can reject if the context is already closed — the page may be
    // unloading. Nothing useful to do about it either way.
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;

    levelRef.current = 0;
    pitchRef.current = 0;
    bandsRef.current.fill(0);
    setRms(0);
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
      // The context is created BEFORE awaiting the microphone prompt, so it is
      // born inside the user's click. Created after the await, Safari starts it
      // suspended and Talk's voice would never play.
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const resumed = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();

      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation is what lets the microphone stay open while
          // Talk is speaking without Talk hearing herself.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      await resumed.catch(() => {});

      // stop() may have run while the permission prompt was open.
      if (ctxRef.current !== ctx) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = media;
      setStream(media);

      const source = ctx.createMediaStreamSource(media);
      sourceRef.current = source;
      analyserRef.current = new VoiceAnalyser(ctx, source, feed);

      setStatus("live");

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const analyser = analyserRef.current;
        if (!analyser) return;

        // Autoplay policy can suspend the context again after the gesture
        // that created it (tab hidden, device change). A suspended context
        // yields silence rather than an error, so it has to be re-resumed
        // rather than assumed live.
        const c = ctxRef.current;
        if (c && c.state === "suspended") void c.resume().catch(() => {});

        const reading = analyser.update();
        framesRef.current += 1;

        const now = performance.now();
        if (now - lastPublish.current >= PUBLISH_MS) {
          lastPublish.current = now;
          setLevel(reading.level);
          setPitch(pitchRef.current);
          setPitchHz(reading.hz);
          setRms(reading.rms);
          const track = streamRef.current?.getAudioTracks()[0];
          setDebug({
            contextState: ctxRef.current?.state ?? "-",
            sampleRate: ctxRef.current?.sampleRate ?? 0,
            trackLabel: track?.label ?? "-",
            trackMuted: track?.muted ?? false,
            trackEnabled: track?.enabled ?? false,
            trackState: track?.readyState ?? "-",
            frames: framesRef.current,
          });
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useAudioLevel] microphone unavailable:", e);
      }
    }
  }, [feed]);

  // Tracks keep the browser's recording indicator lit, so they must be
  // released when the component goes — not left to GC.
  useEffect(() => stop, [stop]);

  const graph = useCallback((): MicGraph | null => {
    const ctx = ctxRef.current;
    const source = sourceRef.current;
    return ctx && source ? { ctx, source } : null;
  }, []);

  return { level, pitch, pitchHz, rms, debug, status, stream, levelRef, pitchRef, feed, graph, start, stop };
}
