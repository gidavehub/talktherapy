/**
 * A simulated world for the group call mesh (scripts/test-group-call-mesh.mts):
 * virtual time, a network that can drop one person, and fake WebRTC strict
 * enough to catch the bugs that matter.
 *
 * The fake peer connection refuses what a real one would refuse — an answer
 * in the wrong state, a candidate before a description — and, crucially, it
 * only CONNECTS when the answer it is given was built for its own current
 * offer. An answer meant for an earlier connection "fails" after a while,
 * which is what a real one does when the ICE credentials and DTLS
 * fingerprint do not match.
 *
 * Importing this replaces setTimeout/setInterval/Date.now for the whole
 * process: time only moves when the test calls advance().
 */

import { AsyncLocalStorage } from "node:async_hooks";

export const als = new AsyncLocalStorage();
/** Which simulated device is acting right now. */
export const client = () => als.getStore()?.client ?? "test";
export const errors = [];

// ------------------------------------------------------------------ random

let seed = Number(process.env.SEED ?? 1) >>> 0 || 1;
/** Seeded, so a failing run can be replayed exactly with SEED=n. */
export function random() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = random;

// ------------------------------------------------------------------- time

let now = 1_800_000_000_000;
let seq = 0;
const timers = new Map();

export const clock = { now: () => now };

function schedule(cb, ms, every) {
  const id = ++seq;
  timers.set(id, { at: now + Math.max(0, Number(ms) || 0), cb, every, store: als.getStore(), seq: id });
  return id;
}
globalThis.setTimeout = (cb, ms, ...args) => schedule(() => cb(...args), ms, null);
globalThis.setInterval = (cb, ms, ...args) => schedule(() => cb(...args), ms, Math.max(1, Number(ms) || 1));
globalThis.clearTimeout = (id) => void timers.delete(id);
globalThis.clearInterval = (id) => void timers.delete(id);
Date.now = () => now;

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

/** Move time forward, running everything that falls due, in order. */
export async function advance(ms) {
  const target = now + ms;
  for (;;) {
    let next = null;
    for (const [id, t] of timers) {
      if (t.at > target) continue;
      if (!next || t.at < next[1].at || (t.at === next[1].at && t.seq < next[1].seq)) next = [id, t];
    }
    if (!next) break;
    const [id, t] = next;
    now = t.at;
    if (t.every) {
      t.at = now + t.every;
      t.seq = ++seq;
    } else {
      timers.delete(id);
    }
    const run = () => {
      try {
        t.cb();
      } catch (e) {
        errors.push(e);
      }
    };
    if (t.store) als.run(t.store, run);
    else run();
    await settle();
  }
  now = target;
  await settle();
}

// ---------------------------------------------------------------- network

/** Devices currently cut off. */
export const offline = new Set();
const onlineHooks = [];
export const whenOnline = (fn) => onlineHooks.push(fn);

export function setOnline(device, on) {
  if (on) {
    offline.delete(device);
    for (const fn of onlineHooks) fn(device);
    return;
  }
  offline.add(device);
  // Their calls go quiet, both ends: disconnected, then failed if it lasts.
  for (const pc of pcs.values()) {
    if (pc.closed || !pc.peerPc) continue;
    if (pc.client !== device && pc.peerPc.client !== device) continue;
    const other = pc.peerPc;
    pc.peerPc = null;
    other.peerPc = null;
    for (const p of [pc, other]) {
      p._state("disconnected");
      als.run({ client: p.client }, () => setTimeout(() => p.peerPc === null && p._state("failed"), 10_000));
    }
  }
}

// ----------------------------------------------------------------- WebRTC

/** Microphones and cameras still capturing. */
export const liveTracks = new Set();

/** A track from this device's own microphone or camera (`local`), or one arriving from somebody else. */
class FakeTrack {
  constructor(kind, local = true) {
    this.kind = kind;
    this.enabled = true;
    this.muted = false;
    this.owner = client();
    if (local) liveTracks.add(this);
  }
  stop() {
    liveTracks.delete(this);
  }
}

class FakeStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  addTrack(t) {
    this.tracks.push(t);
  }
}

export const pcs = new Map();
let pcSeq = 0;
let sdpSeq = 0;
export const stats = { badCandidates: 0, refusedAnswers: 0 };

