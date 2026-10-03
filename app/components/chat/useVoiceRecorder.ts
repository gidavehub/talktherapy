"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Record a voice note.
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
 * to be as reliable as the keyboard.
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
const MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_PREFERENCES) {
    if (type === "") return "";
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** Anything shorter is a mis-tap, not a message. */
const MIN_DURATION_SEC = 1;

/** Hard ceiling. At ~2KB/s this is about 1.2MB — sane to upload and to listen to. */
export const MAX_DURATION_SEC = 600;

export type RecorderState = "idle" | "requesting" | "recording";

export type VoiceRecording = { blob: Blob; durationSec: number };

/**
 * `start` hands the reason back rather than parking it in state here.
 *
 * Keeping an `error` field on this hook meant the composer had to mirror it
 * into its own notice through an effect, which is a cascading render and a
 * second source of truth for the same string. Returning it makes the failure
 * part of the call that caused it.
 */
export type StartResult = { ok: true } | { ok: false; reason: string };

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Resolved by the recorder's `stop` event. Held in a ref because `stop()` is
   * fire-and-forget — the final chunk arrives asynchronously afterwards, and a
   * caller awaiting a blob needs something to await.
   */
  const settleRef = useRef<((value: VoiceRecording | null) => void) | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    // Releasing the tracks is what turns off the browser's recording
    // indicator. Leaving them live looks to the user like we are still
    // listening, which for this product is unacceptable even when harmless.
    recorder?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async (): Promise<StartResult> => {
    if (recorderRef.current) return { ok: false, reason: "Already recording." };

    setElapsedSec(0);
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Cheap handsets in noisy rooms. These three are the difference
        // between a usable voice note and an unlistenable one.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      // Denied, dismissed, or no microphone — the same answer to the user
      // either way, and one they can act on.
      setState("idle");
      return {
        ok: false,
        reason: "Talk could not reach your microphone. You can still type.",
      };
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setState("idle");
      return {
        ok: false,
        reason: "Recording is not supported on this browser. You can still type.",
      };
    }

    chunksRef.current = [];
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const durationSec = (Date.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];

      const settle = settleRef.current;
      settleRef.current = null;
      teardown();
      setState("idle");
      setElapsedSec(0);

      settle?.(
        blob.size === 0 || durationSec < MIN_DURATION_SEC
          ? null
          : { blob, durationSec },
      );
    };

    // Timeslice so chunks arrive as we go. Without it a tab killed mid-record
    // loses everything, and the elapsed counter is the only thing that would
    // have suggested there was audio at all.
    recorder.start(1_000);
    setState("recording");

    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSec(seconds);
      // Stop ourselves at the ceiling rather than letting it run: this is a
      // message, and an accidental hour-long upload would cost the sender real
      // money in data.
      if (seconds >= MAX_DURATION_SEC) recorderRef.current?.stop();
    }, 250);

    return { ok: true };
  }, [teardown]);

  /**
   * Stop and hand back the recording. Resolves null when there is nothing
   * worth sending — too short, or no audio captured at all.
   */
  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      teardown();
      setState("idle");
      return null;
    }

    return new Promise<VoiceRecording | null>((resolve) => {
      settleRef.current = resolve;
      recorder.stop();
    });
  }, [teardown]);

  /** Throw the recording away. Same path as stop, with the result discarded. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      teardown();
      setState("idle");
      setElapsedSec(0);
      return;
    }
    settleRef.current = null;
    recorder.stop();
  }, [teardown]);

  return { state, elapsedSec, start, stop, cancel };
}
