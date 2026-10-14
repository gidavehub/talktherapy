"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Button from "./Button";
import FileDropzone, { validateFiles } from "./FileDropzone";
import { Input } from "./Input";
import { ArchFrame, ARCH_TONES } from "./Arch";

/**
 * One image, chosen, uploaded, previewed and described.
 *
 * It knows nothing about where images live. The caller's `onUpload` sends the
 * file wherever it goes — Firebase Storage today — reports progress, and
 * resolves with the URL to keep; this component only shows what is happening
 * and hands the result back through `onChange`.
 *
 * The description is part of the value, not an afterthought: an image without
 * one is a blank to anybody using a screen reader.
 */

export type ImageValue = { src: string; alt: string };

const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const FIVE_MB = 5 * 1000 * 1000;

/** The file is kept, so trying again does not mean choosing it again. */
function UploadFailed({
  onRetry,
  disabled = false,
  className = "",
}: {
  onRetry: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-2xl bg-[var(--danger-soft)] px-4 py-3 ${className}`}>
      <p className="text-[13px] leading-snug text-[var(--danger)]">
        That did not upload. Check the connection and try again.
      </p>
      <div className="mt-3">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export default function ImageUploader({
  label,
  value,
  onUpload,
  onChange,
  aspect,
  archPreview = false,
  tone = ARCH_TONES[0],
  maxBytes = FIVE_MB,
  accept = DEFAULT_ACCEPT,
  requireAlt = false,
  describe = true,
  dropLabel = "Add an image",
  hint,
  disabled = false,
  className = "",
}: {
  label: string;
  value?: { src: string; alt?: string } | null;
  /**
   * Sends the file and resolves with where it now lives. Call `onProgress`
   * with 0–1 as it goes; reject to show the upload failed.
   */
  onUpload: (file: File, onProgress: (fraction: number) => void) => Promise<{ src: string }>;
  onChange: (value: ImageValue | null) => void;
  /** Width over height, as CSS aspect-ratio: 1 square, 3/4 a portrait. */
  aspect?: number;
  /** Show the image standing in an arch, as people appear across the app. */
  archPreview?: boolean;
  /** The arch colour behind the image, when `archPreview` is on. */
  tone?: string;
  maxBytes?: number;
  accept?: string[];
  /** The description must be filled in (it is still the caller who blocks saving). */
  requireAlt?: boolean;
  /**
   * Ask for a description at all. Off only where the image is described by
   * where it is shown — a person's own photo beside their name — rather than
   * being content that needs words of its own.
   */
  describe?: boolean;
  /** What the empty drop area says. */
  dropLabel?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  // The local preview of the file on its way up, as a blob: URL.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [altTouched, setAltTouched] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const hintId = useId();
  const progressId = useId();

  // Each upload gets a number. A slow one that finishes after it was replaced
  // or removed must not land on top of what came after it.
  const latest = useRef(0);

  // Whether focus was last somewhere in here. See the effect below.
  const focusInside = useRef(false);

  const ratio = aspect ?? (archPreview ? 4 / 5 : 1);
  const uploading = pendingUrl !== null;
  const shown = pendingUrl ?? value?.src ?? null;
  const hasImage = shown !== null;
  const alt = value?.alt ?? "";
  const altMissing = requireAlt && Boolean(value) && alt.trim() === "";

  // Swapping the drop area for the preview, or back, removes whichever
  // control had focus, and the browser drops it to the top of the page. A
  // keyboard user would have to tab all the way back, so focus goes to the
  // first control of whatever replaced it. Only when it was lost from in
  // here: a value arriving from the parent on load must not steal it.
  useEffect(() => {
    if (!focusInside.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    rootRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }, [hasImage]);

  async function upload(file: File) {
    const id = ++latest.current;
    // Made here, in the event, rather than during render: React may render
    // twice, or tear down and remount in development, and a URL made there
    // ends up leaked, or revoked while it is still on screen.
    const url = URL.createObjectURL(file);
    setErrors([]);
    setFailed(null);
    setProgress(0);
    setPendingUrl(url);
    try {
      const { src } = await onUpload(file, (fraction) => {
        if (latest.current === id) setProgress(Math.min(1, Math.max(0, fraction)));
      });
      if (latest.current !== id) return;
      // A new picture needs its own description: the old one described
      // something else, and keeping it would quietly mislabel the new image.
      setAltTouched(false);
      onChange({ src, alt: "" });
    } catch {
      if (latest.current !== id) return;
      setFailed(file);
    } finally {
      if (latest.current === id) setPendingUrl(null);
      // Nothing will show this preview again, whether the upload landed,
      // failed or was overtaken. An image already drawn stays drawn.
      URL.revokeObjectURL(url);
    }
  }

  function take(files: File[]) {
    const file = files[0];
    if (file) void upload(file);
  }

  function remove() {
    // Bumping the count orphans any upload still in flight. Its preview URL
    // is revoked when that upload settles.
    latest.current += 1;
    setPendingUrl(null);
    setFailed(null);
    setErrors([]);
    setAltTouched(false);
    onChange(null);
  }

  // The preview: the image in an arch, or in a soft rounded frame.
  const image = shown ? (
    // A plain <img>, not next/image: while uploading the preview is a blob:
    // URL that only this tab can see, and the finished URL may be on any host
    // the caller uses — the optimiser can fetch neither reliably.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      // While a new picture is going up, the description in hand is still
      // the old one's, so the preview says nothing rather than the wrong thing.
      alt={uploading ? "" : alt}
      className={`absolute inset-0 h-full w-full object-cover ${archPreview ? "object-top" : ""} transition-[filter] duration-300 ${
        uploading ? "brightness-75" : ""
      }`}
    />
  ) : null;

  return (
    // A group, not a <label>: there is no single control to point a label at
    // (a drop area, then buttons and a text field), so the name is given to
    // the whole group instead.
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(e) => {
        // A control removed in a swap does not reach here (React holds its
        // events while it changes the page). Nor does it count as leaving
        // when the whole window lost focus, which is what the file chooser
        // opening looks like: focus comes back to the same place after.
        const next = e.relatedTarget as Node | null;
        if (next ? !e.currentTarget.contains(next) : document.hasFocus()) focusInside.current = false;
      }}
      className={className}
    >
      <p id={labelId} className="mb-2 block text-[11px] uppercase tracking-[0.24em] font-medium text-[var(--accent)]">
        {label}
      </p>
      {shown ? (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="w-[168px] shrink-0 sm:w-[200px]">
            {archPreview ? (
              <ArchFrame tone={tone} className="w-full">
                <div style={{ aspectRatio: ratio }}>{image}</div>
              </ArchFrame>
            ) : (
              <div
                className="relative w-full overflow-hidden rounded-[22px] bg-[var(--sand)] shadow-[var(--shadow-card)]"
                style={{ aspectRatio: ratio }}
              >
                {image}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            {uploading ? (
              <div>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span id={progressId}>Uploading…</span>
                  <span className="tabular-nums text-[var(--muted)]">{Math.round(progress * 100)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby={progressId}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--sand)]"
                >
                  <motion.div
                    className="h-full origin-left rounded-full bg-[var(--accent)]"
                    initial={false}
                    // Never quite empty, so the bar reads as started at once.
                    animate={{ scaleX: Math.max(0.04, progress) }}
                    transition={SPRING_SNAP}
                  />
                </div>
              </div>
            ) : null}

            {failed ? <UploadFailed disabled={disabled} onRetry={() => void upload(failed)} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => replaceRef.current?.click()}
              >
                Replace
              </Button>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={remove}>
                Remove
              </Button>
            </div>
            <input
              ref={replaceRef}
              type="file"
              hidden
              tabIndex={-1}
              accept={accept.join(",")}
              onChange={(e) => {
                const result = validateFiles(Array.from(e.currentTarget.files ?? []), { accept, maxBytes });
                setErrors(result.errors);
                take(result.valid);
                // Cleared so choosing the same file again still counts.
                e.currentTarget.value = "";
              }}
            />
            {errors.length ? (
              <ul role="alert" className="space-y-1">
                {errors.map((message, i) => (
                  <li key={`${i}-${message}`} className="text-[12.5px] leading-snug text-[var(--danger)]">
                    {message}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* The description belongs to the finished image, so it waits
                until there is one. */}
            {describe && value && !uploading ? (
              <Input
                label="Describe the image"
                value={alt}
                required={requireAlt}
                disabled={disabled}
                onChange={(e) => onChange({ src: value.src, alt: e.target.value })}
                onBlur={() => setAltTouched(true)}
                placeholder="For example, two friends talking on a bench"
                hint="Read aloud to people using a screen reader. Say what is in the picture."
                error={altMissing && altTouched ? "Add a short description before saving." : null}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <FileDropzone
            accept={accept}
            maxBytes={maxBytes}
            onFiles={take}
            label={dropLabel}
            disabled={disabled}
          />
          {failed ? (
            <UploadFailed className="mt-3" disabled={disabled} onRetry={() => void upload(failed)} />
          ) : null}
        </>
      )}
      {hint ? (
        <p id={hintId} className="mt-3 text-[12px] leading-snug text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
