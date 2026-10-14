"use client";

import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 1280px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Room for the editor and its preview side by side. Below this they take
 * turns, behind an Edit / Preview switch — and the preview that is not
 * showing is not loaded at all, which matters on a phone's data.
 */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}
