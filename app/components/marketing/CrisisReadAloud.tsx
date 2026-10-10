"use client";

import SpokenCaption from "../onboarding/SpokenCaption";
import { useVoice, voice } from "../../lib/audio/lines";

const LINES = ["crisis-call", "crisis-fire", "crisis-young", "crisis-alone"];

/**
 * The urgent-help page, out loud — for somebody who cannot read it.
 *
 * Recorded once (scripts/build-voice-lines.mjs), not generated: this page is
 * open to anybody, signed in or not, and live read-aloud needs an account. It
 * is also the page where nothing may wait on a model. English, then Wolof.
 *
 * A small island on a page that is otherwise plain server-rendered HTML, so
 * the numbers themselves never wait on any of this.
 */
export default function CrisisReadAloud() {
  const heard = useVoice();
  const reading = Boolean(heard.saying && LINES.includes(heard.saying.id));

  return (
    <div className="mt-6 max-w-[620px]">
      <button
        type="button"
        onClick={() => {
          if (reading) {
            voice.stop();
            return;
          }
          // Inside the tap: that is what lets the page make a sound.
          voice.unlock();
          voice.say(LINES);
        }}
        aria-pressed={reading}
        className={`inline-flex h-11 items-center gap-2 rounded-full border px-5 text-[12px] uppercase tracking-[0.14em] font-medium transition-colors ${
          reading
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--foreground)]/30 hover:bg-black/5"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
        </svg>
        {reading ? "Stop" : "Hear this page — English, then Wolof"}
      </button>
      {reading ? <SpokenCaption saying={heard.saying} tone="page" className="mt-4" /> : null}
    </div>
  );
}