class FakePC {
  constructor() {
    this.id = ++pcSeq;
    this.client = client();
    this.signalingState = "stable";
    this.connectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.closed = false;
    this.peerPc = null;
    this.ontrack = null;
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    pcs.set(this.id, this);
  }
  addTrack() {}
  addTransceiver() {}
  _alive() {
    if (this.closed) throw new Error("InvalidStateError: closed");
  }
  async createOffer() {
    this._alive();
    return { type: "offer", sdp: `offer:${this.id}:${++sdpSeq}` };
  }
  async createAnswer() {
    this._alive();
    if (this.signalingState !== "have-remote-offer") throw new Error(`createAnswer in ${this.signalingState}`);
    return { type: "answer", sdp: `answer:${this.id}:${this.remoteDescription.sdp}` };
  }
  async setLocalDescription(d) {
    this._alive();
    if (d.type === "offer") {
      if (this.signalingState !== "stable" || this.localDescription) throw new Error(`local offer in ${this.signalingState}`);
      this.signalingState = "have-local-offer";
    } else {
      if (this.signalingState !== "have-remote-offer") throw new Error(`local answer in ${this.signalingState}`);
      this.signalingState = "stable";
    }
    this.localDescription = { type: d.type, sdp: d.sdp };
    // Gather two candidates, a moment apart.
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        if (this.closed) return;
        this.onicecandidate?.({
          candidate: { toJSON: () => ({ candidate: `cand:${this.id}:${i}`, sdpMid: "0", sdpMLineIndex: 0 }) },
        });
      }, 15 + i * 25);
    }
  }
  async setRemoteDescription(d) {
    this._alive();
    if (d.type === "offer") {
      if (this.signalingState !== "stable" || this.remoteDescription) throw new Error(`remote offer in ${this.signalingState}`);
      this.signalingState = "have-remote-offer";
      this.remoteDescription = { type: d.type, sdp: d.sdp };
      return;
    }
    if (this.signalingState !== "have-local-offer") throw new Error(`remote answer in ${this.signalingState}`);
    this.signalingState = "stable";
    this.remoteDescription = { type: d.type, sdp: d.sdp };
    const parts = d.sdp.split(":");
    const answerer = pcs.get(Number(parts[1]));
    const answered = parts.slice(2).join(":");
    if (answered !== this.localDescription.sdp || !answerer || answerer.closed) {
      // Built for another offer: the credentials do not match and ICE fails.
      stats.refusedAnswers++;
      setTimeout(() => this._state("failed"), 5_000);
      return;
    }
    setTimeout(() => {
      if (this.closed || answerer.closed) return;
      if (offline.has(this.client) || offline.has(answerer.client)) return;
      connect(this, answerer);
    }, 150);
  }
  async addIceCandidate(c) {
    if (this.closed) return;
    if (!this.remoteDescription) throw new Error("addIceCandidate before a remote description");
    const from = Number(String(c.candidate).split(":")[1]);
    const remote = Number(this.remoteDescription.sdp.split(":")[1]);
    if (from !== remote) stats.badCandidates++;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.signalingState = "closed";
    this.connectionState = "closed";
    const other = this.peerPc;
    this.peerPc = null;
    if (other && !other.closed) {
      other.peerPc = null;
      other._state("disconnected");
      als.run({ client: other.client }, () => setTimeout(() => other.peerPc === null && other._state("failed"), 15_000));
    }
  }
  _state(s) {
    if (this.closed || this.connectionState === s) return;
    this.connectionState = s;
    als.run({ client: this.client }, () => this.onconnectionstatechange?.());
  }
}

function connect(a, b) {
  a.peerPc = b;
  b.peerPc = a;
  for (const p of [a, b]) {
    als.run({ client: p.client }, () => {
      const t = new FakeTrack("audio", false);
      p.ontrack?.({ streams: [new FakeStream([t])], track: t });
    });
    p._state("connected");
  }
}

class FakeDescription {
  constructor(d) {
    this.type = d.type;
    this.sdp = d.sdp;
  }
}
class FakeCandidate {
  constructor(init) {
    Object.assign(this, init);
  }
}

// Named classes, assigned through defineProperty: TypeScript (which checks
// this file through the test's import) crashes on a class expression
// assigned straight onto globalThis.
for (const [name, value] of Object.entries({
  RTCPeerConnection: FakePC,
  RTCSessionDescription: FakeDescription,
  RTCIceCandidate: FakeCandidate,
  MediaStream: FakeStream,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: async (c) => new FakeStream([new FakeTrack("audio"), ...(c.video ? [new FakeTrack("video")] : [])]),
    },
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { addEventListener() {}, removeEventListener() {} },
});
