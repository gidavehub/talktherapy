/**
 * Who is still in a group call — the part of groupCall.ts that is pure logic,
 * kept apart so it can be tested without a browser (scripts/test-group-call.mts).
 */

/** How long a heartbeat may go unchanged before that person is gone. */
export const STALE_MS = 35_000;

export type Presence = {
  uid: string;
  session: string;
  /** Their camera is on. A camera switched off still sends black frames. */
  video: boolean;
  /** Their own clock's time of their last beat — a hint, never compared as truth. */
  heartbeatAt: number;
  /**
   * Session id -> when the SERVER recorded that join (null while pending).
   * The one clock every device agrees on, so it decides which of two joins
   * by the same person is the newer, and who got into a full call first.
   */
  joins: Record<string, number | null>;
};

function millis(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function asPresence(d: Record<string, unknown>): Presence | null {
  if (typeof d.uid !== "string" || typeof d.session !== "string") return null;
  const joins: Record<string, number | null> = {};
  if (d.joins && typeof d.joins === "object") {
    for (const [session, at] of Object.entries(d.joins as Record<string, unknown>)) joins[session] = millis(at);
  }
  return {
    uid: d.uid,
    session: d.session,
    video: d.video !== false,
    heartbeatAt: Number(d.heartbeatAt ?? 0),
    joins,
  };
}

/** When the server recorded this presence's current join, if it has yet. */
export function joinedAt(p: Presence): number | null {
  return p.joins[p.session] ?? null;
}

/**
 * Who is still here, judged on THIS device's clock: how long since their
 * heartbeat last CHANGED, not what time their phone says it is.
 *
 * On first sight there is nothing to measure a change against, so their own
 * timestamp is the only hint, and it is read strictly: a beat that looks
 * older than STALE_MS is taken for a tab that closed without saying goodbye.
 * That is what stops a dead tab making a call look full or its leader look
 * present. A live phone whose clock is set slow is misjudged for one beat at
 * most — its next one counts on our clock regardless.
 */
export function liveness() {
  const seen = new Map<string, { beat: string; at: number }>();
  return (all: Presence[], now: number): Presence[] => {
    const alive: Presence[] = [];
    for (const p of all) {
      const beat = `${p.session}:${p.heartbeatAt}`;
      const prev = seen.get(p.uid);
      if (!prev) {
        seen.set(p.uid, { beat, at: now - p.heartbeatAt > STALE_MS ? -Infinity : now });
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
 * Whether join `a` came after join `b`, by the server's clock — the same
 * person in two tabs or on two phones. Both sides compare the same two values
 * the same way, so exactly one of them decides it is the older and leaves.
 */
export function joinedAfter(a: { at: number; session: string }, b: { at: number; session: string }): boolean {
  return a.at > b.at || (a.at === b.at && a.session > b.session);
}

/**
 * The people who got into the call before a join made at `at` — what decides,
 * after the fact, whether two people who tapped Join at the same moment made
 * it one too many. Only the late one counts the early ones, so exactly the
 * late joins leave and nobody already in is ever pushed out.
 */
export function joinedBefore(others: Presence[], at: number, session: string): Presence[] {
  return others.filter((p) => {
    const t = joinedAt(p);
    return t !== null && joinedAfter({ at, session }, { at: t, session: p.session });
  });
}
