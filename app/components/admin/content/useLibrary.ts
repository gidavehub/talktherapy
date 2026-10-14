"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { watchMedia } from "@/lib/content/client";
import type { SiteMedia } from "@/lib/content/schema";

/**
 * The media library, for an editor's picture fields, with anything uploaded
 * from a field added at once — before the library's own listener catches up.
 * Not read at all when the editor has no picture to choose (`enabled`).
 */
export function useLibrary(enabled: boolean) {
  const [media, setMedia] = useState<SiteMedia[] | null>(null);
  const [added, setAdded] = useState<SiteMedia[]>([]);
  useEffect(() => {
    if (!enabled) return;
    // A library that cannot be read still leaves the built-in pictures to choose from.
    return watchMedia(setMedia, () => setMedia([]));
  }, [enabled]);
  const all = useMemo(
    () => (media ? [...added.filter((a) => !media.some((m) => m.id === a.id)), ...media] : null),
    [media, added],
  );
  const add = useCallback((item: SiteMedia) => setAdded((prev) => [item, ...prev]), []);
  return { media: all, add };
}
