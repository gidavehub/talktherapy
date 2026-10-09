/**
 * The video session itself: a direct, peer-to-peer call between two people.
 *
 * Signalling goes through `calls/{bookingId}` — the booking id IS the room id,
 * which is what lets firestore.rules check the room's participants against the
 * booking's rather than taking the creator's word for it.
 *
 * WHY NOT GOOGLE MEET. It cannot be embedded: Google sends X-Frame-Options on
 * meet.google.com, and the REST API only mints links that open in a new tab.
 * Sending somebody in distress out of Talk and into a Google sign-in — on a
 * phone, on a mobile connection, at the moment of their appointment — loses a
 * proportion of them that no amount of polish elsewhere earns back. A provider
 * can still attach a Meet link to a booking for anyone who prefers it.
 *
 * WHO CALLS WHOM. The two sides must not both make an offer, so the roles are
 * decided by sorting the two uids: the first is the caller. No negotiation, no
 * race, and both sides compute the same answer without talking to each other —
 * the same trick the chat id uses.
 *
 * A TURN RELAY IS STILL MISSING, and this will not work for everyone without
 * one. Plain STUN cannot get through the carrier-grade NAT that Gambian mobile
 * networks use; expect a meaningful share of calls to fail to connect on
 * mobile data. The configuration below reads one from the environment the day
 * there is one — see NEXT_PUBLIC_TURN_URL in .env.example.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { COLLECTIONS } from "./models";

export type CallState =
  | "starting"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type CallHandlers = {
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: CallState, detail?: string) => void;
  /**
   * Whether the other person is sending video. A voice-only call shows their
   * face from the profile instead of a black rectangle.
   */
  onRemoteVideo?: (hasVideo: boolean) => void;
};

export type JoinOptions = {
  /**
   * Ask for the camera. False joins by voice only — which on Gambian mobile
   * data is often the call that actually connects, and the only call somebody
   * can join when their camera is broken, absent, or refused.
   */
  video?: boolean;
};

export type CallController = {
  localStream: MediaStream;
  /** True when this side ended up voice only, by choice or because the camera failed. */
  audioOnly: boolean;
  /** Mute or unmute the microphone. Returns the new state. */
  setMicEnabled: (on: boolean) => void;
  setCameraEnabled: (on: boolean) => void;
  hangUp: () => Promise<void>;
};

/**
 * ICE servers.
 *
 * STUN alone is enough on wifi and on most fixed connections: it only tells a
 * peer its own public address. TURN actually relays the media when neither
 * side can be reached directly, which is the case behind carrier NAT — so
 * until one is configured, some calls simply will not connect, and the UI has
 * to say so rather than spin.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

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

/** True when a TURN relay is configured. The call screen says so if it is not. */
export function hasRelay(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURN_URL);
}

function roomRef(bookingId: string) {
  return doc(firestore(), COLLECTIONS.calls, bookingId);
}

function candidatesRef(bookingId: string, which: "caller" | "callee") {
  return collection(
    firestore(),
    COLLECTIONS.calls,
    bookingId,
    which === "caller" ? COLLECTIONS.callerCandidates : COLLECTIONS.calleeCandidates,
  );
}

/**
 * Who makes the offer.
 *
 * Sorted, so both sides agree without exchanging a word. Whoever opens the
 * screen second still connects: the callee waits for an offer to appear, and
 * the caller re-sends one if the room is reused.
 */
export function isCaller(selfUid: string, participants: string[]): boolean {
  return [...participants].sort()[0] === selfUid;
}

/** Clear a previous attempt so a second call in the same room starts clean. */
async function clearSignalling(bookingId: string) {
  const [caller, callee] = await Promise.all([
    getDocs(candidatesRef(bookingId, "caller")),
    getDocs(candidatesRef(bookingId, "callee")),
  ]);
  await Promise.all([
    ...caller.docs.map((d) => deleteDoc(d.ref)),
    ...callee.docs.map((d) => deleteDoc(d.ref)),
  ]);
}

/**
 * Join the call for a booking.
 *
 * Asks for camera and microphone first: everything else is pointless without
 * them, and a refusal should be reported before a room is created rather than
 * after. The returned controller owns the teardown — call `hangUp` once, from
 * anywhere, and every listener, track and connection goes with it.
 */
const AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * The person's microphone, and their camera if asked for and available.
 *
 * A camera that is refused, missing or already in use must NOT stop somebody
 * reaching their provider. If video was asked for and fails, this falls back
 * to voice only rather than failing the whole call — the microphone is the
 * thing a session cannot happen without; the camera is not.
 */
async function localMedia(wantVideo: boolean): Promise<{ stream: MediaStream; audioOnly: boolean }> {
  if (wantVideo) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: AUDIO,
      });
      return { stream, audioOnly: false };
    } catch {
      // Fall through to voice only.
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  return { stream, audioOnly: true };
}

