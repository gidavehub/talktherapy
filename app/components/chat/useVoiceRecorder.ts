"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WAVEFORM_BARS } from "../../lib/models";

/**
 * Record a voice note — the way WhatsApp does: a live waveform while you
 * speak, pause and carry on, listen back before you send.
 *
 * Deliberately NOT `app/lib/audio/capture.ts`. That one is a voice-activity
 * detector: it listens continuously, slices the stream at silence, and hands
 * raw PCM to the AI conversation. A voice note is the opposite problem — one
 * deliberate recording, started and stopped by a person, that has to come out
 * as a compressed file small enough to upload on a Gambian mobile connection.
 * MediaRecorder gives us Opus in a container for roughly 2KB a second; PCM
 * would be fifty times that.
 *
 * Voice notes are a first-class way to use this product, not a flourish: many
 * of the people Talk is for cannot read or write comfortably, so this path has
 * to be as reliable as the keyboard. Which is why a recording the phone cuts
 * off (a call coming in, another app taking the microphone) is KEPT, as a
 * draft they can still send — never thrown away under them.
 */

/**
 * Container preference, best first.
 *
 * Opus in WebM is the small one and works in Chrome, which is the bulk of
 * Android here. Safari only does MP4/AAC, and only in recent versions. The
 * empty string is the "let the browser decide" escape hatch — a recording in
 * an unexpected container still plays back in the browser that made it, which
 * beats refusing to record.
 */
const MIME_PREFERENCES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_PREFERENCES) {
    if (type === "") return "";
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** Anything shorter is a mis-tap, not a message. */
const MIN_DURATION_MS = 1000;

/** Hard ceiling. At ~2KB/s this is about 1.2MB — sane to upload and to listen to. */
export const MAX_DURATION_SEC = 600;

/** How often the microphone's level is sampled for the live waveform. */
const LEVEL_EVERY_MS = 70;

/** Live bars kept for drawing; older ones have scrolled off the left. */
const LIVE_BARS = 64;

/**
 * idle → requesting (asking for the microphone) → recording ⇄ paused →
 * stopped (the phone ended it; a draft remains) → idle once sent or binned.
 */
export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped";

export type VoiceRecording = { blob: Blob; durationSec: number; waveform: number[] };

/**
 * `start` hands the reason back rather than parking it in state here, so the
 * failure is part of the call that caused it.
 */
export type StartResult = { ok: true } | { ok: false; reason: string };

/** A speaking voice is roughly -50 to -10 dB; that range fills the bar. */
function levelOf(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 52) / 42));
}

