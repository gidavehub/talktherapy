/**
 * A group's call: everybody in a group, by video or voice, inside Talk.
 *
 * A MESH: each person connects directly to each other person — no server in
 * the middle relaying video, so nothing to pay for and nothing that sees the
 * session. The cost is upload: everyone sends their picture to everyone else,
 * which on Gambian mobile data stops being kind past a handful of people. So
 * the call is capped at MAX_IN_CALL; a larger group needs a media server (an
 * SFU), which is a budget decision, not code.
 *
 * Signalling, all under `groupCalls/{chatId}`. Who may be in it is the
 * group's CURRENT membership, which the rules read from the chat each time:
 *
 *   present/{uid}      who is in the call now: a fresh `session` id per join,
 *                      the server's time for each join (`joins`), whether the
 *                      camera is on, and a heartbeat. Gone, or a heartbeat
 *                      that has stopped changing, = left.
 *   links/{a__b}       one per pair, uids sorted; the first uid offers.
 *                      Every connection attempt is named, so nothing written
 *                      for an earlier one can be mistaken for the current one:
 *                        the answering side asks   wantOffer = its attempt id
 *                        the offering side offers  offerId, offerFor = that id
 *                        the answer says           answerTo = the offerId
 *                      A side that rebuilds its connection asks again (or
 *                      offers again), and the other side rebuilds to match.
 *   links/{a__b}/candidates   ICE candidates, stamped with their sender and
 *                      attempt. Each side clears away its own old ones.
 *
 * As with the 1:1 call, a TURN relay is needed before launch — without one, a
 * share of connections on mobile data will not form.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import { hasRelay } from "./call";
import { asPresence, joinedAfter, joinedBefore, liveness, type Presence } from "./groupCallPresence";

/** Everybody in the call, you included. A mesh past this hurts on mobile data. */
export const MAX_IN_CALL = 5;
/** Between "still here" signals. */
const HEARTBEAT_MS = 10_000;
/** How often the people in the call are re-checked when nothing else has changed. */
const SWEEP_MS = 5_000;
/** A connection rebuilt more often than this is not going to work by rebuilding it again. */
const MAX_RESTARTS_PER_MINUTE = 4;

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
  /** Somebody else got in at the same moment and made it one too many; this one has left. */
  onFull?: () => void;
};

export type GroupCallController = {
  localStream: MediaStream;
  audioOnly: boolean;
  setMicEnabled: (on: boolean) => void;
  setCameraEnabled: (on: boolean) => void;
  /** The group's membership changed: anybody no longer in it is dropped. */
  setMembers: (uids: string[]) => void;
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
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const toPresences = (docs: { data: () => DocumentData }[]) =>
  docs.map((d) => asPresence(d.data())).filter((p): p is Presence => p !== null);

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
      all = toPresences(snap.docs);
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
  /** Their presence as last seen — the join this connection is with. */
  peer: Presence;
  pc: RTCPeerConnection;
  stream: MediaStream;
  /** Frames are arriving. */
  receiving: boolean;
  /** Their camera is on, by their own presence. */
  cameraOn: boolean;
  state: Peer["state"];
  unsubs: Unsubscribe[];
};

/**
 * Join the group's call.
 *
 * Resolves to null when the call is already full, or when `signal` was
 * aborted (the person left the page mid-join) — either way nothing is left
 * running and the microphone and camera are off again.
 */
