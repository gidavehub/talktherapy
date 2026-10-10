"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import { Alert, Spinner } from "../ui/Feedback";
import { IconMic, IconPhone, IconVideo } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import { groupTitle, isGroupChat, nameOf, watchChat } from "../../lib/chat";
import {
  MAX_IN_CALL,
  hasRelay,
  joinGroupCall,
  watchGroupCall,
  type GroupCallController,
  type Peer,
} from "../../lib/groupCall";
import type { Chat } from "../../lib/models";

/**
 * A group's call: everybody in the group, by video or voice, inside Talk.
 *
 * A group SESSION is led: the provider opens the call, the others see it is
 * on — here and in the chat header — and walk in. Until the provider is
 * there nobody else can start it, and once they have left the group its
 * calls cannot start at all: a support group with nobody leading it is not
 * the session these people signed up for. A PEER group meets without the
 * provider, so anybody in it can start the call.
 *
 * As with the 1:1 call, joining is a tap, never automatic, and voice sits
 * beside video as an equal way in — on mobile data it is often the one that
 * connects, and nobody has to be on camera in front of a group to take part.
 */

const LEFT_TEXT = {
  full: `The call is full — ${MAX_IN_CALL} people is as many as it can carry on mobile data. Stay in the chat; you can join if somebody leaves.`,
  replaced: "You joined this call from another tab or phone, so it carried on there.",
  removed: "You are no longer in this group, so you have left its call.",
} as const;

