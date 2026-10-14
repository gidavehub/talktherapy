"use client";

import { useEffect, useState } from "react";
import { staffNames } from "@/lib/content/client";

/**
 * Names for the staff uids on screen — who published, who saved a draft.
 * Looked up as they appear; until a name arrives the screen says "staff".
 */
export function useStaffNames(uids: (string | null | undefined)[]): Record<string, string> {
  const key = [...new Set(uids.filter((u): u is string => Boolean(u)))].sort().join(",");
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let live = true;
    void staffNames(key.split(",")).then((found) => {
      if (live) setNames((prev) => ({ ...prev, ...found }));
    });
    return () => {
      live = false;
    };
  }, [key]);

  return names;
}

/** "Awa Jallow", "you", or "staff" while the name is on its way. */
export function nameFor(uid: string | null | undefined, names: Record<string, string>, me: string | null | undefined) {
  if (!uid) return "staff";
  if (uid === me) return "you";
  return names[uid] ?? "staff";
}
