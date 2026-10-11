"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconAlert, IconPause, IconPlay, IconRetry } from "../ui/icons";
import { Spinner } from "../ui/Feedback";
import { chatMediaUrl, formatDuration } from "../../lib/chat";
import Waveform, { resample } from "./Waveform";

/**
 * A voice note, played the way WhatsApp plays one: the note's own waveform
 * fills in as it plays, a dot you can drag to any point, and a speed button.
 *
 * The audio is fetched on first play rather than on mount. A thread of twenty
 * voice notes would otherwise pull every one of them down the moment it
 * opened, which on a metered mobile connection is somebody's money. Your own
 * notes need nothing fetched at all — they are still in memory (chatMediaUrl).
 *
 * The waveform is the one recorded with the note. Notes from before that was
 * kept get a stand-in shape seeded from the message id, so each still looks
 * consistently like itself.
 */

const BAR_COUNT = 36;
const SPEEDS = [1, 1.5, 2];

function standIn(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  let value = Math.abs(hash) || 1;
  for (let i = 0; i < BAR_COUNT; i += 1) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    bars.push(25 + ((value % 1000) / 1000) * 75);
  }
  return bars;
}

/** A sending note: how far the upload is, or that it failed. */
export type UploadState = { progress: number; failed: boolean; onRetry: () => void };

export default function VoiceNotePlayer({
  messageId,
  mediaPath,
  durationSec,
  waveform,
  onDark,
  upload,
}: {
  messageId: string;
  mediaPath: string;
  /** Recorded length. A WebM recording often cannot say its own. */
  durationSec: number | null;
  waveform?: number[] | null;
  onDark: boolean;
  upload?: UploadState | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const frame = useRef<number | null>(null);
  const scrubbing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSec ?? 0);
  const [speed, setSpeed] = useState(1);

  const bars = waveform?.length ? resample(waveform, BAR_COUNT) : standIn(messageId);

  // Revoke the object URL on unmount: it is held by the document until it is.
  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const ensureAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const url = await chatMediaUrl(mediaPath);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) setLength(audio.duration);
      });
      const stopFrames = () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
      };
      // Follow the playhead every frame — timeupdate alone moves the dot in jumps.
      const follow = () => {
        if (!scrubbing.current) setPosition(audio.currentTime);
        frame.current = requestAnimationFrame(follow);
      };
      // And on timeupdate too: where frames are not drawn (a background
      // tab), the time still moves.
      audio.addEventListener("timeupdate", () => {
        if (!scrubbing.current) setPosition(audio.currentTime);
      });
      audio.addEventListener("ended", () => {
        stopFrames();
        setPlaying(false);
        setPosition(0);
        audio.currentTime = 0;
      });
      audio.addEventListener("pause", () => {
        stopFrames();
        setPlaying(false);
      });
      audio.addEventListener("play", () => {
        setPlaying(true);
        stopFrames();
        frame.current = requestAnimationFrame(follow);
      });
      audioRef.current = audio;
      return audio;
    } catch (error) {
      // The object is gone, or storage.rules refused it. One unplayable note
      // must not take the thread down with it.
      console.error("voice note", mediaPath, error);
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [mediaPath]);

  const toggle = useCallback(async () => {
    const audio = await ensureAudio();
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = speed;
      await audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }, [ensureAudio, speed]);

  const seekTo = useCallback(
    (fraction: number) => {
      const next = Math.min(length, Math.max(0, fraction * length));
      setPosition(next);
      const audio = audioRef.current;
      if (audio) audio.currentTime = next;
    },
    [length],
  );

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = length > 0 ? Math.min(1, position / length) : 0;
  const sending = upload && !upload.failed && upload.progress < 1;

  const played = onDark ? "#FFFFFF" : "var(--accent)";
  const unplayed = onDark ? "rgba(255,255,255,0.32)" : "rgba(10,10,10,0.2)";

  /** Drag along the bars to scrub, like dragging WhatsApp's dot. */
  const scrubFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return (event.clientX - box.left) / box.width;
  };

  let button: React.ReactNode;
  if (upload?.failed) {
    button = (
      <motion.button
        type="button"
        onClick={upload.onRetry}
        whileTap={{ scale: 0.9 }}
        transition={SPRING_SNAP}
        aria-label="Not sent. Send again"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--danger)] text-white"
      >
        <IconRetry size={18} />
      </motion.button>
    );
  } else if (sending) {
    const r = 19;
    const c = 2 * Math.PI * r;
    button = (
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center" role="progressbar" aria-label="Sending" aria-valuenow={Math.round(upload.progress * 100)}>
        <svg width="44" height="44" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
          <circle cx="22" cy="22" r={r} fill="none" stroke={unplayed} strokeWidth="3" />
          <motion.circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={played}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            animate={{ strokeDashoffset: c * (1 - Math.max(0.06, upload.progress)) }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        </svg>
        <span className={onDark ? "text-white" : "text-[var(--dark)]"}>
          <Spinner size={14} />
        </span>
      </div>
    );
  } else {
    button = (
      <motion.button
        type="button"
        onClick={() => void toggle()}
        whileTap={{ scale: 0.9 }}
        transition={SPRING_SNAP}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
          onDark ? "bg-[var(--surface)] text-[var(--dark)]" : "bg-[var(--dark)] text-white"
        }`}
      >
        {loading ? <Spinner size={16} /> : playing ? <IconPause size={17} /> : <IconPlay size={17} />}
      </motion.button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {button}

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(length)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={formatDuration(position)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") seekTo((position + 5) / (length || 1));
            if (event.key === "ArrowLeft") seekTo((position - 5) / (length || 1));
          }}
          onPointerDown={(event) => {
            if (!audioRef.current && !length) return;
            scrubbing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekTo(scrubFrom(event));
          }}
          onPointerMove={(event) => {
            if (scrubbing.current) seekTo(scrubFrom(event));
          }}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
          }}
          className="relative h-8 cursor-pointer touch-none outline-none focus-visible:opacity-80"
        >
          <Waveform bars={bars} progress={progress} played={played} unplayed={unplayed} height={26} />
          {/* The dot: where it is, and the thing to drag. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
            style={{ left: `${progress * 100}%`, background: onDark ? "#FFFFFF" : "var(--accent)" }}
          />
        </div>

        <div className={`mt-0.5 flex items-center justify-between text-[11px] tabular-nums ${onDark ? "text-white/60" : "text-[var(--muted)]"}`}>
          <span>
            {upload?.failed ? (
              <span className="inline-flex items-center gap-1 text-[var(--danger)]">
                <IconAlert size={11} /> Not sent
              </span>
            ) : failed ? (
              "Could not load this voice note"
            ) : playing || position > 0 ? (
              formatDuration(position)
            ) : (
              formatDuration(length)
            )}
          </span>
          {playing || speed !== 1 ? (
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${speed} times. Change it`}
              className={`rounded-full px-1.5 py-px text-[10.5px] font-medium ${onDark ? "bg-white/15 text-white" : "bg-[var(--dark)]/[.07] text-[var(--foreground)]"}`}
            >
              {speed}×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
