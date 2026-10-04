"use client";

import { useEffect, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { Avatar } from "../ui/Feedback";
import { firebaseConfigured, firebaseStorage } from "../../lib/firebase";

/**
 * A provider's face.
 *
 * `photoPath` is a Storage object path, not a URL, so it has to be resolved
 * before an <img> can use it. Resolved once per path into a module-level
 * cache: a directory of twenty providers would otherwise issue twenty
 * identical lookups, and the same faces appear again in the chat list, the
 * session list and the call screen.
 *
 * A download URL is the right thing HERE and the wrong thing for chat media.
 * These photos are public by design — the directory is browsable before
 * sign-in, and `avatars/{uid}` in storage.rules says `allow read: if true` for
 * exactly that reason. A voice note is the opposite, which is why that path
 * uses getBlob() instead.
 *
 * Falls back to initials, which is what the Avatar primitive does with no src
 * — so a provider who has not uploaded anything looks deliberate rather than
 * broken.
 */

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function resolve(path: string): Promise<string | null> {
  const known = cache.get(path);
  if (known !== undefined) return Promise.resolve(known);

  const existing = inFlight.get(path);
  if (existing) return existing;

  const pending = getDownloadURL(storageRef(firebaseStorage(), path))
    .then((url) => {
      cache.set(path, url);
      return url;
    })
    .catch(() => {
      // Cached as a miss too, so a deleted or unreadable object is not
      // retried on every render of every list it appears in.
      cache.set(path, null);
      return null;
    })
    .finally(() => inFlight.delete(path));

  inFlight.set(path, pending);
  return pending;
}

export default function ProviderAvatar({
  photoPath,
  name,
  size = 48,
  className,
}: {
  photoPath?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(() =>
    photoPath ? cache.get(photoPath) ?? null : null,
  );

  useEffect(() => {
    if (!photoPath || !firebaseConfigured()) return;

    let cancelled = false;
    void resolve(photoPath).then((next) => {
      if (!cancelled) setUrl(next);
    });

    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  return <Avatar src={url} name={name} size={size} className={className} />;
}
