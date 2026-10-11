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
 * Not in Messages or on a call: a touch there may be the one that starts a
 * voice note or a microphone, and a phone that is handed Talk's silence in
 * the same touch can cut the recording off. Nothing there needs her voice;
 * the next touch anywhere else unlocks it.
 *
 * Mounted once, in the root layout. Renders nothing.
 */
function usesMicrophone(pathname: string) {
  return pathname.startsWith("/chats") || pathname.startsWith("/call");
}

export default function VoiceUnlock() {
  useEffect(() => {
    const opts = { capture: true } as const;
    const unlock = () => {
      if (usesMicrophone(window.location.pathname)) return;
      voice.unlock();
      document.removeEventListener("pointerdown", unlock, opts);
      document.removeEventListener("keydown", unlock, opts);
    };
    document.addEventListener("pointerdown", unlock, opts);
    document.addEventListener("keydown", unlock, opts);
    return () => {
      document.removeEventListener("pointerdown", unlock, opts);
      document.removeEventListener("keydown", unlock, opts);
    };
  }, []);
  return null;
}
