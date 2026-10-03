"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconPause, IconPlay } from "../ui/icons";
import { Spinner } from "../ui/Feedback";
import { chatMediaUrl, formatDuration } from "../../lib/chat";

/**
 * A voice note: play/pause, a scrubbable bar, and the time.
 *
 * The audio is fetched on first play rather than on mount. A thread of twenty
 * voice notes would otherwise pull every one of them down the moment it
 * opened, which on a metered mobile connection is somebody's money.
 *
 * The bars are decorative, not a real waveform — drawing a true one means
 * decoding the whole file through an AudioContext before anything can play,
 * which is slow on a cheap handset and pointless when the bar's job is to show
 * progress. They are generated from the message id so each note looks
 * consistently like itself rather than reshuffling on every render.
 */

const BAR_COUNT = 34;

/**
 * Deterministic pseudo-waveform from the message id.
 *
 * A seeded hash, not Math.random(): the same note must draw the same shape
 * every time it renders, or scrolling the thread makes the bars dance.
 */
function barHeights(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  const bars: number[] = [];
  let value = Math.abs(hash) || 1;
  for (let i = 0; i < BAR_COUNT; i += 1) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    // 0.25..1 — never zero, so the bar always reads as a bar.
    bars.push(0.25 + (value % 1000) / 1000 * 0.75);
  }
  return bars;
}

export default function VoiceNotePlayer({
  messageId,
  mediaPath,
  durationSec,
  onDark,
}: {
  messageId: string;
  mediaPath: string;
  /** Recorded length. Used until the file loads and reports its own. */
  durationSec: number | null;
  onDark: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSec ?? 0);

  const bars = barHeights(messageId);

  // Revoke the object URL on unmount. These are held by the document until
  // revoked, so a long session scrolling a media-heavy thread would otherwise
  // leak every blob it ever decoded.
  useEffect(() => {
    return () => {
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
      audio.preload = "metadata";
      audio.addEventListener("timeupdate", () => setPosition(audio.currentTime));
      audio.addEventListener("loadedmetadata", () => {
        // A WebM blob from MediaRecorder often reports Infinity for duration,
        // which is why the recorded length is kept on the message at all.
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setLength(audio.duration);
        }
      });
      audio.addEventListener("ended", () => {
        setPlaying(false);
        setPosition(0);
        audio.currentTime = 0;
      });
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("play", () => setPlaying(true));

      audioRef.current = audio;
      return audio;
    } catch {
      // Expected causes: the object is gone, or storage.rules refused it.
      // Shown as a failed note rather than a thrown error — one unplayable
      // voice note must not take the thread down with it.
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
      await audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }, [ensureAudio]);

  /** Scrub. Only meaningful once the file is loaded and has a known length. */
  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || !length) return;
      const next = Math.min(length, Math.max(0, fraction * length));
      audio.currentTime = next;
      setPosition(next);
    },
    [length],
  );

  const progress = length > 0 ? Math.min(1, position / length) : 0;
  const remaining = Math.max(0, length - position);

  const barOn = onDark ? "bg-white" : "bg-[var(--dark)]";
  const barOff = onDark ? "bg-white/30" : "bg-black/15";

  return (
    <div className="flex items-center gap-3 min-w-0">
      <motion.button
        type="button"
        onClick={() => void toggle()}
        whileTap={{ scale: 0.92 }}
        transition={SPRING_SNAP}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          onDark
            ? "bg-white text-[var(--dark)] hover:bg-white/90"
            : "bg-[var(--dark)] text-white hover:bg-[var(--dark-soft)]"
        }`}
      >
        {loading ? (
          <Spinner size={16} />
        ) : playing ? (
          <IconPause size={16} />
        ) : (
          <IconPlay size={16} />
        )}
      </motion.button>

      <div className="min-w-0 flex-1">
        {/*
          A slider rather than a bare div: a voice note is sometimes the whole
          message, so it has to be reachable and scrubbable from the keyboard
          like any other control.
        */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(length)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={formatDuration(position)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") seek((position + 5) / (length || 1));
            if (event.key === "ArrowLeft") seek((position - 5) / (length || 1));
          }}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            seek((event.clientX - box.left) / box.width);
          }}
          className="flex items-center gap-[3px] h-9 cursor-pointer outline-none focus-visible:opacity-80"
        >
          {bars.map((height, index) => (
            <span
              key={index}
              className={`flex-1 rounded-full transition-colors ${
                index / BAR_COUNT <= progress ? barOn : barOff
              }`}
              style={{ height: `${Math.round(height * 28)}px` }}
            />
          ))}
        </div>

        <p
          className={`mt-0.5 text-[11px] tabular-nums ${
            onDark ? "text-white/60" : "text-[var(--muted)]"
          }`}
        >
          {failed
            ? "Could not load this voice note"
            : playing || position > 0
              ? formatDuration(remaining)
              : formatDuration(length)}
        </p>
      </div>
    </div>
  );
}
