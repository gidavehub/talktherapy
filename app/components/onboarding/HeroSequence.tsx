"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import { voice } from "../../lib/audio/lines";
import { isSettled } from "../../lib/routing";

/**
 * The way in: one tap, and Talk takes over.
 *
 * The tap does three things, in this order, all inside it:
 *   1. unlocks sound — no browser lets a page speak before the person has
 *      touched it, and only audio started inside that touch counts;
 *   2. starts her speaking — "Welcome to Talk Therapy", English then Wolof;
 *   3. takes them straight to the screen with the particles, signed in or
 *      not, where she carries on without another tap and brings up whatever
 *      comes next — sign-in, then the payment — as she says it.
 *
 * Her voice survives the move because the player belongs to the page, not to
 * this button (see lib/audio/lines).
 *
 * Somebody already set up — onboarded, or a provider — gets the ordinary
 * button to where they belong (`fallback`), and is never sent through the
 * door again.
 */
export default function HeroSequence({ fallback }: { fallback: ReactNode }) {
  const router = useRouter();
  const { user, profile, ready } = useAuth();

  // The next screen is fetched ahead of the tap, so it is there the moment
  // she starts speaking.
  useEffect(() => {
    router.prefetch("/therapy");
  }, [router]);

  if (ready && profile && isSettled(profile)) return <>{fallback}</>;

  // Synchronous on purpose — see above.
  const begin = () => {
    voice.unlock();
    voice.say(user ? ["welcome"] : ["welcome", "sign-in", "how"]);
    router.push("/therapy");
  };

  return (
    <div className="flex flex-col items-center gap-3 px-5 md:px-0">
      <motion.button
        type="button"
        onClick={begin}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        transition={SPRING_SNAP}
        aria-label="Begin with Talk — she will speak to you"
        className="inline-flex h-14 items-center gap-3 rounded-full bg-[var(--accent)] pl-7 pr-2 text-[13px] font-medium uppercase tracking-[0.12em] text-white shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)] transition-colors hover:bg-[var(--accent-soft)]"
      >
        Begin with Talk
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
          </svg>
        </span>
      </motion.button>
      <p className="text-center text-[12px] leading-relaxed text-[var(--muted)]">
        Tap, and Talk will speak to you — in English, then in Wolof.
      </p>
    </div>
  );
}
