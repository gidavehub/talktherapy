"use client";

import { useEffect } from "react";
import { voice } from "../lib/audio/lines";

/**
 * Talk speaks the moment her screen opens — no "tap to hear" anywhere.
 *
 * A browser lets a page make a sound only after the person has touched it.
 * So the FIRST touch anywhere on the site — the landing page, the menu, a
 * sign-in field, anything — quietly unlocks her voice for the rest of the
 * visit (voice.unlock plays a moment of silence inside that touch, which is
 * what an iPhone needs). By the time anybody reaches Talk, she can just talk.
 *
 * Mounted once, in the root layout. Renders nothing.
 */
export default function VoiceUnlock() {
  useEffect(() => {
    const unlock = () => voice.unlock();
    const opts = { once: true, capture: true } as const;
    document.addEventListener("pointerdown", unlock, opts);
    document.addEventListener("keydown", unlock, opts);
    return () => {
      document.removeEventListener("pointerdown", unlock, opts);
      document.removeEventListener("keydown", unlock, opts);
    };
  }, []);
  return null;
}