export async function joinGroupCall(
  chatId: string,
  selfUid: string,
  participants: string[],
  handlers: GroupCallHandlers,
  options: { video?: boolean; signal?: AbortSignal } = {},
): Promise<GroupCallController | null> {
  const { signal } = options;
  const db = firestore();
  const room = doc(db, COLLECTIONS.groupCalls, chatId);
  const presence = collection(room, "present");
  const me = doc(presence, selfUid);
  const mySession = newId();
  const links = new Map<string, Link>();
  const restarts = new Map<string, number[]>();
  let members = [...participants];
  let ended = false;
  let admitted = false;
  let announced = false;
  let full = false;
  /** The server's time for this join, once it has said. */
  let myJoinAt: number | null = null;
  let capChecked = false;

  const abandoned = new Promise<void>((resolve) => {
    if (signal?.aborted) resolve();
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });

  const { stream: localStream, audioOnly } = await localMedia(options.video !== false);
  let cameraOn = !audioOnly;
  const stopMedia = () => localStream.getTracks().forEach((t) => t.stop());
  if (signal?.aborted) {
    stopMedia();
    return null;
  }

  // The room, with the group's current members. If that is refused, or the
  // person walks away while it is pending, the camera must not stay on.
  const opening = setDoc(room, { chatId, participants: members, status: "active", updatedAt: serverTimestamp() }, { merge: true });
  opening.catch(() => {});
  try {
    await Promise.race([opening, abandoned]);
  } catch (e) {
    stopMedia();
    throw e;
  }
  if (signal?.aborted) {
    stopMedia();
    return null;
  }

  const emit = () =>
    handlers.onPeers(
      [...links.values()].map((l) => ({
        uid: l.peer.uid,
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

  const mayRestart = (uid: string) => {
    const now = Date.now();
    const recent = (restarts.get(uid) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_RESTARTS_PER_MINUTE) return false;
    recent.push(now);
    restarts.set(uid, recent);
    return true;
  };

  /** Connect to one other person. Whoever's uid sorts first makes the offer. */
  const open = (peer: Presence) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    // Without this, an offer from somebody with no camera has no video
    // section at all, and the others' pictures have nowhere to arrive.
    if (audioOnly) pc.addTransceiver("video", { direction: "recvonly" });

    const iOffer = [selfUid, peer.uid].sort()[0] === selfUid;
    const link: Link = {
      peer,
      pc,
      stream: new MediaStream(),
      receiving: false,
      cameraOn: peer.video,
      state: "connecting",
      unsubs: [],
    };
    links.set(peer.uid, link);

    const pairRef = doc(room, "links", pairId(selfUid, peer.uid));
    const candidates = collection(pairRef, "candidates");

    /** This side's attempt: the answerer's request id, or the offer's id. */
    let myAttempt: string | null = iOffer ? null : newId();
    /** Theirs — whose candidates belong to this connection. */
    let theirAttempt: string | null = null;
    /** Every attempt of mine on this connection, so cleanup spares them. */
    const mine = new Set<string>(myAttempt ? [myAttempt] : []);

    const fail = () => {
      link.state = "failed";
      emit();
    };
    /** Start this pair again from nothing: a new connection and a new attempt. */
    const restart = () => {
      if (ended || links.get(peer.uid) !== link) return;
      if (!mayRestart(peer.uid)) {
        fail();
        return;
      }
      close(peer.uid);
      open(link.peer);
    };

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
      const state = pc.connectionState;
      link.state =
        state === "connected"
          ? "connected"
          : state === "disconnected"
            ? "reconnecting"
            : state === "failed"
              ? "failed"
              : link.state;
      emit();
      // A connection that has failed is rebuilt, from the answering side
      // only so the two do not both start over at once.
      if (state === "failed" && !iOffer) setTimeout(restart, 1_500);
    };

    // Candidates can arrive before the description they belong to, and from
    // connections that no longer exist. Keep them all; use only this
    // connection's, once there is a description to add them to.
    const received: { attempt: string; init: RTCIceCandidateInit; used: boolean }[] = [];
    const flush = () => {
      if (!theirAttempt || !pc.remoteDescription) return;
      for (const c of received) {
        if (c.used || c.attempt !== theirAttempt) continue;
        c.used = true;
        void pc.addIceCandidate(new RTCIceCandidate(c.init)).catch(() => {});
      }
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || ended || !myAttempt) return;
      void addDoc(candidates, { ...event.candidate.toJSON(), from: selfUid, attempt: myAttempt }).catch(() => {});
    };
    link.unsubs.push(
      onSnapshot(
        candidates,
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type !== "added") continue;
            const { from, attempt, ...init } = change.doc.data();
            if (from !== peer.uid || typeof attempt !== "string") continue;
            received.push({ attempt, init: init as RTCIceCandidateInit, used: false });
          }
          flush();
        },
        () => {},
      ),
    );
    // Clear away this side's candidates from earlier connections, so a group
    // that meets every week does not re-read months of them on every join.
    void getDocs(query(candidates, where("from", "==", selfUid)))
      .then((snap) => {
        for (const d of snap.docs) {
          if (!mine.has(String(d.data().attempt))) void deleteDoc(d.ref).catch(() => {});
        }
      })
      .catch(() => {});

    if (iOffer) {
      /** The request this connection's offer answers. */
      let served: string | null = null;
      let applied = false;
      link.unsubs.push(
        onSnapshot(
          pairRef,
          (snap) => {
            const data = snap.data();
            if (!data) return;
            // A request for an offer, from their current join.
            if (typeof data.wantOffer === "string" && data.wantSession === link.peer.session && data.wantOffer !== served) {
              // Already made one for an earlier request: their connection
              // was rebuilt, so this one must be too.
              if (served !== null) {
                restart();
                return;
              }
              served = data.wantOffer;
              theirAttempt = served;
              const offerId = newId();
              myAttempt = offerId;
              mine.add(offerId);
              void (async () => {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await setDoc(
                  pairRef,
                  {
                    members: [selfUid, peer.uid].sort(),
                    offer: { type: offer.type, sdp: offer.sdp },
                    offerId,
                    offerFor: served,
                    offerSession: mySession,
                    answer: null,
                    answerTo: null,
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true },
                );
              })().catch(fail);
              return;
            }
            // The answer to THIS offer — never one written for an earlier one.
            if (!applied && data.answer && myAttempt && data.answerTo === myAttempt && pc.signalingState === "have-local-offer") {
              applied = true;
              pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(flush).catch(fail);
            }
          },
          () => {},
        ),
      );
    } else {
      /** The offer this connection answered. */
      let answered: string | null = null;
      // Ask for an offer made for THIS connection. Whatever is already in
      // the pair document was made for an earlier one.
      void setDoc(
        pairRef,
        { members: [selfUid, peer.uid].sort(), wantOffer: myAttempt, wantSession: mySession, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch(fail);
      link.unsubs.push(
        onSnapshot(
          pairRef,
          (snap) => {
            const data = snap.data();
            if (!data?.offer || typeof data.offerId !== "string") return;
            if (data.offerFor !== myAttempt || data.offerSession !== link.peer.session) return;
            if (data.offerId === answered) return;
            // A second, different offer for this connection: theirs was
            // rebuilt, so this one must be too.
            if (answered !== null) {
              restart();
              return;
            }
            const offerId: string = data.offerId;
            answered = offerId;
            theirAttempt = offerId;
            void (async () => {
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
              flush();
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await setDoc(
                pairRef,
                { answer: { type: answer.type, sdp: answer.sdp }, answerTo: offerId, updatedAt: serverTimestamp() },
                { merge: true },
              );
            })().catch(fail);
          },
          () => {},
        ),
      );
    }
    emit();
  };

  const announce = () =>
    ended
      ? Promise.resolve()
      : setDoc(
          me,
          {
            uid: selfUid,
            session: mySession,
            video: cameraOn,
            heartbeatAt: Date.now(),
            // The server stamps this join once; later beats repeat its value.
            joins: { [mySession]: myJoinAt === null ? serverTimestamp() : Timestamp.fromMillis(myJoinAt) },
          },
          { merge: true },
        ).catch(() => {});

  const alive = liveness();
  let all: Presence[] = [];

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
    const others = here.filter((p) => p.uid !== selfUid && members.includes(p.uid));

    if (!admitted) {
      full = others.length >= MAX_IN_CALL;
      return;
    }

    const mine = all.find((p) => p.uid === selfUid);
    if (mine && mine.session === mySession && myJoinAt === null) myJoinAt = mine.joins[mySession] ?? null;

    // You, from another tab or phone. The server's clock decides which join
    // is newer; the newer keeps the call. Undecided until both times are in.
    if (announced && mine && mine.session !== mySession) {
      const theirs = mine.joins[mine.session] ?? null;
      const ours = myJoinAt ?? mine.joins[mySession] ?? null;
      if (theirs !== null && ours !== null) {
        if (joinedAfter({ at: theirs, session: mine.session }, { at: ours, session: mySession })) {
          // Leave their presence where it is: it is theirs now.
          void stop(false);
          handlers.onReplaced?.();
          return;
        }
        // An older join's last beat landed after ours: say we are here again.
        void announce();
      }
    }

    // Two people who tapped Join at the same moment both saw room for one
    // more. Once the server has ordered the joins, the late one counts who
    // got in first, and leaves if that already filled the call.
    if (!capChecked && myJoinAt !== null) {
      capChecked = true;
      if (joinedBefore(others, myJoinAt, mySession).length >= MAX_IN_CALL) {
        void stop(true);
        handlers.onFull?.();
        return;
      }
    }

    let changed = false;
    for (const p of others) {
      const existing = links.get(p.uid);
      if (existing && existing.peer.session === p.session) {
        existing.peer = p;
        if (existing.cameraOn !== p.video) {
          existing.cameraOn = p.video;
          changed = true;
        }
        continue;
      }
      if (existing) close(p.uid); // they rejoined: a new connection for the new join
      try {
        open(p);
      } catch {
        // A connection that cannot even be built (a misconfigured relay)
        // leaves this one person out rather than breaking the whole call.
      }
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
      all = toPresences(snap.docs);
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
  await Promise.race([looked, abandoned, new Promise((r) => setTimeout(r, 8_000))]);
  if (full || signal?.aborted) {
    await stop(false);
    return null;
  }
  admitted = true;

  try {
    await announce();
    // Ended while saying so — replaced by a newer join, or walked away from.
    if (ended) return null;
    if (signal?.aborted) {
      await stop(true);
      return null;
    }
    announced = true;
    heartbeat = setInterval(() => void announce(), HEARTBEAT_MS);
    window.addEventListener("pagehide", onPageHide);
    evaluate();
  } catch (e) {
    await stop(true);
    throw e;
  }

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
    setMembers: (uids) => {
      members = [...uids];
      evaluate();
    },
    leave: () => stop(true),
  };
}

export { hasRelay };
