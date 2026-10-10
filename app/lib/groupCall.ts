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
 *   present/{uid}      who is in the call now: a fresh `session` id per join
 *                      and a heartbeat. Gone or stale (no heartbeat) = left.
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
import { firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import { hasRelay } from "./call";

/** Everybody in the call, you included. A mesh past this hurts on mobile data. */
export const MAX_IN_CALL = 5;
/** Seconds between "still here" signals, and how long silence means gone. */
const HEARTBEAT_MS = 10_000;
const STALE_MS = 35_000;

export type Peer = {
  uid: string;
  stream: MediaStream;
  hasVideo: boolean;
  state: "connecting" | "connected" | "reconnecting" | "failed";
};

export type GroupCallHandlers = {
  /** The other people in the call, every time anything about them changes. */
  onPeers: (peers: Peer[]) => void;
  /** Too many people already: this join was refused before anything was sent. */
  onFull?: () => void;
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

type Link = {
  peerUid: string;
  peerSession: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  hasVideo: boolean;
  state: Peer["state"];
  unsubs: Unsubscribe[];
};

/**
 * Join the group's call. The room is the group chat: only its members can
 * open it, and the rules check that against the chat itself.
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
  const mySession = newSession();
  const links = new Map<string, Link>();
  let ended = false;

  const { stream: localStream, audioOnly } = await localMedia(options.video !== false);

  const emit = () =>
    handlers.onPeers(
      [...links.values()].map((l) => ({ uid: l.peerUid, stream: l.stream, hasVideo: l.hasVideo, state: l.state })),
    );

  // The room — created by whoever is first, with the chat's own members.
  await setDoc(room, { chatId, participants, status: "active", startedAt: serverTimestamp() }, { merge: true });

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
  const open = (peerUid: string, peerSession: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    if (audioOnly) pc.addTransceiver("video", { direction: "recvonly" });

    const link: Link = { peerUid, peerSession, pc, stream: new MediaStream(), hasVideo: false, state: "connecting", unsubs: [] };
    links.set(peerUid, link);

    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) {
        if (!link.stream.getTracks().includes(track)) link.stream.addTrack(track);
        if (track.kind === "video") {
          link.hasVideo = true;
          const set = (on: boolean) => () => {
            link.hasVideo = on;
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

    const pairRef = doc(room, "links", pairId(selfUid, peerUid));
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
          if (c.from !== peerUid || c.session !== link.peerSession) continue;
          const { from: _from, session: _session, ...init } = c;
          void _from;
          void _session;
          void pc.addIceCandidate(new RTCIceCandidate(init as RTCIceCandidateInit)).catch(() => {});
        }
      }),
    );

    const iOffer = [selfUid, peerUid].sort()[0] === selfUid;
    if (iOffer) {
      void (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(pairRef, {
          members: [selfUid, peerUid].sort(),
          offer: { type: offer.type, sdp: offer.sdp },
          offerSession: mySession,
          answerSession: peerSession,
          answer: null,
          updatedAt: serverTimestamp(),
        });
      })().catch(() => {
        link.state = "failed";
        emit();
      });
      link.unsubs.push(
        onSnapshot(pairRef, (snap) => {
          const data = snap.data() as DocumentData | undefined;
          // Only the answer to THIS offer, from THIS join of theirs.
          if (!data?.answer || pc.currentRemoteDescription) return;
          if (data.offerSession !== mySession || data.answerSession !== link.peerSession) return;
          void pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
        }),
      );
    } else {
      link.unsubs.push(
        onSnapshot(pairRef, (snap) => {
          const data = snap.data() as DocumentData | undefined;
          // An offer meant for this join of mine, from their current join.
          if (!data?.offer || pc.currentRemoteDescription) return;
          if (data.answerSession !== mySession || data.offerSession !== link.peerSession) return;
          void (async () => {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(pairRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
          })().catch(() => {
            link.state = "failed";
            emit();
          });
        }),
      );
    }
    emit();
  };

  // Who is here — and whether there is room for one more.
  let admitted = false;
  let refused = false;
  const presenceUnsub = onSnapshot(presence, (snap) => {
    if (ended) return;
    const now = Date.now();
    const here = snap.docs
      .map((d) => d.data())
      .filter((p) => typeof p.uid === "string" && typeof p.session === "string" && now - Number(p.heartbeatAt ?? 0) < STALE_MS);

    if (!admitted) {
      const others = here.filter((p) => p.uid !== selfUid);
      if (others.length >= MAX_IN_CALL) {
        refused = true;
        return;
      }
    }

    for (const p of here) {
      if (p.uid === selfUid || !participants.includes(p.uid)) continue;
      const existing = links.get(p.uid);
      if (existing && existing.peerSession === p.session) continue;
      if (existing) close(p.uid); // they rejoined: a new connection for the new join
      open(p.uid, p.session);
    }
    for (const uid of [...links.keys()]) {
      if (!here.some((p) => p.uid === uid)) close(uid);
    }
  });

  // Give the first snapshot a moment to say whether the call is full.
  await new Promise((r) => setTimeout(r, 600));
  if (refused) {
    presenceUnsub();
    localStream.getTracks().forEach((t) => t.stop());
    handlers.onFull?.();
    return null;
  }
  admitted = true;

  const me = doc(presence, selfUid);
  const announce = () =>
    setDoc(me, { uid: selfUid, session: mySession, video: !audioOnly, heartbeatAt: Date.now() }).catch(() => {});
  await announce();
  // Each beat is also what drops the dead: writing our own presence fires our
  // presence listener, which re-checks everybody's last beat against the clock.
  const heartbeat = setInterval(() => void announce(), HEARTBEAT_MS);

  const leave = async () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    presenceUnsub();
    for (const uid of [...links.keys()]) close(uid);
    localStream.getTracks().forEach((t) => t.stop());
    await deleteDoc(me).catch(() => {});
  };

  return {
    localStream,
    audioOnly,
    setMicEnabled: (on) => {
      for (const t of localStream.getAudioTracks()) t.enabled = on;
    },
    setCameraEnabled: (on) => {
      for (const t of localStream.getVideoTracks()) t.enabled = on;
    },
    leave,
  };
}

export { hasRelay };
