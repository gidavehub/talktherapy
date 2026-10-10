/**
 * Unit test for who counts as still in a group call (app/lib/groupCallPresence.ts).
 *
 *   node scripts/test-group-call.mts
 *
 * The cases that matter on real phones: a person whose clock is set by hand
 * must not be dropped from a call they are in; a tab that closed without
 * saying goodbye must not be called for ever; and the same person in two tabs
 * must end up in exactly one of them.
 */

import { GHOST_MS, STALE_MS, asPresence, joinedAfter, liveness, type Presence } from "../app/lib/groupCallPresence.ts";

let failures = 0;
function check(name: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const NOW = 1_800_000_000_000;
const person = (uid: string, heartbeatAt: number, session = `${uid}-s1`): Presence => ({
  uid,
  session,
  video: true,
  joinedAt: heartbeatAt,
  heartbeatAt,
});
const uids = (ps: Presence[]) => ps.map((p) => p.uid).sort().join(",");

// --- clocks -----------------------------------------------------------------
{
  const alive = liveness();
  // Their phone is nine minutes slow: every beat looks old by our clock.
  const slow = (t: number) => person("slow", t - 9 * 60_000);
  check("a phone nine minutes slow is in the call on first sight", uids(alive([slow(NOW)], NOW)) === "slow");
  check("…and still there after its next beat", uids(alive([slow(NOW + 10_000)], NOW + 10_000)) === "slow");
  check("…and still there between beats", uids(alive([slow(NOW + 10_000)], NOW + 30_000)) === "slow");
  check("…and gone once its beats stop", uids(alive([slow(NOW + 10_000)], NOW + 10_000 + STALE_MS)) === "");
}
{
  const alive = liveness();
  // Their phone is an hour FAST: beats look like they come from the future.
  const fast = (t: number) => person("fast", t + 60 * 60_000);
  check("a phone an hour fast is in the call", uids(alive([fast(NOW)], NOW)) === "fast");
  check("…and gone once its beats stop", uids(alive([fast(NOW)], NOW + STALE_MS)) === "");
}

// --- ghosts -----------------------------------------------------------------
{
  const alive = liveness();
  const ghost = person("ghost", NOW - GHOST_MS - 1);
  check("a tab that closed long ago is not in the call", uids(alive([ghost], NOW)) === "");
  check("…not even later, while it stays silent", uids(alive([ghost], NOW + 20_000)) === "");
  // The same person comes back: a new join, a new beat.
  const back = person("ghost", NOW + 30_000, "ghost-s2");
  check("…but they are, the moment they rejoin", uids(alive([back], NOW + 30_000)) === "ghost");
}
{
  const alive = liveness();
  // A tab closed a minute ago: looks alive on first sight, gone once its beat
  // has not changed for STALE_MS on our own clock.
  const recent = person("recent", NOW - 60_000);
  check("a tab closed a minute ago is given one chance", uids(alive([recent], NOW)) === "recent");
  check("…and dropped when it never beats again", uids(alive([recent], NOW + STALE_MS)) === "");
}

// --- comings and goings -----------------------------------------------------
{
  const alive = liveness();
  const a = person("a", NOW);
  const b = person("b", NOW);
  check("two people, both here", uids(alive([a, b], NOW)) === "a,b");
  check("one leaves (their presence is deleted)", uids(alive([a], NOW + 1_000)) === "a");
  // They come back with the same old document contents (an offline write
  // replaying): forgotten when they left, so judged afresh, and alive.
  check("…and comes back", uids(alive([a, b], NOW + 2_000)) === "a,b");
}

// --- the same person twice --------------------------------------------------
{
  const first = { joinedAt: NOW, session: "x" };
  const second = { joinedAt: NOW + 5_000, session: "y" };
  check("the later join keeps the call", joinedAfter(second, first) && !joinedAfter(first, second));
  const tieA = { joinedAt: NOW, session: "a" };
  const tieB = { joinedAt: NOW, session: "b" };
  check("a tie is still decided, one way only", joinedAfter(tieB, tieA) !== joinedAfter(tieA, tieB));
}

// --- what is read from the database -----------------------------------------
check("a presence with no uid is ignored", asPresence({ session: "s" }) === null);
check("camera counts as on unless it says off", asPresence({ uid: "u", session: "s" })?.video === true);
check("camera off is read as off", asPresence({ uid: "u", session: "s", video: false })?.video === false);

console.log(failures === 0 ? "\nAll group call checks passed." : `\n${failures} group call check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
