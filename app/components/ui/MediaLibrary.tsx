"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Modal from "./Modal";
import Button from "./Button";
import SearchField from "./SearchField";
import FileDropzone from "./FileDropzone";
import { Skeleton, SkeletonList } from "./Feedback";
import { IconCheck, IconImage } from "./icons";

/**
 * A picker over images that already exist: search them by description, pick
 * one, or upload a new one and pick that.
 *
 * Like ImageUploader it holds no data of its own. The caller passes the items
 * in and does the uploading; when an upload finishes, the caller adds the new
 * image to `items` and it appears in the grid with everything else.
 */

export type MediaItem = {
  id: string;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
};

const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const FIVE_MB = 5 * 1000 * 1000;

const GRID = "grid grid-cols-3 items-start gap-3 sm:grid-cols-4";

export default function MediaLibrary({
  open,
  onClose,
  items,
  onPick,
  onUpload,
  loading = false,
  title = "Choose an image",
  accept = DEFAULT_ACCEPT,
  maxBytes = FIVE_MB,
}: {
  open: boolean;
  onClose: () => void;
  items: MediaItem[];
  /** The library does not close itself — close it here if that is wanted. */
  onPick: (item: MediaItem) => void;
  /**
   * Sends a new image. Resolve with its `id` once it is in `items` and it is
   * chosen for the person straight away; resolve with nothing and they pick
   * it themselves. Leave this out and there is no upload tile.
   */
  onUpload?: (file: File, onProgress: (fraction: number) => void) => Promise<void | { id: string }>;
  loading?: boolean;
  title?: string;
  accept?: string[];
  maxBytes?: number;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      // The kit modal is sized for forms; a grid of pictures needs the room.
      className="md:max-w-[880px]"
    >
      {/* The body is its own component so that its state — the search, the
          choice, an upload's progress — starts fresh every time it opens. */}
      <LibraryBody
        items={items}
        onPick={onPick}
        onClose={onClose}
        onUpload={onUpload}
        loading={loading}
        accept={accept}
        maxBytes={maxBytes}
      />
    </Modal>
  );
}

