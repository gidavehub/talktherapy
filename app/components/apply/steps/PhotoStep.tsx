"use client";

import { useEffect, useRef, useState } from "react";
import ImageUploader from "../../ui/ImageUploader";
import { IconCheck, IconClose } from "../../ui/icons";
import { deleteStoredFile, privateFileUrl, uploadApplicationPhoto } from "@/lib/providerApplication-client";
import type { StepProps } from "./types";

const DO = ["Your face, looking at the camera", "Eyes open, a natural expression", "Good light — face a window", "A plain wall behind you"];
const DONT = ["Sunglasses, filters or stickers", "Group photos or cropped friends", "Logos, text or certificates", "Somebody else's photo"];

export default function PhotoStep({ uid, value, onChange, problems }: StepProps<"photo">) {
  // What is on screen. For a photo already saved it is fetched through the
  // Storage rules as a local blob, never a shareable link.
  const [preview, setPreview] = useState<{ path: string; src: string } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const uploaded = useRef<string | null>(null);

  useEffect(() => {
    const path = value.path;
    if (!path || preview?.path === path) return;
    let cancelled = false;
    privateFileUrl(path)
      .then((src) => {
        if (!cancelled) setPreview({ path, src });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value.path, preview?.path]);

  const shown = value.path && preview?.path === value.path ? { src: preview.src, alt: "" } : null;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,280px)_1fr]">
      <ImageUploader
        label="Your photo"
        archPreview
        tone="var(--peach)"
        describe={false}
        dropLabel="Add your photo"
        maxBytes={10 * 1024 * 1024}
        value={shown}
        onUpload={async (file, onProgress) => {
          const path = await uploadApplicationPhoto(uid, file, onProgress);
          uploaded.current = path;
          return { src: URL.createObjectURL(file) };
        }}
        onChange={(next) => {
          if (next && uploaded.current) {
            setPreview({ path: uploaded.current, src: next.src });
            setLoadFailed(false);
            onChange({ path: uploaded.current }, { immediate: true });
          } else if (!next) {
            const old = value.path;
            setPreview(null);
            onChange({ path: null }, { immediate: true });
            if (old) void deleteStoredFile(old);
          }
        }}
        hint="JPG, PNG or WebP. We resize it for you."
      />

      <div className="space-y-6">
        {loadFailed && value.path && !shown ? (
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
