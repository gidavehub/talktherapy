"use client";

import { useEffect, useRef, useState } from "react";
import ImageUploader from "../../ui/ImageUploader";
import { IconCheck, IconClose } from "../../ui/icons";
import { deleteStoredFile, uploadApplicationPhoto } from "@/lib/providerApplication-client";
import { usePrivateFile } from "../usePrivateFile";
import { DOC_MAX_BYTES } from "@/lib/providerApplication";
import type { StepProps } from "./types";

const DO = ["Your face, looking at the camera", "Eyes open, a natural expression", "Good light — face a window", "A plain wall behind you"];
const DONT = ["Sunglasses, filters or stickers", "Group photos or cropped friends", "Logos, text or certificates", "Somebody else's photo"];

export default function PhotoStep({ uid, value, onChange, problems }: StepProps<"photo">) {
  // A photo just chosen is shown from the file on this device; one saved
  // before is fetched through the Storage rules. Either way a local object
  // URL, revoked as soon as it is off screen.
  const [local, setLocal] = useState<{ path: string; src: string } | null>(null);
  const showingLocal = local !== null && local.path === value.path;
  const saved = usePrivateFile(value.path, !showingLocal);
  // The file that has just finished uploading, between the upload and the
  // uploader handing it back.
  const landed = useRef<{ path: string; file: File } | null>(null);

  useEffect(() => {
    if (!local) return;
    const src = local.src;
    return () => URL.revokeObjectURL(src);
  }, [local]);

  const shown = showingLocal ? { src: local.src, alt: "" } : saved.status === "ready" ? { src: saved.src, alt: "" } : null;

  /** Point the application at `next`, and only once it does, delete the photo it replaced. */
  function keep(next: string | null) {
    const old = value.path;
    void onChange({ path: next }, { immediate: true }).then((ok) => {
      if (ok && old && old !== next) void deleteStoredFile(old).catch(() => {});
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,280px)_1fr]">
      <ImageUploader
        label="Your photo"
        archPreview
        tone="var(--peach)"
        describe={false}
        dropLabel="Add your photo"
        maxBytes={DOC_MAX_BYTES}
        value={shown}
        onUpload={async (file, onProgress) => {
          const path = await uploadApplicationPhoto(uid, file, onProgress);
          landed.current = { path, file };
          return { src: path };
        }}
        onChange={(next) => {
          if (next) {
            const up = landed.current;
            if (!up || up.path !== next.src) return;
            landed.current = null;
            setLocal({ path: up.path, src: URL.createObjectURL(up.file) });
            keep(up.path);
          } else {
            setLocal(null);
            keep(null);
          }
        }}
        hint="JPG, PNG or WebP. We resize it for you."
      />

      <div className="space-y-6">
        {saved.status === "loading" ? (
          <p aria-live="polite" className="text-[13px] text-[var(--muted)]">
            Loading your saved photo…
          </p>
        ) : null}
        {saved.status === "failed" ? (
          <p className="rounded-2xl bg-[var(--warning-soft)] px-4 py-3 text-[13px] text-[var(--warning)]">
            Your saved photo could not be shown just now. It is still saved — reload to try again.
          </p>
        ) : null}
        {problems.path ? (
          <p role="alert" className="text-[13px] text-[var(--accent)]">
            {problems.path}
          </p>
        ) : null}
        <p className="text-[14px] leading-relaxed text-[var(--muted)]">
          Somebody deciding whether to tell you the worst week of their life would like to see your face first. Your photo
          stays private — only you and our team see it — until your application is approved.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-[22px] bg-[var(--sage-pale)] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--sage-deep)]">Please</p>
            <ul className="mt-3 space-y-2.5 text-[13.5px]">
              {DO.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span className="mt-0.5 text-[var(--sage-deep)]">
                    <IconCheck size={14} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[22px] bg-[var(--danger-soft)] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--danger)]">Please not</p>
            <ul className="mt-3 space-y-2.5 text-[13.5px]">
              {DONT.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span className="mt-0.5 text-[var(--danger)]">
                    <IconClose size={14} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
