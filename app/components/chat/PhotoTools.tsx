"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import { IconCamera, IconClose, IconSend } from "../ui/icons";

/**
 * Photos in a conversation: taking one, and looking at it before it goes.
 *
 * On a phone "Camera" opens the phone's own camera (an input with `capture`).
 * A computer ignores `capture` and would open a file picker instead, which is
 * not what "Camera" promised — so there, the webcam opens here (Webcam).
 */

/** Phones: a finger, not a mouse. Their file input can open the camera. */
export function opensCameraItself(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * A phone photo is 3–8MB; sent as it is, it would take minutes on Gambian
 * mobile data and cost the sender. Squeezed to 1600px it looks the same in a
 * chat and is a few hundred KB — what WhatsApp does too. Anything that cannot
 * be decoded here (or a GIF, which would lose its animation) goes as it is.
 */
export async function compressPhoto(file: Blob, max = 1600, quality = 0.82): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** A URL for the photo while it is on screen, revoked when it changes or goes. */
function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

/** The photo, full screen, before it is sent — as WhatsApp shows it. */
export function PhotoPreview({
  photo,
  onSend,
  onClose,
}: {
  photo: Blob | null;
  onSend: () => void;
  onClose: () => void;
}) {
  const url = useObjectUrl(photo);
  return (
    <AnimatePresence>
      {photo ? (
        <motion.div
          key="preview"
          role="dialog"
          aria-label="Send this photo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col bg-black"
        >
          <div className="flex h-16 shrink-0 items-center px-2 pt-[env(safe-area-inset-top)]">
            <button
              type="button"
              onClick={onClose}
              aria-label="Do not send"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <IconClose size={22} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-2">
            {url ? (
              <motion.img
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING_SOFT}
                src={url}
                alt="The photo you are about to send"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <motion.button
              type="button"
              onClick={onSend}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAP}
              aria-label="Send photo"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-accent)]"
            >
              <IconSend size={22} />
            </motion.button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** A computer's webcam, for "Camera" where there is no phone camera to open. */
export function Webcam({
  open,
  onCapture,
  onClose,
  onUnavailable,
}: {
  open: boolean;
  onCapture: (photo: Blob) => void;
  onClose: () => void;
  /** No camera, or not allowed — the caller offers the gallery instead. */
  onUnavailable: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().then(() => setReady(true));
        }
      })
      .catch(() => {
        if (!cancelled) onUnavailable("Talk could not open your camera. Choose a photo from your device instead.");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [open, onUnavailable]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Mirrored on screen, as a selfie view is; the photo itself is not.
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.88);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="webcam"
          role="dialog"
          aria-label="Take a photo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col bg-black"
        >
          <div className="flex h-16 shrink-0 items-center px-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the camera"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <IconClose size={22} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full -scale-x-100 rounded-lg" />
          </div>
          <div className="flex shrink-0 justify-center py-6">
            <motion.button
              type="button"
              onClick={snap}
              disabled={!ready}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_SNAP}
              aria-label="Take the photo"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white text-white disabled:opacity-40"
            >
              <IconCamera size={26} />
            </motion.button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