function LibraryBody({
  items,
  onPick,
  onClose,
  onUpload,
  loading,
  accept,
  maxBytes,
}: {
  items: MediaItem[];
  onPick: (item: MediaItem) => void;
  onClose: () => void;
  onUpload?: (file: File, onProgress: (fraction: number) => void) => Promise<void | { id: string }>;
  loading: boolean;
  accept: string[];
  maxBytes: number;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Whether focus was last somewhere in here. See the effect below.
  const focusInside = useRef(false);

  const needle = query.trim().toLowerCase();
  const shown = needle ? items.filter((item) => (item.alt ?? "").toLowerCase().includes(needle)) : items;
  // Looked up rather than stored, so an item that leaves `items` cannot stay
  // picked after it has gone.
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const uploading = progress !== null;

  // The upload tile turns into a progress tile and back, and each swap takes
  // away the control that had focus, dropping it out of the dialog onto the
  // page behind. It is put back: onto the progress while the upload runs,
  // then onto the new image if it was chosen, or the upload tile if not.
  useEffect(() => {
    if (!focusInside.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const grid = rootRef.current?.querySelector("ul");
    const target = uploading
      ? grid?.querySelector<HTMLElement>('[role="progressbar"]')
      : (grid?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? grid?.querySelector<HTMLElement>("button"));
    target?.focus();
  }, [uploading]);

  async function upload(files: File[]) {
    const file = files[0];
    if (!file || !onUpload) return;
    setFailed(false);
    setRejected([]);
    setProgress(0);
    // Progress doubles as "an upload is running", so a report that straggles
    // in after the upload settled would bring the progress tile back for
    // good, with nothing left to clear it. Those are ignored.
    let settled = false;
    try {
      const result = await onUpload(file, (fraction) => {
        if (!settled) setProgress(Math.min(1, Math.max(0, fraction)));
      });
      if (result?.id) {
        setSelectedId(result.id);
        // The new image may not match the search, and should not be hidden.
        setQuery("");
      }
    } catch {
      setFailed(true);
    } finally {
      settled = true;
      setProgress(null);
    }
  }

  const uploadTile = onUpload ? (
    uploading ? (
      <div
        role="progressbar"
        aria-label="Uploading"
        // Focusable from script only, so focus has somewhere to wait.
        tabIndex={-1}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((progress ?? 0) * 100)}
        className="flex aspect-square flex-col items-center justify-center gap-3 rounded-[22px] border-[1.5px] border-dashed border-[var(--accent)] bg-[var(--accent)]/[0.06] p-3 text-center outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/30"
      >
        <span className="text-[12.5px] font-medium">Uploading…</span>
        <span className="h-1.5 w-full max-w-[96px] overflow-hidden rounded-full bg-[var(--sand)]">
          <motion.span
            className="block h-full origin-left rounded-full bg-[var(--accent)]"
            initial={false}
            animate={{ scaleX: Math.max(0.04, progress ?? 0) }}
            transition={SPRING_SNAP}
          />
        </span>
        <span className="text-[11.5px] tabular-nums text-[var(--muted)]">{Math.round((progress ?? 0) * 100)}%</span>
      </div>
    ) : (
      <FileDropzone compact accept={accept} maxBytes={maxBytes} onFiles={upload} onReject={setRejected} label="Upload" />
    )
  ) : null;

  return (
    <div
      ref={rootRef}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(e) => {
        // A control removed in a swap does not reach here (React holds its
        // events while it changes the page), and the file chooser taking the
        // window's focus is not leaving either: focus comes back after.
        const next = e.relatedTarget as Node | null;
        if (next ? !e.currentTarget.contains(next) : document.hasFocus()) focusInside.current = false;
      }}
    >
      <div className="flex items-center gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search by description"
          label="Search images by their description"
        />
        {items.length > 0 ? (
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]" aria-live="polite">
            {needle ? `${shown.length} of ${items.length}` : `${items.length} ${items.length === 1 ? "image" : "images"}`}
          </span>
        ) : null}
      </div>

      {failed || rejected.length ? (
        <div role="alert" className="mt-4 space-y-1 rounded-2xl bg-[var(--danger-soft)] px-4 py-3">
          {failed ? (
            <p className="text-[13px] leading-snug text-[var(--danger)]">
              That did not upload. Check the connection and try again.
            </p>
          ) : null}
          {/* Indexed keys: two files can share a name, and so a message. */}
          {rejected.map((message, i) => (
            <p key={`${i}-${message}`} className="text-[13px] leading-snug text-[var(--danger)]">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        {loading ? (
          <SkeletonList count={8} label="Loading images" className={GRID}>
            <Skeleton className="aspect-square w-full" rounded="rounded-[22px]" />
          </SkeletonList>
        ) : shown.length === 0 && !onUpload ? (
          <Nothing query={needle ? query.trim() : null} onClear={() => setQuery("")} />
        ) : (
          <>
            <ul className={GRID} aria-label="Images">
              {uploadTile ? <li>{uploadTile}</li> : null}
              {shown.map((item) => (
                <li key={item.id}>
                  <Tile
                    item={item}
                    chosen={item.id === selectedId}
                    onSelect={() => setSelectedId(item.id)}
                    onPick={() => onPick(item)}
                  />
                </li>
              ))}
            </ul>
            {shown.length === 0 ? (
              <Nothing query={needle ? query.trim() : null} onClear={() => setQuery("")} upload />
            ) : null}
          </>
        )}
      </div>

      {/* Pinned to the foot of the dialog, so the choice can be confirmed
          without scrolling back down past every picture. The negative margins
          undo the dialog's padding so the bar reaches its edges. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface)]/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:-mb-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="min-w-0 truncate text-[13px] text-[var(--muted)]" aria-live="polite">
          {selected ? (
            <>
              <span className="text-[var(--foreground)]">{selected.alt?.trim() || "No description"}</span>
              {selected.width && selected.height ? (
                <span className="tabular-nums">
                  {" "}
                  · {selected.width} × {selected.height}
                </span>
              ) : null}
            </>
          ) : (
            "Choose an image, then use it."
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!selected} onClick={() => selected && onPick(selected)}>
            Use this image
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tile({
  item,
  chosen,
  onSelect,
  onPick,
}: {
  item: MediaItem;
  chosen: boolean;
  onSelect: () => void;
  onPick: () => void;
}) {
  const described = Boolean(item.alt?.trim());
  return (
    <motion.button
      type="button"
      aria-pressed={chosen}
      aria-label={described ? item.alt : "Image with no description"}
      onClick={onSelect}
      // A double click is "this one", in one go — a shortcut, never the only way.
      onDoubleClick={onPick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={SPRING_SNAP}
      className={`relative block aspect-square w-full overflow-hidden rounded-[22px] bg-[var(--sand)] shadow-[var(--shadow-card)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[var(--accent)]/30 ${
        chosen ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]" : ""
      }`}
    >
      {/* A plain <img>: the items can come from any host the caller uses, and
          next/image refuses hosts it has not been told about. The button
          carries the description, so the picture itself is silent. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt=""
        width={item.width}
        height={item.height}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {chosen ? (
        <span
          aria-hidden
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-accent)]"
        >
          <IconCheck size={14} />
        </span>
      ) : null}
      {/* Visible to whoever is choosing, so a missing description gets
          noticed — and, ideally, written — before the image goes anywhere. */}
      {described ? null : (
        <span
          aria-hidden
          className="absolute bottom-2 left-2 rounded-full bg-[var(--surface)]/90 px-2 py-0.5 text-[10.5px] font-medium text-[var(--foreground)]"
        >
          No description
        </span>
      )}
    </motion.button>
  );
}

function Nothing({
  query,
  onClear,
  upload = false,
}: {
  query: string | null;
  onClear: () => void;
  /** There is an upload tile beside this, so point at it. */
  upload?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-[var(--dark)]/20 px-6 py-8 text-center">
      <span className="arch flex h-12 w-10 items-center justify-center rounded-b-xl bg-[var(--sage)] text-white" aria-hidden>
        <IconImage size={18} />
      </span>
      <p className="font-display text-[18px] font-medium leading-tight">
        {query ? `Nothing described as “${query}”` : "No images yet"}
      </p>
      <p className="max-w-[360px] text-[13px] leading-relaxed text-[var(--muted)]">
        {query
          ? "Only descriptions are searched. Try another word, or clear the search."
          : upload
            ? "Upload the first one and it will appear here."
            : "Images added elsewhere will appear here."}
      </p>
      {query ? (
        <Button size="sm" variant="secondary" onClick={onClear}>
          Clear the search
        </Button>
      ) : null}
    </div>
  );
}
