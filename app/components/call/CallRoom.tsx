"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import { Alert, Spinner } from "../ui/Feedback";
import { IconMic, IconPhone, IconVideo } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import { useNow } from "../../lib/useNow";
import { watchBooking, spokenSlot } from "../../lib/booking";
import { hasRelay, joinCall, joinWindow, type CallController, type CallState } from "../../lib/call";
import type { Booking } from "../../lib/models";

/**
 * The session: two people, one video call, inside Talk.
 *
 * The screen is deliberately quiet. The other person fills it; everything else
 * — the controls, the status, their name — sits on top and gets out of the
 * way. Somebody about to say the hardest thing they have said all year should
 * be looking at a face, not at an interface.
 *
 * Joining happens on a tap, never automatically. Opening a page must not turn
 * a camera on: the person may be on a bus.
 */

const STATUS_TEXT: Record<CallState, string> = {
  starting: "Starting",
  waiting: "Waiting for them to join",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  ended: "Call ended",
  failed: "Could not connect",
};

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

export default function CallRoom({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useNow(30_000);

  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [state, setState] = useState<CallState>("starting");
  const [detail, setDetail] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** This side ended up voice only — chosen, or because the camera failed. */
  const [audioOnly, setAudioOnly] = useState(false);
  /** Whether the other person is sending a picture right now. */
  const [remoteVideo, setRemoteVideo] = useState(false);
  /** Asked for video and did not get it: worth saying, so nobody thinks they are on camera. */
  const [cameraFellBack, setCameraFellBack] = useState(false);

  /** The live call. A ref because nothing renders from it and it must survive. */
  const callRef = useRef<CallController | null>(null);

  useEffect(() => watchBooking(bookingId, setBooking), [bookingId]);

  const otherUid = booking && uid ? booking.participants.find((p) => p !== uid) ?? null : null;
  const peer = useChatPeer(otherUid, "The other person");

  const join = useCallback(
    async (withVideo: boolean) => {
      if (!booking || !uid || callRef.current) return;
      setError(null);
      setJoined(true);
      setCameraFellBack(false);

      try {
        const call = await joinCall(
          bookingId,
          uid,
          booking.participants,
          {
            onRemoteStream: setRemoteStream,
            onRemoteVideo: setRemoteVideo,
            onState: (next, why) => {
              setState(next);
              setDetail(why ?? null);
            },
          },
          { video: withVideo },
        );
        callRef.current = call;
        setLocalStream(call.localStream);
        setAudioOnly(call.audioOnly);
        setCameraOn(!call.audioOnly);
        setCameraFellBack(withVideo && call.audioOnly);
      } catch {
        setJoined(false);
        // Only the microphone can fail us now: a missing camera already fell
        // back to voice inside joinCall.
        setError(
          "Talk could not reach your microphone. Check the permission in your browser and try again.",
        );
      }
    },
    [booking, bookingId, uid],
  );

  const hangUp = useCallback(async () => {
    const call = callRef.current;
    callRef.current = null;
    setJoined(false);
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteVideo(false);
    await call?.hangUp();
  }, []);

  // Leaving the page must end the call. Without this the camera light stays
  // on after someone navigates away, which is both alarming and a real breach
  // of the promise this product makes.
  useEffect(() => {
    return () => {
      void callRef.current?.hangUp();
      callRef.current = null;
    };
  }, []);

  if (booking === undefined) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  if (booking === null) {
    return (
      <Alert tone="warning" title="No such session">
        This session does not exist, or it is not one of yours.
      </Alert>
    );
  }

  const cancelled = booking.status === "cancelled";
  const open = joinWindow(booking.startsAt, booking.endsAt, now);

  const live = state === "connected" || state === "reconnecting";
  // Their picture only when there IS one. A voice call shows their face from
  // their profile instead of a black rectangle that looks like a fault.
  const showRemoteVideo = Boolean(remoteStream) && live && remoteVideo;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={SPRING_SOFT}
        className="relative overflow-hidden rounded-[28px] bg-[var(--dark)] aspect-[3/4] sm:aspect-video"
      >
        {/*
          Always mounted while there is a remote stream, visible or not: on a
          voice call this element is what PLAYS their voice. Hiding it the way
          a video is hidden would silence the call.
        */}
        {remoteStream ? (
          <Video
            stream={remoteStream}
            muted={false}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              showRemoteVideo ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}

        <AnimatePresence>
          {!showRemoteVideo ? (
            <motion.div
              key="face"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
            >
              {/* A slow halo while connected by voice, so a quiet line still
                  looks alive rather than frozen. */}
              <div className="relative">
                {live ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-white/10"
                    animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
                <ProviderAvatar photoPath={peer.photoPath} name={peer.name} size={88} />
              </div>
              <div>
                <p className="text-[17px] text-white">{peer.name}</p>
                <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/55">
                  {!joined
                    ? spokenSlot(booking.startsAt, booking.endsAt)
                    : live
                      ? "Voice call"
                      : STATUS_TEXT[state]}
                </p>
              </div>
              {joined && (state === "waiting" || state === "connecting" || state === "starting") ? (
                <Spinner className="text-white/70" />
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Your own picture, small, in the corner — and mirrored, because a
            video of yourself that moves the wrong way is disconcerting. */}
        {localStream && cameraOn && !audioOnly ? (
          <Video
            stream={localStream}
            muted
            mirrored
            className="absolute right-3 top-3 h-[132px] w-[99px] sm:h-[150px] sm:w-[112px] rounded-[18px] object-cover shadow-[var(--shadow-floating)]"
          />
        ) : null}

        {joined ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4">
            <motion.button
              type="button"
              onClick={() => {
                const next = !micOn;
                setMicOn(next);
                callRef.current?.setMicEnabled(next);
              }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAP}
              aria-pressed={!micOn}
              aria-label={micOn ? "Turn your microphone off" : "Turn your microphone on"}
              className={`h-[52px] w-[52px] rounded-full flex items-center justify-center transition-colors ${
                micOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[var(--dark)]"
              }`}
            >
              <IconMic size={19} />
            </motion.button>

            <motion.button
              type="button"
              onClick={() => void hangUp()}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAP}
              aria-label="End the call"
              className="h-[60px] w-[60px] rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[var(--shadow-accent)]"
            >
              <IconPhone size={21} />
            </motion.button>

            {/* No camera toggle on a voice call: there is no camera to toggle,
                and a button that does nothing is worse than none. */}
            {!audioOnly ? (
              <motion.button
                type="button"
                onClick={() => {
                  const next = !cameraOn;
                  setCameraOn(next);
                  callRef.current?.setCameraEnabled(next);
                }}
                whileTap={{ scale: 0.92 }}
                transition={SPRING_SNAP}
                aria-pressed={!cameraOn}
                aria-label={cameraOn ? "Turn your camera off" : "Turn your camera on"}
                className={`h-[52px] w-[52px] rounded-full flex items-center justify-center transition-colors ${
                  cameraOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[var(--dark)]"
                }`}
              >
                <IconVideo size={19} />
              </motion.button>
            ) : null}
          </div>
        ) : null}
      </motion.div>

      {cameraFellBack ? (
        <Alert tone="info" title="You joined by voice">
          Your camera was not available, so you are on a voice call. You can
          still see them if their camera is on.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="warning" title="Could not start">
          {error}
        </Alert>
      ) : null}

      {detail && state === "failed" ? (
        <Alert tone="warning" title="Could not connect">
          {detail}
        </Alert>
      ) : null}

      {cancelled ? (
        <Alert tone="info" title="This session was cancelled">
          Nobody is expecting you here. Message them if you want to arrange
          another time.
        </Alert>
      ) : !joined ? (
        <div className="space-y-3">
          {!open ? (
            <Alert tone="info" title="Not yet">
              This session is {spokenSlot(booking.startsAt, booking.endsAt)}. The
              call opens ten minutes before.
            </Alert>
          ) : null}

          {/*
            Two ways in, side by side. Voice is not a lesser option tucked
            away: on mobile data it is often the call that actually connects,
            and it is the only one for somebody whose camera is broken, absent,
            or simply not something they want on today.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void join(true)} disabled={!open}>
              Join with video
            </Button>
            <Button variant="secondary" onClick={() => void join(false)} disabled={!open}>
              Join by voice
            </Button>
            {otherUid ? (
              <Link
                href={`/chats/${[uid, otherUid].sort().join("__")}`}
                className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
              >
                Message instead
              </Link>
            ) : null}
          </div>

          <p className="text-[12px] text-[var(--muted)] leading-relaxed max-w-[460px]">
            Nothing turns on until you choose. Joining by voice uses far less
            data.
            {!hasRelay()
              ? " On mobile data the connection may not get through yet — a relay server is still to be set up."
              : ""}
          </p>
        </div>
      ) : state === "ended" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void join(!audioOnly)}>Rejoin</Button>
          <Link
            href="/sessions"
            className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
          >
            Back to sessions
          </Link>
        </div>
      ) : null}
    </div>
  );
}
