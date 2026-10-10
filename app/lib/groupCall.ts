/**
 * A group session's call: everybody in a provider-led group, by video or
 * voice, inside Talk.
 *
 * A MESH: each person connects directly to each other person — no server in
 * the middle relaying video, so nothing to pay for and nothing that sees the
 * session. The cost is upload: everyone sends their picture to everyone else,
 * which on Gambian mobile data stops being kind past a handful of people. So
 * the call is capped at MAX_IN_CALL; a larger group needs a media server (an
 * SFU), which is a budget decision, not code.
 *
 * Signalling, all under `groupCalls/{chatId}` (the room is the group chat, so
 * the rules check members against the chat's own list):
 *
 *   present/{uid}      who is in the call now: a fresh `session` id per join,
 *                      whether their camera is on, and a heartbeat. Gone, or
 *                      a heartbeat that has stopped changing, = left.
 *   links/{a__b}       one per pair, uids sorted. The FIRST uid makes the
 *                      offer — no negotiation, the same trick as the 1:1 call.
 *                      Offer and answer carry both sides' session ids, so a
 *                      person who drops and rejoins is renegotiated with, and
 *                      nobody applies an answer meant for an earlier join.
 *   links/{a__b}/candidates   ICE candidates, each stamped with its sender's
 *                      session; stale ones are ignored.
 *
 * As with the 1:1 call, a TURN relay is needed before launch — without one, a
 * share of connections on mobile data will not form.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import { hasRelay } from "./call";
import { asPresence, joinedAfter, liveness, type Presence } from "./groupCallPresence";

/** Everybody in the call, you included. A mesh past this hurts on mobile data. */
export const MAX_IN_CALL = 5;
/** Between "still here" signals. */
const HEARTBEAT_MS = 10_000;
/** How often the people in the call are re-checked when nothing else has changed. */
const SWEEP_MS = 5_000;

export type Peer = {
  uid: string;
  /** Their voice, and their picture when there is one. Always play it. */
  stream: MediaStream;
  /** A picture to show: their camera is on AND it is arriving. */
  hasVideo: boolean;
  state: "connecting" | "connected" | "reconnecting" | "failed";
};

export type GroupCallHandlers = {
  /** The other people in the call, every time anything about them changes. */
  onPeers: (peers: Peer[]) => void;
  /** You joined from another tab or phone; this one has left the call to it. */
  onReplaced?: () => void;
};

export type GroupCallController = {
  localStream: MediaStream;
  audioOnly: boolean;
  setMicEnabled: (on: boolean) => void;
  setCameraEnabled: (on: boolean) => void;
  leave: () => Promise<void>;
};

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

async function localMedia(wantVideo: boolean): Promise<{ stream: MediaStream; audioOnly: boolean }> {
  if (wantVideo) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Smaller than a 1:1 call's: everybody sends this to everybody.
        video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
        audio: AUDIO,
      });
      return { stream, audioOnly: false };
    } catch {
      // A missing or refused camera never keeps somebody out: voice only.
    }
  }
  return { stream: await navigator.mediaDevices.getUserMedia({ audio: AUDIO }), audioOnly: true };
}

const pairId = (a: string, b: string) => [a, b].sort().join("__");
const newSession = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Who is in a group's call right now, live — for the chat header and the
 * screen before joining, so a member can see a call is on and walk into it.
 * Readable by every member of the group, joined or not.
 */
export function watchGroupCall(chatId: string, cb: (uids: string[]) => void): Unsubscribe {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }
  const alive = liveness();
  let all: Presence[] = [];
  let last = "";
  const report = () => {
    const uids = alive(all, Date.now()).map((p) => p.uid).sort();
    const key = uids.join(",");
    if (key === last) return;
    last = key;
    cb(uids);
  };
  const off = onSnapshot(
    collection(firestore(), COLLECTIONS.groupCalls, chatId, "present"),
    (snap) => {
      all = snap.docs.map((d) => asPresence(d.data())).filter((p): p is Presence => p !== null);
      report();
    },
    () => cb([]),
  );
  // Nobody writes when somebody's tab dies: the clock has to notice.
  const sweep = setInterval(report, SWEEP_MS);
  return () => {
    clearInterval(sweep);
    off();
  };
}

type Link = {
  peerUid: string;
  peerSession: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  /** Frames are arriving. */
  receiving: boolean;
  /** Their camera is on, by their own presence — a camera switched off still sends black. */
  cameraOn: boolean;
  state: Peer["state"];
  unsubs: Unsubscribe[];
};

