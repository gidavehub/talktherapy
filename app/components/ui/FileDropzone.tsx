"use client";

import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * A place to drop files, or to click and choose them.
 *
 * The whole area is one real button, so a keyboard reaches it with Tab and
 * opens the file chooser with Enter or Space, the same as a mouse click. The
 * file input itself stays hidden: its native look cannot be styled to match.
 *
 * Checking type and size here is a courtesy, not a defence — it saves somebody
 * waiting on an upload that was always going to be refused. Storage rules and
 * the server still decide what is actually accepted.
 */

type Rule = { accept: string[]; maxBytes: number; multiple?: boolean };

/** Short names people recognise, for the hint and the error text. */
const TYPE_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/avif": "AVIF",
  "image/heic": "HEIC",
  "image/svg+xml": "SVG",
  "image/*": "any image",
  "application/pdf": "PDF",
  "audio/mpeg": "MP3",
  "audio/*": "any audio",
  "video/mp4": "MP4",
  "video/*": "any video",
  "text/plain": "plain text",
  "text/csv": "CSV",
};

function typeName(type: string): string {
  if (TYPE_NAMES[type]) return TYPE_NAMES[type];
  if (type.startsWith(".")) return type.slice(1).toUpperCase();
  const sub = type.split("/")[1] ?? type;
  return sub.replace(/^x-/, "").toUpperCase();
}

/** "JPG, PNG or WebP". */
export function describeAccept(accept: string[]): string {
  const names = Array.from(new Set(accept.map(typeName)));
  if (names.length <= 1) return names[0] ?? "any file";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** "5 MB", "800 KB". Decimal units, as phones and file managers show them. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    const mb = bytes / 1_000_000;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

/**
 * What a file is, going by its name. Some phones and older Windows set-ups
 * hand over a file with no type at all (WebP and HEIC especially), and a
 * perfectly good photo should not be refused for that.
 */
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  txt: "text/plain",
  csv: "text/csv",
};

/**
 * `accept` takes exact types ("image/png"), families ("image/*") and
 * extensions (".pdf") — the same vocabulary as the input's own attribute.
 */
function matches(file: File, accept: string[]): boolean {
  if (accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || BY_EXTENSION[name.split(".").pop() ?? ""] || "").toLowerCase();
  return accept.some((rule) => {
    const r = rule.toLowerCase();
    if (r.startsWith(".")) return name.endsWith(r);
    if (r.endsWith("/*")) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

/**
 * Splits picked or dropped files into the ones that pass and a plain sentence
 * for each one that does not. Exported so a "Replace" button elsewhere can
 * hold a file to exactly the same rules as the drop area.
 */
export function validateFiles(
  files: File[],
  { accept, maxBytes, multiple = false }: Rule,
): { valid: File[]; errors: string[] } {
  if (!multiple && files.length > 1) {
    return { valid: [], errors: ["One file at a time, please. Choose just one and try again."] };
  }
  const valid: File[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!matches(file, accept)) {
      errors.push(`“${file.name}” is not a file we can take. Use ${describeAccept(accept)}.`);
    } else if (file.size > maxBytes) {
      errors.push(
        `“${file.name}” is ${formatBytes(file.size)}, over the ${formatBytes(maxBytes)} limit. Try a smaller copy.`,
      );
    } else {
      valid.push(file);
    }
  }
  return { valid, errors };
}

function UploadGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4.5 14.5v3A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-3" />
    </svg>
  );
}

