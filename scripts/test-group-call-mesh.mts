/**
 * The group call mesh, run for real against a simulated world.
 *
 *   node scripts/test-group-call-mesh.mts          (eight seeds)
 *   SEED=5 node scripts/test-group-call-mesh.mts   (one, to replay a failure)
 *
 * app/lib/groupCall.ts runs unmodified; Firestore and WebRTC are fakes
 * (scripts/lib) with random delays on every write and snapshot, and a peer
 * connection that only connects when it is given the answer to its own
 * current offer. Each scenario is one the adversarial review traced by hand:
 * a phone that drops off mobile data for longer than the stale window and
 * comes back on the same join, the same person on two devices, two people
 * tapping Join at the same moment into a nearly full call, somebody taken
 * out of the group mid-call, a join abandoned half way.
 */

import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

if (!process.env.SEED) {
  const self = fileURLToPath(import.meta.url);
  let failed = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const run = spawnSync(process.execPath, [self], { env: { ...process.env, SEED: String(seed) }, encoding: "utf8" });
    const out = `${run.stdout}${run.stderr}`;
    const bad = run.status !== 0;
    if (bad) failed++;
    console.log(`seed ${seed}: ${bad ? "FAILED" : "ok"}`);
    if (bad) console.log(out.split("\n").filter((l) => /FAIL|Error|error/.test(l)).slice(0, 12).join("\n"));
  }
  console.log(failed === 0 ? "\nThe mesh held under every seed." : `\n${failed} seed(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

register("./lib/mesh-hooks.mjs", import.meta.url);
const sim = await import("./lib/mesh-sim.mjs");
const fs = await import("./lib/fake-firestore.mjs");
const { joinGroupCall, MAX_IN_CALL } = await import("../app/lib/groupCall.ts");
type Controller = NonNullable<Awaited<ReturnType<typeof joinGroupCall>>>;
type PeerView = { uid: string; state: string; hasVideo: boolean };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
}

const CHAT = "group_1";
let members = ["amie", "binta", "chernor", "dawda", "ebrima", "fatou", "lamin", "musa"];

type Person = {
  uid: string;
  device: string;
  call: Controller | null;
  peers: PeerView[];
  replaced: boolean;
  full: boolean;
  settled: boolean;
  error: unknown;
};

function startJoin(uid: string, device = uid, options: { video?: boolean; signal?: AbortSignal } = {}): Person {
  const p: Person = { uid, device, call: null, peers: [], replaced: false, full: false, settled: false, error: null };
  sim.als
    .run({ client: device }, () =>
      joinGroupCall(
        CHAT,
        uid,
        members,
        {
          onPeers: (peers) => (p.peers = peers.map((x) => ({ uid: x.uid, state: x.state, hasVideo: x.hasVideo }))),
          onReplaced: () => (p.replaced = true),
          onFull: () => (p.full = true),
        },
        { video: true, ...options },
      ),
    )
    .then(
      (call) => {
        p.call = call;
        if (!call) p.full = p.full || !options.signal?.aborted;
        p.settled = true;
      },
      (e) => {
        p.error = e;
        p.settled = true;
      },
    );
  return p;
}

async function settle(people: Person[], max = 30_000) {
  for (let t = 0; t < max && people.some((p) => !p.settled); t += 250) await sim.advance(250);
}

const inCall = (p: Person) => p.call !== null && !p.replaced && !p.full;

/** Every pair of people in the call sees the other, connected. */
function meshProblems(people: Person[]): string[] {
  const live = people.filter(inCall);
  const problems: string[] = [];
  for (const a of live) {
    for (const b of live) {
      if (a === b || a.uid === b.uid) continue;
      const view = a.peers.find((x) => x.uid === b.uid);
      if (!view) problems.push(`${a.device} does not see ${b.uid}`);
      else if (view.state !== "connected") problems.push(`${a.device} → ${b.uid}: ${view.state}`);
    }
    const ghosts = a.peers.filter((x) => !live.some((b) => b.uid === x.uid));
    for (const g of ghosts) problems.push(`${a.device} still has a tile for ${g.uid}`);
  }
  return problems;
}

async function until(people: Person[], max: number) {
  for (let t = 0; t < max; t += 500) {
    if (meshProblems(people).length === 0) return t;
    await sim.advance(500);
  }
  return -1;
}

const tracksOf = (device: string) => [...sim.liveTracks].filter((t: { owner: string }) => t.owner === device).length;

// --- 1. three people join at the same moment --------------------------------
const amie = startJoin("amie");
const binta = startJoin("binta");
const chernor = startJoin("chernor");
await settle([amie, binta, chernor]);
check("three people join at once", [amie, binta, chernor].every(inCall), String([amie, binta, chernor].map((p) => p.error)));
let took = await until([amie, binta, chernor], 20_000);
check("…and all three connect to each other", took >= 0, meshProblems([amie, binta, chernor]).join("; "));

// --- 2. a phone drops off mobile data for 45 seconds, same join -------------
sim.setOnline("binta", false);
await sim.advance(45_000);
sim.setOnline("binta", true);
took = await until([amie, binta, chernor], 60_000);
check("a phone back from 45s without data reconnects on the same join", took >= 0, meshProblems([amie, binta, chernor]).join("; "));

// --- 3. a short drop, inside the stale window --------------------------------
sim.setOnline("chernor", false);
await sim.advance(15_000);
sim.setOnline("chernor", true);
took = await until([amie, binta, chernor], 60_000);
check("a 15s drop (connections failed, presence never stale) recovers", took >= 0, meshProblems([amie, binta, chernor]).join("; "));

// --- 4. the same person on a second device -----------------------------------
const bintaPhone = startJoin("binta", "binta-phone");
await settle([bintaPhone]);
await sim.advance(5_000);
check("the newer device keeps the call", inCall(bintaPhone));
check("…the older one is told and leaves", binta.replaced);
check("…and its microphone and camera are off", tracksOf("binta") === 0, `${tracksOf("binta")} tracks still live`);
took = await until([amie, bintaPhone, chernor], 40_000);
check("…and everybody connects to the new device", took >= 0, meshProblems([amie, bintaPhone, chernor]).join("; "));
await sim.advance(30_000);
check("…and stays connected (no flip-flopping)", meshProblems([amie, bintaPhone, chernor]).length === 0, meshProblems([amie, bintaPhone, chernor]).join("; "));

// --- 5. leaving and rejoining --------------------------------------------------
void sim.als.run({ client: "chernor" }, () => chernor.call!.leave());
chernor.call = null;
await sim.advance(3_000);
check("leaving turns your microphone and camera off", tracksOf("chernor") === 0);
took = await until([amie, bintaPhone], 20_000);
check("…and the others drop your tile", took >= 0, meshProblems([amie, bintaPhone]).join("; "));
const chernor2 = startJoin("chernor", "chernor-2");
await settle([chernor2]);
took = await until([amie, bintaPhone, chernor2], 30_000);
check("rejoining connects again", took >= 0, meshProblems([amie, bintaPhone, chernor2]).join("; "));

// --- 6. two people tap Join at once into a call with one place left ---------
const dawda = startJoin("dawda");
await settle([dawda]);
took = await until([amie, bintaPhone, chernor2, dawda], 30_000);
check("a fourth joins", took >= 0, meshProblems([amie, bintaPhone, chernor2, dawda]).join("; "));
const ebrima = startJoin("ebrima");
const fatou = startJoin("fatou");
await settle([ebrima, fatou]);
await sim.advance(10_000);
const everyone = [amie, bintaPhone, chernor2, dawda, ebrima, fatou];
check(
  `two at once into one place: the call holds ${MAX_IN_CALL}, not ${MAX_IN_CALL + 1}`,
  everyone.filter(inCall).length === MAX_IN_CALL,
  `${everyone.filter(inCall).length} in the call`,
);
check("…exactly one of the two is told it is full", [ebrima, fatou].filter((p) => p.full).length === 1);
const lateOne = [ebrima, fatou].find((p) => p.full);
await sim.advance(3_000);
check("…and that one's microphone and camera are off", lateOne ? tracksOf(lateOne.device) === 0 : false);
took = await until(everyone, 40_000);
check("…and the five connect", took >= 0, meshProblems(everyone).join("; "));

// --- 7. a sixth, alone, is turned away before anything is sent -------------
const lamin = startJoin("lamin");
await settle([lamin]);
check("a sixth is turned away", lamin.call === null && lamin.full);
check("…with nothing left on", tracksOf("lamin") === 0);
check("…and never appeared in the call", !fs.__store.has(`groupCalls/${CHAT}/present/lamin`));

// --- 8. somebody taken out of the group mid-call ----------------------------
const stayed = everyone.filter(inCall);
const removed = stayed.find((p) => p.uid === "dawda")!;
members = members.filter((u) => u !== "dawda");
for (const p of stayed) if (p !== removed) sim.als.run({ client: p.device }, () => p.call!.setMembers(members));
void sim.als.run({ client: removed.device }, () => removed.call!.leave());
removed.call = null;
took = await until(stayed, 20_000);
check("somebody taken out of the group is dropped from the call", took >= 0, meshProblems(stayed).join("; "));

// --- 9. a join abandoned half way ------------------------------------------
// On a dead connection the room write never lands; they give up and go back
// to the chat. Then the connection comes back.
sim.setOnline("musa", false);
const cancel = new AbortController();
const musa = startJoin("musa", "musa", { signal: cancel.signal });
await sim.advance(4_000);
check("a join stuck on a dead connection has the camera on meanwhile", tracksOf("musa") > 0);
cancel.abort();
await settle([musa]);
check("…abandoning it resolves to nothing", musa.settled && musa.call === null && musa.error === null);
check("…and turns the microphone and camera off at once", tracksOf("musa") === 0);
sim.setOnline("musa", true);
await sim.advance(10_000);
check("…and they never appear in the call, even once back online", !fs.__store.has(`groupCalls/${CHAT}/present/musa`));
check("…and nobody's view of the call changed", meshProblems(stayed).length === 0, meshProblems(stayed).join("; "));

// --- throughout ----------------------------------------------------------------
check("no exceptions escaped into timers or listeners", sim.errors.length === 0, sim.errors.map(String).slice(0, 3).join("; "));
check("no candidate was ever added to the wrong connection", sim.stats.badCandidates === 0, `${sim.stats.badCandidates}`);

console.log(failures === 0 ? `\nSEED ${process.env.SEED}: all mesh checks passed.` : `\nSEED ${process.env.SEED}: ${failures} mesh check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