/** Every sample taken, squeezed into the stored bars (peak per bar, 0–100). */
function toWaveform(samples: number[]): number[] {
  if (!samples.length) return [];
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i += 1) {
    const from = Math.floor((i * samples.length) / WAVEFORM_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / WAVEFORM_BARS));
    let peak = 0;
    for (let j = from; j < to && j < samples.length; j += 1) peak = Math.max(peak, samples[j]);
    bars.push(Math.round(peak * 100));
  }
  return bars;
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  /** The most recent levels, 0–1, newest last — the live waveform. */
  const [levels, setLevels] = useState<number[]>([]);
  /** The recording so far, playable, while paused or stopped. */
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  /** The phone ended the recording itself (a call, another app). */
  const [interrupted, setInterrupted] = useState(false);
  /** The shape of the recording so far, while paused or stopped (0–100). */
  const [draftWaveform, setDraftWaveform] = useState<number[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const samplesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Time recorded before the current stretch (pauses excluded). */
  const banked = useRef(0);
  /** When the current stretch of recording began; null while paused. */
  const stretchFrom = useRef<number | null>(null);
  /** A final recording waiting to be collected (after the phone stopped it). */
  const finalRef = useRef<VoiceRecording | null>(null);
  /** Resolved by the recorder's `stop` event. */
  const settleRef = useRef<((value: VoiceRecording | null) => void) | null>(null);
  /** Resolved by the next `dataavailable` (for the draft when pausing). */
  const dataWaiter = useRef<(() => void) | null>(null);
  const draftRef = useRef<string | null>(null);

  const elapsedNow = useCallback(
    () => banked.current + (stretchFrom.current === null ? 0 : Date.now() - stretchFrom.current),
    [],
  );

  const setDraft = useCallback((url: string | null) => {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current);
    draftRef.current = url;
    setDraftUrl(url);
  }, []);

  const release = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Releasing the tracks is what turns off the browser's recording
    // indicator. Leaving them live looks to the user like we are still
    // listening, which for this product is unacceptable even when harmless.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  const reset = useCallback(() => {
    release();
    chunksRef.current = [];
    samplesRef.current = [];
    banked.current = 0;
    stretchFrom.current = null;
    finalRef.current = null;
    setDraft(null);
    setDraftWaveform([]);
    setLevels([]);
    setElapsedMs(0);
    setInterrupted(false);
    setState("idle");
  }, [release, setDraft]);

  useEffect(
    () => () => {
      release();
      if (draftRef.current) URL.revokeObjectURL(draftRef.current);
    },
    [release],
  );

  const recording = useCallback((): VoiceRecording | null => {
    const durationMs = elapsedNow();
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm" });
    if (blob.size === 0 || durationMs < MIN_DURATION_MS) return null;
    return { blob, durationSec: durationMs / 1000, waveform: toWaveform(samplesRef.current) };
  }, [elapsedNow]);

  const start = useCallback(async (): Promise<StartResult> => {
    if (recorderRef.current) return { ok: false, reason: "Already recording." };
    reset();
    setState("requesting");

    // The level meter first, inside the tap: a phone only lets audio start
    // from a touch, and an AudioContext made after the await below would
    // begin suspended.
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
    } catch {
      context = null;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Cheap handsets in noisy rooms. These three are the difference
        // between a usable voice note and an unlistenable one.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      void context?.close().catch(() => {});
      setState("idle");
      const name = (error as { name?: string } | null)?.name;
      return {
        ok: false,
        reason:
          name === "NotAllowedError"
            ? "Talk is not allowed to use your microphone. Allow it in your browser's settings for this site, then try again."
            : name === "NotFoundError"
              ? "No microphone was found on this device. You can still type."
              : "Talk could not reach your microphone — another app may be using it. You can still type.",
      };
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
      setState("idle");
      return { ok: false, reason: "Recording is not supported on this browser. You can still type." };
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    contextRef.current = context;
    if (context) {
      try {
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        void context.resume().catch(() => {});
      } catch {
        analyserRef.current = null;
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
      dataWaiter.current?.();
      dataWaiter.current = null;
    };

    recorder.onstop = () => {
      // Binned already, and maybe a new recording begun: nothing here is
      // this recorder's any more.
      if (recorderRef.current !== recorder) {
        settleRef.current?.(null);
        settleRef.current = null;
        return;
      }
      banked.current = elapsedNow();
      stretchFrom.current = null;
      const result = recording();
      const settle = settleRef.current;
      settleRef.current = null;
      release();
      if (settle) {
        settle(result);
        return;
      }
      // Nobody asked it to stop: the phone did. Keep what was said, as a
      // draft to listen to, send or bin.
      if (result) {
        finalRef.current = result;
        setDraft(URL.createObjectURL(result.blob));
        setDraftWaveform(result.waveform);
        setElapsedMs(banked.current);
        setInterrupted(true);
        setState("stopped");
      } else {
        reset();
      }
    };

    // A track that ends (another app took the microphone) ends the recording.
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
    });

    // Timeslice so chunks arrive as we go. Without it a tab killed mid-record
    // loses everything.
    recorder.start(1_000);
    stretchFrom.current = Date.now();
    setState("recording");

    const buffer = new Float32Array(1024);
    timerRef.current = setInterval(() => {
      if (stretchFrom.current === null) return;
      const ms = elapsedNow();
      setElapsedMs(ms);
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
        level = levelOf(Math.sqrt(sum / buffer.length));
      }
      samplesRef.current.push(level);
      setLevels((prev) => (prev.length >= LIVE_BARS ? [...prev.slice(1), level] : [...prev, level]));
      // Stop ourselves at the ceiling: this is a message, and an accidental
      // hour-long upload would cost the sender real money in data.
      if (ms >= MAX_DURATION_SEC * 1000 && recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, LEVEL_EVERY_MS);

    return { ok: true };
  }, [elapsedNow, recording, release, reset, setDraft]);

  /** Pause, and make what has been said so far playable. */
  const pause = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch {
      return; // Pausing is not supported here; keep recording.
    }
    banked.current = elapsedNow();
    stretchFrom.current = null;
    setElapsedMs(banked.current);
    setDraftWaveform(toWaveform(samplesRef.current));
    setState("paused");
    // Flush the last chunk so the draft includes the final words.
    await new Promise<void>((resolve) => {
      dataWaiter.current = resolve;
      try {
        recorder.requestData();
      } catch {
        resolve();
      }
      setTimeout(resolve, 600);
    });
    if (chunksRef.current.length) {
      setDraft(URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })));
    }
  }, [elapsedNow, setDraft]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    setDraft(null);
    recorder.resume();
    stretchFrom.current = Date.now();
    setState("recording");
  }, [setDraft]);

  /**
   * Stop and hand back the recording. Resolves null when there is nothing
   * worth sending — too short, or no audio captured at all.
   */
  const finish = useCallback(async (): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      const kept = finalRef.current;
      reset();
      return kept;
    }
    const result = await new Promise<VoiceRecording | null>((resolve) => {
      settleRef.current = resolve;
      recorder.stop();
    });
    reset();
    return result;
  }, [reset]);

  /** Throw the recording away. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    reset();
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [reset]);

  return {
    state,
    elapsedMs,
    levels,
    draftUrl,
    interrupted,
    draftWaveform,
    start,
    pause,
    resume,
    finish,
    cancel,
  };
}
