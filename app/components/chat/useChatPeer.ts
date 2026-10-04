"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getProvider } from "../../lib/providers";

/**
 * Who the other person in a chat is.
 *
 * Resolved from `providerProfiles`, which is the only name a patient is
 * allowed to read: firestore.rules deliberately refuses `users/{uid}` to
 * anyone but its owner and an admin, so there is no path from a uid to a
 * patient's name — by design, and worth keeping that way.
 *
 * That makes this lookup one-way: it resolves a provider and never a patient.
 * The other direction is covered by the `names` map denormalised onto the chat
 * document when it is opened (see `nameOf`), which callers pass in as the
 * fallback — the patient can read both names at that moment, so it costs
 * nothing, and it does not mean widening the users rule for everybody.
 *
 * The resolved profiles live in a module-level cache shared by every component
 * that asks, which is what stops a chat list of twenty rows issuing twenty
 * reads for the same provider. Because that cache is shared mutable state
 * outside React, it is exposed through `useSyncExternalStore` rather than
 * copied into each component's state: one row resolving a name updates every
 * row showing that person, and there is no effect mirroring a cache hit into
 * state (which is both a cascading render and a second source of truth).
 */

type Peer = { name: string | null; photoPath: string | null };

const cache = new Map<string, Peer>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

/** Stable empty result, so getSnapshot never returns a fresh object. */
const UNRESOLVED: Peer | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatPeer(uid: string | null, fallbackName: string) {
  // The same Peer object comes back for an unchanged cache, which is what
  // useSyncExternalStore requires to avoid re-rendering on every check.
  const getSnapshot = useCallback(
    () => (uid ? cache.get(uid) ?? UNRESOLVED : UNRESOLVED),
    [uid],
  );

  const peer = useSyncExternalStore(
    subscribe,
    getSnapshot,
    // Server render has no cache and no Firebase — always the fallback.
    () => UNRESOLVED,
  );

  useEffect(() => {
    if (!uid) return;
    // Already known, or already being fetched by another row.
    if (cache.has(uid) || inFlight.has(uid)) return;

    inFlight.add(uid);
    getProvider(uid)
      .then((profile) => {
        cache.set(uid, {
          name: profile?.displayName || null,
          // A Storage object path, not a URL — ProviderAvatar resolves it.
          photoPath: profile?.photoPath ?? null,
        });
      })
      .catch(() => {
        // Cached even on failure, so an unresolvable uid is not retried on
        // every render of the list.
        cache.set(uid, { name: null, photoPath: null });
      })
      .finally(() => {
        inFlight.delete(uid);
        notify();
      });
  }, [uid]);

  return {
    name: peer?.name ?? fallbackName,
    photoPath: peer?.photoPath ?? null,
    resolved: peer !== null,
  };
}
