"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import FileDropzone, { formatBytes } from "@/components/ui/FileDropzone";
import { Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { checkMediaFile, uploadMedia } from "@/lib/content/client";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, type SiteMedia } from "@/lib/content/schema";
import { checkCopy } from "@/lib/content/validate";

/**
 * Add a picture to the media library: choose it, describe it, send it.
 *
 * The description is asked for before the upload, not after: a picture in
 * the library without one is a picture somebody will put on the site
 * without one. It is what the library suggests whenever the picture is
 * chosen; each place on the site can still say it its own way.
 */

const ACCEPT = Object.keys(MEDIA_TYPES);
const ALT_MAX = 200;

export type Chosen = { file: File; preview: string };

/**
 * A picture picked outside the dialog, ready to hand to it — or why it cannot
 * be used. Call from an event handler: it makes the preview. The dialog lets
 * the preview go when it closes.
 */
export function choosePicture(file: File): Chosen | string {
  return checkMediaFile(file) ?? { file, preview: URL.createObjectURL(file) };
}

export function altProblem(alt: string): string | null {
  const clean = alt.replace(/\s+/g, " ").trim();
  if (!clean) return "Describe the picture for people who cannot see it.";
  if (clean.length > ALT_MAX) return `Keep the description to ${ALT_MAX} characters.`;
  return checkCopy(clean);
}

export default function UploadDialog({
  open,
  onClose,
  onUploaded,
  file = null,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (media: SiteMedia) => void;
  /** A picture already chosen — dropped on the page — to start from (see choosePicture). */
  file?: Chosen | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a picture"
      description="JPG, PNG, WebP or AVIF, up to 8 MB. It goes into the media library, where any page can use it."
      variant="dialog"
    >
      {/* Its own component, so every opening starts afresh. */}
      {open ? <UploadBody onClose={onClose} onUploaded={onUploaded} file={file} /> : null}
    </Modal>
  );
}

function UploadBody({
  onClose,
  onUploaded,
  file,
}: {
  onClose: () => void;
  onUploaded: (media: SiteMedia) => void;
  file: Chosen | null;
}) {
  const [chosen, setChosen] = useState<Chosen | null>(file);
  const [alt, setAlt] = useState("");
  const [altTouched, setAltTouched] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;
  const problem = altProblem(alt);

  // The preview is a copy of the file in memory: let it go when it is replaced or the dialog closes.
  useEffect(() => {
    if (!chosen) return;
    const url = chosen.preview;
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  function choose(files: File[]) {
    const file = files[0];
    if (!file) return;
    const picked = choosePicture(file);
    if (typeof picked === "string") {
      setError(picked);
      return;
    }
    setError(null);
    setChosen(picked);
  }

  async function send() {
    setAltTouched(true);
    if (!chosen || problem) return;
    setError(null);
    setProgress(0);
    const result = await uploadMedia(chosen.file, alt.replace(/\s+/g, " ").trim(), (fraction) =>
      setProgress(Math.max(0, Math.min(1, fraction))),
    );
    setProgress(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onUploaded(result.media);
    onClose();
  }

  return (
    <div className="space-y-5">
      {chosen ? (
        <div className="flex items-center gap-4 rounded-[22px] bg-[var(--background)] p-3">
          <span className="arch relative block h-24 w-20 shrink-0 overflow-hidden rounded-b-2xl bg-[var(--sage-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- a file on this computer, not yet anywhere next/image can fetch */}
            <img src={chosen.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{chosen.file.name}</span>
            <span className="block text-[12.5px] text-[var(--muted)]">{formatBytes(chosen.file.size)}</span>
          </span>
          <Button size="sm" variant="ghost" disabled={uploading} onClick={() => setChosen(null)}>
            Change
          </Button>
        </div>
      ) : (
        <FileDropzone
          accept={ACCEPT}
          maxBytes={MEDIA_MAX_BYTES}
          onFiles={choose}
          label="Choose a picture"
          hint="JPG, PNG, WebP or AVIF, up to 8 MB"
        />
      )}

      <Textarea
        label="Describe the picture"
        hint="What someone who cannot see it should know: who is in it and what they are doing. Not “image of”."
        rows={3}
        required
        value={alt}
        maxLength={ALT_MAX * 2}
        disabled={uploading}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => setAltTouched(true)}
        error={altTouched ? problem : null}
      />

      {uploading ? (
        <div role="progressbar" aria-label="Uploading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
          <div className="flex items-center justify-between text-[12.5px]">
            <span>Uploading…</span>
            <span className="tabular-nums text-[var(--muted)]">{Math.round((progress ?? 0) * 100)}%</span>
          </div>
          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--sand)]">
            <motion.span
              className="block h-full origin-left rounded-full bg-[var(--accent)]"
              initial={false}
              animate={{ scaleX: Math.max(0.04, progress ?? 0) }}
              transition={SPRING_SNAP}
            />
          </span>
        </div>
      ) : null}

      {error ? (
        <Alert tone="warning" title="Not uploaded">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
        <Button onClick={() => void send()} disabled={!chosen} loading={uploading}>
          Upload
        </Button>
      </div>
    </div>
  );
}
