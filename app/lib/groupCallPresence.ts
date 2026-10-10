/**
 * Who is still in a group call — the part of groupCall.ts that is pure logic,
 * kept apart so it can be tested without a browser (scripts/test-group-call.mts).
 */

/** How long a heartbeat may go unchanged before that person is gone. */
export const STALE_MS = 35_000;
/**
 * A presence whose last beat is this old by OUR clock, the first time we see
 * it, is a tab that closed without saying goodbye. Generous, because phone
 * clocks are often set by hand; a live person is only ever misjudged for one
 * heartbeat, since their next beat counts on our clock regardless.
 */
export const GHOST_MS = 10 * 60_000;

export type Presence = { uid: string; session: string; video: boolean; joinedAt: number; heartbeatAt: number };

export function asPresence(d: Record<string, unknown>): Presence | null {
  if (typeof d.uid !== "string" || typeof d.session !== "string") return null;
  return {
    uid: d.uid,
    session: d.session,
    video: d.video !== false,
    joinedAt: Number(d.joinedAt ?? 0),
    heartbeatAt: Number(d.heartbeatAt ?? 0),
  };
}

/**
 * Who is still here, judged on THIS device's clock: how long since their
 * heartbeat last CHANGED, not what time their phone says it is. Comparing one
 * phone's clock with another's would drop somebody who is right there because
 * their time is set ten minutes slow.
 */
export function liveness() {
  const seen = new Map<string, { beat: string; at: number }>();
  return (all: Presence[], now: number): Presence[] => {
    const alive: Presence[] = [];
    for (const p of all) {
      const beat = `${p.session}:${p.heartbeatAt}`;
      const prev = seen.get(p.uid);
      if (!prev) {
        seen.set(p.uid, { beat, at: now - p.heartbeatAt > GHOST_MS ? -Infinity : now });
      } else if (prev.beat !== beat) {
        seen.set(p.uid, { beat, at: now });
      }
      if (now - (seen.get(p.uid)?.at ?? -Infinity) < STALE_MS) alive.push(p);
    }
    for (const uid of [...seen.keys()]) if (!all.some((p) => p.uid === uid)) seen.delete(uid);
    return alive;
  };
}

/**
 * Whether join `a` came after join `b` — the same person in two tabs or on two
 * phones. Both sides compare the same two values the same way, so exactly one
 * of them decides it is the older and leaves, even when the clocks differ.
 */
export function joinedAfter(
  a: Pick<Presence, "joinedAt" | "session">,
  b: Pick<Presence, "joinedAt" | "session">,
): boolean {
  return a.joinedAt > b.joinedAt || (a.joinedAt === b.joinedAt && a.session > b.session);
}
