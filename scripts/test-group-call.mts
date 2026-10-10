/**
 * Unit test for who counts as still in a group call (app/lib/groupCallPresence.ts).
 *
 *   node scripts/test-group-call.mts
 *
 * The cases that matter on real phones: a person whose clock is set by hand
 * must not be dropped from a call they are in; a tab that closed without
 * saying goodbye must not make the call look full or its leader look present;
 * the same person on two devices must end up in exactly one of them; and two
 * people tapping Join at the same moment must not overfill the call.
 */

import { STALE_MS, asPresence, joinedAfter, joinedBefore, liveness, type Presence } from "../app/lib/groupCallPresence.ts";

let failures = 0;
function check(name: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const NOW = 1_800_000_000_000;
const person = (uid: string, heartbeatAt: number, session = `${uid}-s1`, joinedAt: number | null = heartbeatAt): Presence => ({
  uid,
  session,
  video: true,
  heartbeatAt,
  joins: { [session]: joinedAt },
});
const uids = (ps: Presence[]) => ps.map((p) => p.uid).sort().join(",");

// --- clocks -----------------------------------------------------------------
{
  const alive = liveness();
  // Their phone is nine minutes slow: every beat looks old by our clock.
  const slow = (t: number) => person("slow", t - 9 * 60_000);
  check("a phone nine minutes slow is not counted on first sight", uids(alive([slow(NOW)], NOW)) === "");
  check("…but is the moment its next beat arrives", uids(alive([slow(NOW + 10_000)], NOW + 10_000)) === "slow");
  check("…and stays between beats", uids(alive([slow(NOW + 10_000)], NOW + 30_000)) === "slow");
  check("…and is gone once its beats stop", uids(alive([slow(NOW + 10_000)], NOW + 10_000 + STALE_MS)) === "");
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
  // A tab closed a minute ago and its goodbye never reached the server.
  const ghost = person("ghost", NOW - 60_000);
  check("a tab closed a minute ago is not in the call", uids(alive([ghost], NOW)) === "");
  check("…not later either, while it stays silent", uids(alive([ghost], NOW + 20_000)) === "");
  const back = person("ghost", NOW + 30_000, "ghost-s2");
  check("…but they are, the moment they rejoin", uids(alive([back], NOW + 30_000)) === "ghost");
}
{
  // Five in a call, two of whom closed their tabs 90 seconds ago. A newcomer
  // opening the call must see three, not five — and be let in.
  const alive = liveness();
  const live = ["a", "b", "c"].map((u) => person(u, NOW - 4_000));
  const dead = ["d", "e"].map((u) => person(u, NOW - 90_000));
  check("dead tabs do not make a call look full", uids(alive([...live, ...dead], NOW)) === "a,b,c");
}

// --- comings and goings -----------------------------------------------------
{
  const alive = liveness();
  const a = person("a", NOW);
  const b = person("b", NOW);
  check("two people, both here", uids(alive([a, b], NOW)) === "a,b");
  check("one leaves (their presence is deleted)", uids(alive([a], NOW + 1_000)) === "a");
  check("…and comes back", uids(alive([a, { ...b, heartbeatAt: NOW + 2_000 }], NOW + 2_000)) === "a,b");
}

// --- the same person twice --------------------------------------------------
{
  const first = { at: NOW, session: "x" };
  const second = { at: NOW + 5_000, session: "y" };
  check("the later join keeps the call", joinedAfter(second, first) && !joinedAfter(first, second));
  const tieA = { at: NOW, session: "a" };
  const tieB = { at: NOW, session: "b" };
  check("a tie is still decided, one way only", joinedAfter(tieB, tieA) !== joinedAfter(tieA, tieB));
}

// --- joining at the same moment ---------------------------------------------
{
  // Four in; two more tap Join together. The server ordered them f, then g.
  const inCall = ["a", "b", "c", "d"].map((u, i) => person(u, NOW, `${u}-s1`, NOW - 60_000 + i));
  const f = person("f", NOW, "f-s1", NOW + 100);
  const g = person("g", NOW, "g-s1", NOW + 200);
  check("the first of two late joiners fits", joinedBefore([...inCall, g], NOW + 100, "f-s1").length === 4);
  check("the second finds the call already full", joinedBefore([...inCall, f], NOW + 200, "g-s1").length === 5);
  const pending = person("p", NOW, "p-s1", null);
  check("a join the server has not stamped yet is not counted", joinedBefore([pending], NOW, "z").length === 0);
}

// --- what is read from the database -----------------------------------------
check("a presence with no uid is ignored", asPresence({ session: "s" }) === null);
check("camera counts as on unless it says off", asPresence({ uid: "u", session: "s" })?.video === true);
check("camera off is read as off", asPresence({ uid: "u", session: "s", video: false })?.video === false);
check(
  "a server time is read from a Firestore timestamp",
  asPresence({ uid: "u", session: "s", joins: { s: { toMillis: () => 42 } } })?.joins.s === 42,
);
check("a pending server time reads as not yet", asPresence({ uid: "u", session: "s", joins: { s: null } })?.joins.s === null);

console.log(failures === 0 ? "\nAll group call checks passed." : `\n${failures} group call check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