export async function joinCall(
  bookingId: string,
  selfUid: string,
  participants: string[],
  handlers: CallHandlers,
  options: JoinOptions = {},
): Promise<CallController> {
  handlers.onState("starting");

  const { stream: localStream, audioOnly } = await localMedia(options.video !== false);

  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  // Voice only on THIS side must not mean voice only on both. Without a video
  // transceiver, an offer from somebody with no camera has no video section at
  // all, and the provider's camera has nowhere to send its picture. Receive
  // only, so we still see them while they cannot see us.
  if (audioOnly) pc.addTransceiver("video", { direction: "recvonly" });

  // One stream object for the life of the call: handing the <video> element a
  // new MediaStream on every track event makes it flicker.
  const remoteStream = new MediaStream();
  handlers.onRemoteStream(remoteStream);
  pc.ontrack = (event) => {
    const tracks = event.streams[0]?.getTracks() ?? [event.track];
    for (const track of tracks) {
      if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
      if (track.kind === "video") {
        handlers.onRemoteVideo?.(true);
        // Their camera going off mid-call — they turned it off, or it dropped —
        // should put their face back, not leave a frozen frame.
        track.onmute = () => handlers.onRemoteVideo?.(false);
        track.onunmute = () => handlers.onRemoteVideo?.(true);
        track.onended = () => handlers.onRemoteVideo?.(false);
      }
    }
  };

  const caller = isCaller(selfUid, participants);
  const room = roomRef(bookingId);
  const mine = candidatesRef(bookingId, caller ? "caller" : "callee");
  const theirs = candidatesRef(bookingId, caller ? "callee" : "caller");

  const unsubscribes: Unsubscribe[] = [];
  let ended = false;

  pc.onconnectionstatechange = () => {
    if (ended) return;
    if (pc.connectionState === "connected") handlers.onState("connected");
    else if (pc.connectionState === "disconnected") handlers.onState("reconnecting");
    else if (pc.connectionState === "failed") {
      handlers.onState(
        "failed",
        hasRelay()
          ? "The connection could not be made."
          : "The connection could not be made. On mobile data this usually means a relay server is needed.",
      );
    }
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || ended) return;
    // Fire and forget: a candidate that fails to send costs one path, not the
    // call, and awaiting here would stall the gathering.
    void addDoc(mine, event.candidate.toJSON()).catch(() => {});
  };

  // Both sides ensure the room exists. Whoever gets there first creates it;
  // the other merges into it. `participants` is written identically by both,
  // which is what the create rule checks against the booking.
  await setDoc(
    room,
    { participants, status: "active", startedAt: serverTimestamp() },
    { merge: true },
  );

  if (caller) {
    await clearSignalling(bookingId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await updateDoc(room, {
      offer: { type: offer.type, sdp: offer.sdp },
      // Cleared so a stale answer from an earlier attempt is never applied.
      answer: null,
    });

    handlers.onState("waiting");

    unsubscribes.push(
      onSnapshot(room, (snap) => {
        const data = snap.data() as DocumentData | undefined;
        if (!data?.answer || pc.currentRemoteDescription || ended) return;
        handlers.onState("connecting");
        void pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
      }),
    );
  } else {
    handlers.onState("waiting");

    unsubscribes.push(
      onSnapshot(room, (snap) => {
        const data = snap.data() as DocumentData | undefined;
        // Wait for the offer. It may not be there yet — the other person may
        // not have opened the screen — and it may arrive long after this one.
        if (!data?.offer || pc.currentRemoteDescription || ended) return;

        handlers.onState("connecting");
        void (async () => {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(room, { answer: { type: answer.type, sdp: answer.sdp } });
          } catch {
            handlers.onState("failed", "Could not answer the call.");
          }
        })();
      }),
    );
  }

  unsubscribes.push(
    onSnapshot(theirs, (snap) => {
      if (ended) return;
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        void pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    }),
  );

  const hangUp = async () => {
    if (ended) return;
    ended = true;

    for (const off of unsubscribes) off();
    for (const track of localStream.getTracks()) track.stop();
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.close();

    handlers.onState("ended");

    // Best effort. The call is over for this person either way, and failing to
    // write a status must never leave the screen stuck on a dead call.
    await updateDoc(room, { status: "ended", endedAt: serverTimestamp() }).catch(() => {});
  };

  return {
    localStream,
    audioOnly,
    setMicEnabled: (on) => {
      for (const track of localStream.getAudioTracks()) track.enabled = on;
    },
    setCameraEnabled: (on) => {
      for (const track of localStream.getVideoTracks()) track.enabled = on;
    },
    hangUp,
  };
}

/**
 * When a session can be joined.
 *
 * Ten minutes early, because somebody anxious about an appointment arrives
 * early, and an hour after it ends, because a call that drops at the 44th
 * minute has to be rejoinable.
 */
export function joinWindow(startsAt: number, endsAt: number, now: number): boolean {
  return now >= startsAt - 10 * 60_000 && now <= endsAt + 60 * 60_000;
}