export default function FileDropzone({
  accept,
  maxBytes,
  multiple = false,
  onFiles,
  onReject,
  label,
  hint,
  disabled = false,
  compact = false,
  className = "",
}: {
  /** MIME types ("image/png"), families ("image/*") or extensions (".pdf"). */
  accept: string[];
  maxBytes: number;
  multiple?: boolean;
  /** Only the files that passed. Never called with an empty list. */
  onFiles: (files: File[]) => void;
  /**
   * Takes over the error text: the reasons go here instead of under the drop
   * area (an empty list means clear them). For a tile in a grid, where a
   * paragraph underneath would push the rows out of line.
   */
  onReject?: (errors: string[]) => void;
  /** What to do, in a few words: "Add a photo". */
  label: string;
  /** Replaces the default "JPG or PNG, up to 5 MB" line. */
  hint?: string;
  disabled?: boolean;
  /** A small square tile, for a grid (the media library's upload tile). */
  compact?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const labelId = useId();
  const hintId = useId();
  const errorId = useId();

  // dragenter and dragleave fire again for every child the pointer crosses,
  // so a plain boolean flickers. Counting entries and exits does not.
  const depth = useRef(0);

  function take(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const result = validateFiles(files, { accept, maxBytes, multiple });
    if (onReject) onReject(result.errors);
    else setErrors(result.errors);
    if (result.valid.length > 0) onFiles(result.valid);
  }

  // Only files count. Dragging a link or a bit of selected text across the
  // page should not light the area up with an offer it cannot keep.
  function carriesFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function onDragEnter(e: React.DragEvent) {
    if (disabled || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!carriesFiles(e)) return;
    // Without this the browser opens the file in the tab instead of dropping,
    // and whatever was half filled in on the page is lost. That matters most
    // when the area is switched off, so it is refused here rather than ignored.
    e.preventDefault();
    e.dataTransfer.dropEffect = disabled ? "none" : "copy";
  }

  function onDragLeave() {
    if (disabled) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  }

  const line = hint ?? `${describeAccept(accept)}, up to ${formatBytes(maxBytes)}`;
  // "Choose" first: on a phone, the usual case here, there is nothing to drop.
  const action = over
    ? multiple
      ? "Let go to add them"
      : "Let go to add it"
    : multiple
      ? "Choose files, or drop them here"
      : "Choose a file, or drop it here";

  return (
    // The drag handlers sit on this wrapper, not the button: a disabled
    // button does not reliably receive drag events in every browser, and the
    // drop still has to be caught so the file does not open in the tab.
    <div
      className={className}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        // Named by the label alone, with the instructions as its description,
        // so a screen reader does not read the whole lot out as one long name.
        aria-labelledby={labelId}
        aria-describedby={`${hintId}${errors.length ? ` ${errorId}` : ""}`}
        whileTap={disabled ? undefined : { scale: 0.99 }}
        transition={SPRING_SNAP}
        className={`group flex w-full flex-col items-center justify-center text-center rounded-[22px] border-[1.5px] border-dashed outline-none transition-colors focus-visible:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-60 ${
          compact ? "aspect-square gap-2 p-3" : "gap-3 px-6 py-8 md:py-10"
        } ${
          over
            ? "border-[var(--accent)] bg-[var(--accent)]/[0.06]"
            : errors.length
              ? "border-[var(--danger)]/60 bg-[var(--sand)]/50 hover:bg-[var(--sand)]/80"
              : "border-[var(--dark)]/25 bg-[var(--sand)]/50 hover:bg-[var(--sand)]/80"
        }`}
      >
        {/* The arch chip from EmptyState: sage at rest, terracotta to receive. */}
        <motion.span
          aria-hidden
          animate={{ y: over ? -4 : 0 }}
          transition={SPRING_SNAP}
          className={`arch flex shrink-0 items-center justify-center rounded-b-xl text-white transition-colors ${
            compact ? "h-11 w-9" : "h-14 w-12"
          } ${over ? "bg-[var(--accent)]" : "bg-[var(--sage)]"}`}
        >
          <UploadGlyph />
        </motion.span>

        <span id={labelId} className={`block font-medium leading-snug ${compact ? "text-[12.5px]" : "text-[14px]"}`}>
          {label}
        </span>

        {/* In a tile there is no room for the instructions, so they are
            still read out but not shown. Ink at 75% rather than the muted
            token: muted on this sand tint falls under 4.5:1 once the page
            behind is cream, or the area is hovered. */}
        <span
          id={hintId}
          className={
            compact
              ? "sr-only"
              : `block text-[12px] leading-relaxed ${over ? "text-[var(--foreground)]" : "text-[var(--foreground)]/75"}`
          }
        >
          {action}
          <span className="block">{line}</span>
        </span>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        hidden
        tabIndex={-1}
        accept={accept.join(",")}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          take(e.currentTarget.files);
          // Cleared so choosing the same file again still counts as a change.
          e.currentTarget.value = "";
        }}
      />

      {errors.length ? (
        <ul id={errorId} role="alert" className="mt-2 space-y-1">
          {/* Indexed keys: two files can share a name, and so a message. */}
          {errors.map((message, i) => (
            <li key={`${i}-${message}`} className="text-[12.5px] leading-snug text-[var(--danger)]">
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