/**
 * Join the group's call. The room is the group chat: only its members can
 * open it, and the rules check that against the chat itself.
 *
 * Resolves to null when the call is already full — nothing has been sent, and
 * the microphone and camera are off again.
 */
export async function joinGroupCall(
  chatId: string,
  selfUid: string,
  participants: string[],
  handlers: GroupCallHandlers,
  options: { video?: boolean } = {},
): Promise<GroupCallController | null> {
  const db = firestore();
  const room = doc(db, COLLECTIONS.groupCalls, chatId);
  const presence = collection(room, "present");
  const me = doc(presence, selfUid);
  const mySession = newSession();
  const joinedAt = Date.now();
  const links = new Map<string, Link>();
  let ended = false;
  let admitted = false;

  const { stream: localStream, audioOnly } = await localMedia(options.video !== false);
  let cameraOn = !audioOnly;
  const stopMedia = () => localStream.getTracks().forEach((t) => t.stop());

  // The room — created by whoever is first, with the chat's own members. If
  // that is refused, the camera must not stay on behind the error.
  try {
    await setDoc(room, { chatId, participants, status: "active", updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    stopMedia();
    throw e;
  }

  const emit = () =>
    handlers.onPeers(
      [...links.values()].map((l) => ({
        uid: l.peerUid,
        stream: l.stream,
        hasVideo: l.receiving && l.cameraOn,
        state: l.state,
      })),
    );

  const close = (peerUid: string) => {
    const link = links.get(peerUid);
    if (!link) return;
    links.delete(peerUid);
    link.unsubs.forEach((off) => off());
    link.pc.ontrack = null;
    link.pc.onicecandidate = null;
    link.pc.onconnectionstatechange = null;
    link.pc.close();
    emit();
  };

  /** Connect to one other person. Whoever's uid sorts first makes the offer. */
  const open = (peer: Presence) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    // Without this, an offer from somebody with no camera has no video
    // section at all, and the others' pictures have nowhere to arrive.
    if (audioOnly) pc.addTransceiver("video", { direction: "recvonly" });

    const link: Link = {
      peerUid: peer.uid,
      peerSession: peer.session,
      pc,
      stream: new MediaStream(),
      receiving: false,
      cameraOn: peer.video,
      state: "connecting",
      unsubs: [],
    };
    links.set(peer.uid, link);

    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) {
        if (!link.stream.getTracks().includes(track)) link.stream.addTrack(track);
        if (track.kind === "video") {
          link.receiving = !track.muted;
          const set = (on: boolean) => () => {
            link.receiving = on;
            emit();
          };
          track.onmute = set(false);
          track.onunmute = set(true);
          track.onended = set(false);
        }
      }
      emit();
    };
    pc.onconnectionstatechange = () => {
      link.state =
        pc.connectionState === "connected"
          ? "connected"
          : pc.connectionState === "disconnected"
            ? "reconnecting"
            : pc.connectionState === "failed"
              ? "failed"
              : link.state;
      emit();
    };

    // Candidates can arrive before the offer or answer they belong to has
    // been applied — adding one then fails, and a lost candidate can be the
    // one route that would have worked. Hold them until there is somewhere
    // to put them.
    const held: RTCIceCandidateInit[] = [];
    const addCandidate = (init: RTCIceCandidateInit) => {
      if (!pc.remoteDescription) {
        held.push(init);
        return;
      }
      void pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
    };
    const applyRemote = async (description: RTCSessionDescriptionInit) => {
      await pc.setRemoteDescription(new RTCSessionDescription(description));
      for (const init of held.splice(0)) void pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
    };
    const fail = () => {
      link.state = "failed";
      emit();
    };

    const pairRef = doc(room, "links", pairId(selfUid, peer.uid));
    const candidates = collection(pairRef, "candidates");
    pc.onicecandidate = (event) => {
      if (!event.candidate || ended) return;
      void addDoc(candidates, { ...event.candidate.toJSON(), from: selfUid, session: mySession }).catch(() => {});
    };
    link.unsubs.push(
      onSnapshot(candidates, (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const c = change.doc.data();
          // Theirs, from THIS join of theirs — never an earlier one's.
          if (c.from !== peer.uid || c.session !== link.peerSession) continue;
          const { from: _from, session: _session, ...init } = c;
          void _from;
          void _session;
          addCandidate(init as RTCIceCandidateInit);
        }
      }),
    );

    // The pair document fires more than once for one write (the server's
    // timestamp lands as a second snapshot). Each side acts exactly once:
    // applying an answer twice, or answering one offer twice, breaks the
    // connection in ways that look like a bad network.
    let handled = false;
    const iOffer = [selfUid, peer.uid].sort()[0] === selfUid;
    if (iOffer) {
      void (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(pairRef, {
          members: [selfUid, peer.uid].sort(),
          offer: { type: offer.type, sdp: offer.sdp },
          offerSession: mySession,
          answerSession: peer.session,
          answer: null,
          updatedAt: serverTimestamp(),
        });
      })().catch(fail);
      link.unsubs.push(
        onSnapshot(pairRef, (snap) => {
          const data = snap.data() as DocumentData | undefined;
          // Only the answer to THIS offer, from THIS join of theirs.
          if (handled || !data?.answer) return;
          if (data.offerSession !== mySession || data.answerSession !== link.peerSession) return;
          handled = true;
          applyRemote(data.answer).catch(fail);
        }),
      );
    } else {
      link.unsubs.push(
        onSnapshot(pairRef, (snap) => {
          const data = snap.data() as DocumentData | undefined;
          // An offer meant for this join of mine, from their current join.
          if (handled || !data?.offer) return;
          if (data.answerSession !== mySession || data.offerSession !== link.peerSession) return;
          handled = true;
          void (async () => {
            await applyRemote(data.offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(pairRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
          })().catch(fail);
        }),
      );
    }
    emit();
  };

  const announce = () =>
    setDoc(me, {
      uid: selfUid,
      session: mySession,
      video: cameraOn,
      joinedAt,
      heartbeatAt: Date.now(),
    }).catch(() => {});

  // Who is here — and whether there is room for one more.
  const alive = liveness();
  let all: Presence[] = [];
  let full = false;

  const stop = async (removePresence: boolean) => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    clearInterval(sweep);
    window.removeEventListener("pagehide", onPageHide);
    presenceUnsub();
    for (const uid of [...links.keys()]) close(uid);
    stopMedia();
    if (removePresence) await deleteDoc(me).catch(() => {});
  };

  const evaluate = () => {
    if (ended) return;
    const here = alive(all, Date.now());
    const others = here.filter((p) => p.uid !== selfUid && participants.includes(p.uid));

    if (!admitted) {
      full = others.length >= MAX_IN_CALL;
      return;
    }

    // You, from another tab or phone. Whichever joined LAST keeps the call;
    // both sides compare the same two values, so exactly one of them leaves.
    const mine = all.find((p) => p.uid === selfUid);
    if (mine && mine.session !== mySession) {
      if (joinedAfter(mine, { joinedAt, session: mySession })) {
        // Leave their presence where it is: it is theirs now.
        void stop(false);
        handlers.onReplaced?.();
        return;
      }
      // An older join's last beat landed after ours. Say we are here again
      // straight away, before the others reconnect to the wrong one.
      void announce();
    }

    let changed = false;
    for (const p of others) {
      const existing = links.get(p.uid);
      if (existing && existing.peerSession === p.session) {
        if (existing.cameraOn !== p.video) {
          existing.cameraOn = p.video;
          changed = true;
        }
        continue;
      }
      if (existing) close(p.uid); // they rejoined: a new connection for the new join
      open(p);
    }
    for (const uid of [...links.keys()]) {
      if (!others.some((p) => p.uid === uid)) close(uid);
    }
    if (changed) emit();
  };

  let firstLook: () => void = () => {};
  const looked = new Promise<void>((resolve) => (firstLook = resolve));
  const presenceUnsub = onSnapshot(
    presence,
    (snap) => {
      all = snap.docs.map((d) => asPresence(d.data())).filter((p): p is Presence => p !== null);
      evaluate();
      firstLook();
    },
    () => firstLook(),
  );
  const sweep = setInterval(evaluate, SWEEP_MS);
  let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
  // A closed tab never runs React's cleanup. This is the last chance to say so.
  const onPageHide = () => void stop(true);

  // Whether the call is full is decided on what is actually there, not on a
  // guess at how long the first look takes.
  await Promise.race([looked, new Promise((r) => setTimeout(r, 8_000))]);
  if (full) {
    await stop(false);
    return null;
  }
  admitted = true;

  await announce();
  heartbeat = setInterval(() => void announce(), HEARTBEAT_MS);
  window.addEventListener("pagehide", onPageHide);
  evaluate();

  return {
    localStream,
    audioOnly,
    setMicEnabled: (on) => {
      for (const t of localStream.getAudioTracks()) t.enabled = on;
    },
    setCameraEnabled: (on) => {
      for (const t of localStream.getVideoTracks()) t.enabled = on;
      // Said out loud, so the others show your face instead of a black square.
      cameraOn = on && !audioOnly;
      void announce();
    },
    leave: () => stop(true),
  };
}

export { hasRelay };
