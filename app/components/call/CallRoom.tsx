"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { Alert, Avatar, Spinner } from "../ui/Feedback";
import { IconMic, IconPhone, IconVideo } from "../ui/icons";
import Button from "../ui/Button";
import { useAuth } from "../AuthProvider";
import { useChatPeer } from "../chat/useChatPeer";
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

  /** The live call. A ref because nothing renders from it and it must survive. */
  const callRef = useRef<CallController | null>(null);

  useEffect(() => watchBooking(bookingId, setBooking), [bookingId]);

  const otherUid = booking && uid ? booking.participants.find((p) => p !== uid) ?? null : null;
  const peer = useChatPeer(otherUid, "The other person");

  const join = useCallback(async () => {
    if (!booking || !uid || callRef.current) return;
    setError(null);
    setJoined(true);

    try {
      const call = await joinCall(bookingId, uid, booking.participants, {
        onRemoteStream: setRemoteStream,
        onState: (next, why) => {
          setState(next);
          setDetail(why ?? null);
        },
      });
      callRef.current = call;
      setLocalStream(call.localStream);
    } catch {
      setJoined(false);
      setError(
        "Talk could not reach your camera or microphone. Check the permission in your browser and try again.",
      );
    }
  }, [booking, bookingId, uid]);

  const hangUp = useCallback(async () => {
    const call = callRef.current;
    callRef.current = null;
    setJoined(false);
    setLocalStream(null);
    setRemoteStream(null);
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

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[28px] bg-[var(--dark)] aspect-[3/4] sm:aspect-video">
        {remoteStream && (state === "connected" || state === "reconnecting") ? (
          <Video
            stream={remoteStream}
            muted={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <Avatar name={peer.name} size={74} />
            <div>
              <p className="text-[16px] text-white">{peer.name}</p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/55">
                {joined ? STATUS_TEXT[state] : spokenSlot(booking.startsAt, booking.endsAt)}
              </p>
            </div>
            {joined && (state === "waiting" || state === "connecting" || state === "starting") ? (
              <Spinner className="text-white/70" />
            ) : null}
          </div>
        )}

        {/* Your own picture, small, in the corner — and mirrored, because a
            video of yourself that moves the wrong way is disconcerting. */}
        {localStream && cameraOn ? (
          <Video
            stream={localStream}
            muted
            mirrored
            className="absolute right-3 top-3 h-[132px] w-[99px] sm:h-[150px] sm:w-[112px] rounded-[18px] object-cover shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
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
              className="h-[60px] w-[60px] rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-[0_12px_36px_-10px_rgba(255,90,31,0.8)]"
            >
              <IconPhone size={21} />
            </motion.button>

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
          </div>
        ) : null}
      </div>

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

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void join()} disabled={!open}>
              Join the session
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
            Your camera and microphone only turn on when you tap join.
            {!hasRelay()
              ? " On mobile data the connection may not get through yet — a relay server is still to be set up."
              : ""}
          </p>
        </div>
      ) : state === "ended" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void join()}>Rejoin</Button>
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
