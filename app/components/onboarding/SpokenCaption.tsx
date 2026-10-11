"use client";

import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { LOCALE_NAMES, useVoice, type Saying } from "../../lib/audio/lines";

/**
 * What Talk is saying right now, and in which language.
 *
 * Her voice is the point, but not everybody can hear it — a muted phone, a
 * noisy room, somebody hard of hearing — so every line is also on screen, and
 * the language tag makes the English-then-Wolof turn visible as a turn.
 */
export default function SpokenCaption({
  saying,
  tone = "light",
  className = "",
}: {
  saying: Saying | null;
  /** "light" on a white surface, "page" on the bone background, "dark" on Talk's own screen. */
  tone?: "light" | "page" | "dark";
  className?: string;
}) {
  // The browser refused her voice: say so, where the eye already is. Any tap
  // replays her (the screen she is on listens for it); this is the obvious
  // place to make one.
  const { blocked } = useVoice();
  return (
    <div className={`min-h-[52px] ${className}`} aria-live="polite">
      {blocked ? (
        <button
          type="button"
          className={`mb-2 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium uppercase tracking-[0.14em] ${
            tone === "dark" ? "bg-white text-[var(--dark)]" : "bg-[var(--accent)] text-white"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
          </svg>
          Tap to hear Talk
        </button>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        {saying ? (
          <motion.div
            key={`${saying.id}.${saying.locale}`}
            initial={{ y: 8, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -6, opacity: 0, filter: "blur(4px)" }}
            transition={SPRING_SOFT}
            className={`flex items-start gap-3 rounded-[18px] px-4 py-3 text-left ${
              tone === "light"
                ? "bg-[var(--background)]"
                : tone === "dark"
                  ? "bg-white/[0.06] border border-white/10"
                  : "bg-white/80 backdrop-blur-sm shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]"
            }`}
          >
            <Bars />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
                Talk · {LOCALE_NAMES[saying.locale]}
              </p>
              <p
                lang={saying.locale === "wo" ? "wo" : "en"}
                className={`mt-1 leading-snug ${tone === "dark" ? "text-[16px] text-white/90" : "text-[14px] text-[var(--foreground)]"}`}
              >
                {saying.text}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Three bars that move while she speaks. Still, for anyone who asked for less motion. */
function Bars() {
  return (
    <span aria-hidden className="mt-1 flex h-4 shrink-0 items-end gap-[3px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-[var(--accent)] motion-reduce:!h-2"
          animate={{ height: [5, 14, 7, 12, 5] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
