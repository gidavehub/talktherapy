"use client";

import { useEffect, useState } from "react";
import { privateFileUrl } from "@/lib/providerApplication-client";

export type PrivateFile =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; src: string }
  | { status: "failed" };

/**
 * A private file (an applicant's photo), fetched through the Storage rules and
 * shown from a local object URL — never a shareable download link.
 *
 * The object URL keeps the whole file in memory until it is revoked, so it is
 * revoked when the path changes, when the screen goes, and when an answer
 * arrives for a path nobody is waiting on any more.
 *
 * `enabled` false holds off the fetch: for staff, until their sign-in carries
 * the claim Storage checks; for the applicant, while a photo they have just
 * chosen is already on screen from their own device.
 */
export function usePrivateFile(path: string | null, enabled = true): PrivateFile {
  const [loaded, setLoaded] = useState<{ path: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!path || !enabled) return;
    let cancelled = false;
    let url: string | null = null;
    privateFileUrl(path).then(
      (src) => {
        if (cancelled) {
          URL.revokeObjectURL(src);
          return;
        }
        url = src;
        setLoaded({ path, src });
      },
      () => {
        if (!cancelled) setLoaded({ path, src: null });
      },
    );
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
        // Forget it too: held off and then let through again for the same
        // path, the hook would otherwise hand back an address already revoked.
        const revoked = url;
        setLoaded((current) => (current?.src === revoked ? null : current));
      }
    };
  }, [path, enabled]);

  if (!path || !enabled) return { status: "idle" };
  if (!loaded || loaded.path !== path) return { status: "loading" };
  return loaded.src ? { status: "ready", src: loaded.src } : { status: "failed" };
}