function Video({
  stream,
  muted,
  mirrored,
  className,
}: {
  stream: MediaStream | null;
  muted: boolean;
  mirrored?: boolean;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  // srcObject is a property, not an attribute, so it cannot be set in JSX.
  useEffect(() => {
    const node = ref.current;
    if (node && node.srcObject !== stream) node.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirrored ? "scale-x-[-1]" : ""}`}
    />
  );
}

/** Somebody in the group, by the name the group knows them by. */
function usePerson(chat: Chat, uid: string) {
  return useChatPeer(uid, nameOf(chat, uid) ?? "Someone in the group");
}

function Face({ chat, uid, size, label }: { chat: Chat; uid: string; size: number; label?: string }) {
  const person = usePerson(chat, uid);
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <ProviderAvatar photoPath={person.photoPath} name={person.name} size={size} />
      {label !== undefined ? <p className="max-w-[140px] truncate text-[12.5px] text-white/80">{label || person.name}</p> : null}
    </div>
  );
}

const PEER_STATE: Record<Peer["state"], string | null> = {
  connecting: "Connecting",
  connected: null,
  reconnecting: "Reconnecting",
  failed: "Could not connect",
};

function PeerTile({ chat, peer }: { chat: Chat; peer: Peer }) {
  const person = usePerson(chat, peer.uid);
  const status = PEER_STATE[peer.state];
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-white/[0.06] aspect-[4/3]">
      {/* Always mounted: on a voice call this element is what PLAYS them.
          Hiding it the way a video is hidden would silence the person. */}
      <Video
        stream={peer.stream}
        muted={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          peer.hasVideo ? "opacity-100" : "opacity-0"
        }`}
      />
      <AnimatePresence>
        {!peer.hasVideo ? (
          <motion.div
            key="face"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <ProviderAvatar photoPath={person.photoPath} name={person.name} size={64} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-6">
        <p className="truncate text-[12.5px] text-white">
          {person.name}
          {chat.group === "led" && chat.createdBy === peer.uid ? <span className="text-white/60"> · leading</span> : null}
        </p>
        {status ? (
          <span className="shrink-0 text-[10.5px] uppercase tracking-[0.14em] text-white/65">{status}</span>
        ) : null}
      </div>
    </div>
  );
}

function SelfTile({
  chat,
  uid,
  stream,
  showVideo,
  micOn,
}: {
  chat: Chat;
  uid: string;
  stream: MediaStream | null;
  showVideo: boolean;
  micOn: boolean;
}) {
  const person = usePerson(chat, uid);
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-white/[0.06] aspect-[4/3]">
      {/* Your own picture, mirrored — a video of yourself that moves the
          wrong way is disconcerting. Muted, or you would hear yourself. */}
      {stream && showVideo ? (
        <Video stream={stream} muted mirrored className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ProviderAvatar photoPath={person.photoPath} name={person.name} size={64} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-6">
        <p className="truncate text-[12.5px] text-white">You</p>
        {!micOn ? (
          <span className="shrink-0 text-[10.5px] uppercase tracking-[0.14em] text-white/65">Muted</span>
        ) : null}
      </div>
    </div>
  );
}

function RoundButton({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={SPRING_SNAP}
      aria-pressed={!on}
      aria-label={label}
      className={`h-[52px] w-[52px] rounded-full flex items-center justify-center transition-colors ${
        on ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[var(--dark)]"
      }`}
    >
      {children}
    </motion.button>
  );
}

export default function GroupCallRoom({ chatId }: { chatId: string }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [chat, setChat] = useState<Chat | null | undefined>(undefined);
  /** Who is in the call right now, joined or not — so you can see it is on. */
  const [inCall, setInCall] = useState<string[]>([]);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  /** This side ended up voice only — chosen, or because the camera failed. */
  const [audioOnly, setAudioOnly] = useState(false);
  /** Asked for video and did not get it: worth saying, so nobody thinks they are on camera. */
  const [cameraFellBack, setCameraFellBack] = useState(false);
  const [left, setLeft] = useState<keyof typeof LEFT_TEXT | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The live call. A ref because nothing renders from it and it must survive. */
  const callRef = useRef<GroupCallController | null>(null);
  /** Still on this page — a join that finishes after you have gone must undo itself. */
  const hereRef = useRef(true);
  /** Cancels a join still under way when you leave the page. */
  const joiningRef = useRef<AbortController | null>(null);

  // The group as it is now. Taken out of it — or it gone — while in its
  // call: leave the call, rather than carry on behind a "no such group"
  // screen with no way to hang up. Anybody else taken out is dropped.
  useEffect(
    () =>
      watchChat(chatId, (next) => {
        setChat(next);
        const call = callRef.current;
        if (!call) return;
        if (!next || !uid || !next.participants.includes(uid)) {
          callRef.current = null;
          setJoined(false);
          setPeers([]);
          setLocalStream(null);
          setLeft("removed");
          void call.leave();
          return;
        }
        call.setMembers(next.participants);
      }),
    [chatId, uid],
  );
  useEffect(() => watchGroupCall(chatId, setInCall), [chatId]);

  // Leaving the page must end the call — and a join still under way: a
  // camera light still on after somebody has walked away is alarming, and a
  // breach of what this product promises.
  useEffect(() => {
    hereRef.current = true;
    return () => {
      hereRef.current = false;
      joiningRef.current?.abort();
      void callRef.current?.leave();
      callRef.current = null;
    };
  }, []);

  function reset() {
    setJoined(false);
    setPeers([]);
    setLocalStream(null);
  }

  async function join(withVideo: boolean) {
    if (!chat || !uid || callRef.current || joining) return;
    setError(null);
    setLeft(null);
    setCameraFellBack(false);
    setJoining(true);
    const cancel = new AbortController();
    joiningRef.current = cancel;
    try {
      const call = await joinGroupCall(
        chatId,
        uid,
        chat.participants,
        {
          onPeers: setPeers,
          onReplaced: () => {
            callRef.current = null;
            reset();
            setLeft("replaced");
          },
          onFull: () => {
            callRef.current = null;
            reset();
            setLeft("full");
          },
        },
        { video: withVideo, signal: cancel.signal },
      );
      if (!call) {
        // Full — unless it was cancelled because you left, or another tab of
        // yours took the call over while this one was joining.
        if (hereRef.current) setLeft((l) => l ?? "full");
        return;
      }
      if (!hereRef.current) {
        void call.leave();
        return;
      }
      callRef.current = call;
      setLocalStream(call.localStream);
      setAudioOnly(call.audioOnly);
      setCameraOn(!call.audioOnly);
      setMicOn(true);
      setCameraFellBack(withVideo && call.audioOnly);
      setJoined(true);
    } catch (e) {
      // A missing camera already fell back to voice inside joinGroupCall, so
      // a media error here is the microphone.
      const media = e instanceof DOMException && ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(e.name);
      setError(
        media
          ? "Talk could not reach your microphone. Check the permission in your browser and try again."
          : "Talk could not open the call. Check your connection and try again.",
      );
    } finally {
      if (joiningRef.current === cancel) joiningRef.current = null;
      setJoining(false);
    }
  }

  async function leave() {
    const call = callRef.current;
    callRef.current = null;
    reset();
    await call?.leave();
  }

  if (chat === undefined) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  if (chat === null || !uid) {
    return (
      <Alert tone="warning" title="No such group">
        This group does not exist, or you are not in it.
      </Alert>
    );
  }

  if (!isGroupChat(chat)) {
    // Two people call inside a booked session, where the call belongs.
    return (
      <Alert tone="info" title="This is a conversation between two people">
        Calls between two people happen in a booked session.{" "}
        <Link href={`/chats/${chatId}`} className="underline underline-offset-2">
          Back to the conversation
        </Link>
      </Alert>
    );
  }

  const title = groupTitle(chat) ?? "Group session";
  const peerGroup = chat.group === "peer";
  const leader = chat.createdBy;
  const leading = !peerGroup && leader === uid;
  // A led group whose leader has left it cannot start a call any more.
  const leaderGone = !peerGroup && (!leader || !chat.participants.includes(leader));
  const leaderHere = Boolean(leader && inCall.includes(leader));
  // In a led group everybody else waits for the person leading it.
  const canJoin = peerGroup || leading || (!leaderGone && leaderHere);
  const canStart = peerGroup || leading;
  const others = inCall.filter((u) => u !== uid);
  const isFull = !joined && others.length >= MAX_IN_CALL;
  const showSelfVideo = cameraOn && !audioOnly;
  const tiles = peers.length + 1;
  const grid = tiles <= 2 ? "grid-cols-1 sm:grid-cols-2" : tiles <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/chats/${chatId}`}
          aria-label="Back to the group's conversation"
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-medium leading-tight">{title}</h1>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {chat.participants.length} people in the group
          </p>
        </div>
      </div>

      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={SPRING_SOFT}
        className="relative overflow-hidden rounded-[28px] bg-[var(--dark)] p-3 sm:p-4"
      >
        {joined ? (
          <>
            <div className={`grid gap-2.5 ${grid}`}>
              <SelfTile chat={chat} uid={uid} stream={localStream} showVideo={showSelfVideo} micOn={micOn} />
              {peers.map((peer) => (
                <PeerTile key={peer.uid} chat={chat} peer={peer} />
              ))}
            </div>
            {peers.length === 0 ? (
              <p className="mt-4 text-center text-[12px] uppercase tracking-[0.18em] text-white/55">
                Waiting for the others to join
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-center gap-3">
              <RoundButton
                on={micOn}
                label={micOn ? "Turn your microphone off" : "Turn your microphone on"}
                onClick={() => {
                  const next = !micOn;
                  setMicOn(next);
                  callRef.current?.setMicEnabled(next);
                }}
              >
                <IconMic size={19} />
              </RoundButton>

              <motion.button
                type="button"
                onClick={() => void leave()}
                whileTap={{ scale: 0.92 }}
                transition={SPRING_SNAP}
                aria-label="Leave the call"
                className="h-[60px] w-[60px] rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[var(--shadow-accent)]"
              >
                <IconPhone size={21} />
              </motion.button>

              {/* No camera toggle on a voice call: a button that does nothing
                  is worse than none. */}
              {!audioOnly ? (
                <RoundButton
                  on={cameraOn}
                  label={cameraOn ? "Turn your camera off" : "Turn your camera on"}
                  onClick={() => {
                    const next = !cameraOn;
                    setCameraOn(next);
                    callRef.current?.setCameraEnabled(next);
                  }}
                >
                  <IconVideo size={19} />
                </RoundButton>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-5 px-4 py-8 text-center sm:min-h-[320px]">
            {others.length > 0 ? (
              <>
                <div className="flex flex-wrap justify-center gap-5">
                  {others.map((u) => (
                    <Face key={u} chat={chat} uid={u} size={64} label="" />
                  ))}
                </div>
                <p className="text-[12px] uppercase tracking-[0.18em] text-white/55">
                  {others.length === 1 ? "In the call now" : `${others.length} in the call now`}
                </p>
              </>
            ) : (
              <>
                {!peerGroup && leader && !leaderGone ? <Face chat={chat} uid={leader} size={80} /> : null}
                <p className="max-w-[340px] text-[14px] leading-relaxed text-white/75">
                  {canStart
                    ? "Nobody is in the call yet. When you start it, the group will see it is on and can join you."
                    : "The call has not started."}
                </p>
              </>
            )}
          </div>
        )}
      </motion.div>

      {cameraFellBack ? (
        <Alert tone="info" title="You joined by voice">
          Your camera was not available, so you are in the call by voice. You can
          still see the others if their cameras are on.
        </Alert>
      ) : null}

      {left ? (
        <Alert tone="info" title={left === "full" ? "The call is full" : "The call moved"}>
          {LEFT_TEXT[left]}
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="warning" title="Could not join">
          {error}
        </Alert>
      ) : null}

      {!joined && !canJoin ? (
        <Alert tone="info" title={leaderGone ? "This group's calls have ended" : "Not open yet"}>
          {leaderGone
            ? "The person who led this group has left it, so its calls cannot start any more. You can still write to each other in the chat."
            : "The call opens when the person leading the group is in it — you will see it here and in the chat when they are."}
        </Alert>
      ) : null}

      {!joined ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void join(true)} disabled={!canJoin || isFull} loading={joining}>
              {canStart && others.length === 0 ? "Start with video" : "Join with video"}
            </Button>
            <Button variant="secondary" onClick={() => void join(false)} disabled={!canJoin || isFull || joining}>
              {canStart && others.length === 0 ? "Start by voice" : "Join by voice"}
            </Button>
          </div>

          <p className="max-w-[480px] text-[12px] leading-relaxed text-[var(--muted)]">
            Nothing turns on until you choose. Everybody in the group can see and
            hear everybody in the call, so join by voice if you would rather not
            be on camera — it also uses far less data. Up to {MAX_IN_CALL} people
            can be in the call at once.
            {!hasRelay()
              ? " On mobile data some connections may not get through yet — a relay server is still to be set up."
              : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
