"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "../../ui/Button";
import DataTable, { type DataTableProps } from "../../ui/DataTable";
import { Alert, EmptyState } from "../../ui/Feedback";
import { IconClock, IconRetry } from "../../ui/icons";
import { initials } from "./format";
import type { PagedList } from "./usePagedList";

/**
 * The small pieces every staff operations page shares: the status chip, the
 * card a section sits on, the error with its retry, the paged table and its
 * "Load more", and the line that says which clock the times are on.
 */

/** What a table and its "Load more" need of a paged list — whatever came with its first page. */
type ListView<T> = Pick<
  PagedList<T>,
  "items" | "loading" | "error" | "nextCursor" | "loadingMore" | "moreError" | "loadMore" | "reload"
>;

// --------------------------------------------------------------------- held

/**
 * The last thing that was not null. A drawer is closed by setting its row
 * to null, and goes on showing that row while it slides away rather than
 * sliding away blank; a row of counts stays up while the next list loads.
 */
export function useHeld<T>(value: T | null): T | null {
  const [held, setHeld] = useState(value);
  if (value !== null && value !== held) setHeld(value);
  return value ?? held;
}

// --------------------------------------------------------------------- chips

export type ChipTone = "neutral" | "muted" | "accent" | "info" | "warning" | "positive" | "danger" | "dark";

// The same pairs as the provider application's StatusBadge, so a status
// reads the same on every staff page. The word carries it; colour only helps.
const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-[var(--sand)] text-[var(--foreground)]",
  muted: "bg-[var(--sand)] text-[var(--muted)]",
  accent: "bg-[var(--accent)] text-white",
  info: "bg-[var(--info-soft)] text-[var(--info)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  positive: "bg-[var(--sage)] text-white",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  dark: "bg-[var(--dark)] text-[var(--cream)]",
};

export function Chip({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[11.5px] font-medium ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------- section

/** A card on the page with a serif title — the detail pages are built of these. */
export function Section({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-medium leading-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------- people

/** Initials in a small arch: the staff pages' stand-in for a face. */
export function PersonMark({ name, className = "" }: { name: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`arch flex h-10 w-9 shrink-0 items-end justify-center rounded-b-lg bg-[var(--peach)] pb-1.5 text-[12px] font-medium text-[var(--dark)] ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/** A person's name, linked to their account page. */
export function PersonLink({ uid, name, fallback = "Unknown" }: { uid: string; name: string | null; fallback?: string }) {
  if (!uid) return <span className="text-[var(--muted)]">{name ?? fallback}</span>;
  return (
    <Link
      href={`/admin/users/${encodeURIComponent(uid)}`}
      className="rounded-sm text-[var(--accent-deep)] underline-offset-4 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"
    >
      {name ?? fallback}
    </Link>
  );
}

/** A reference somebody may need to copy: monospace, and selected whole on a click. */
export function Reference({ children }: { children: string }) {
  return <span className="select-all break-all font-mono text-[12.5px] text-[var(--muted)]">{children}</span>;
}

// --------------------------------------------------------------------- time

/** Says which clock the times on a page are on. */
export function BanjulNote({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[12px] text-[var(--muted)] ${className}`}>
      <IconClock size={13} />
      Times are Banjul time (UTC).
    </p>
  );
}

// ------------------------------------------------------------------- states

/** Something did not load: what happened, and a way to try again. */
export function LoadError({
  title = "This did not load",
  message,
  onRetry,
  busy = false,
  className = "",
}: {
  title?: string;
  message: string;
  onRetry: () => void;
  /** Trying again now: for a page that keeps the error up while it asks. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <Alert
      tone="warning"
      title={title}
      className={className}
      action={
        <Button size="sm" variant="secondary" loading={busy} onClick={onRetry}>
          <span className="inline-flex items-center gap-2">
            <IconRetry size={14} />
            Try again
          </span>
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

/** "Load more" under a list the server pages, with its own error and retry. */
export function LoadMore<T>({ list, noun, end }: { list: ListView<T>; noun: string; end?: string }) {
  if (!list.nextCursor && !list.moreError) {
    return list.items.length > 0 ? (
      <p className="mt-4 text-center text-[12.5px] text-[var(--muted)]">
        {end ?? `That is every ${noun} — ${list.items.length.toLocaleString("en-GB")} shown.`}
      </p>
    ) : null;
  }
  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      {list.moreError ? (
        <p role="alert" className="text-center text-[13px] text-[var(--danger)]">
          {list.moreError}
        </p>
      ) : null}
      <Button variant="secondary" size="md" loading={list.loadingMore} onClick={list.loadMore}>
        {list.moreError ? "Try again" : "Load more"}
      </Button>
      <p className="text-[12px] text-[var(--muted)]">{list.items.length.toLocaleString("en-GB")} shown so far</p>
    </div>
  );
}

/**
 * The table's own page size, set past anything "Load more" will reach. Not
 * Infinity: the table sizes its loading skeleton from it, and a size of
 * "however many rows there are" is one skeleton row while there are none.
 */
const ONE_PAGE = 1000;

/**
 * DataTable over a server-paged list: skeleton rows while the first page
 * comes, the error with a retry, the empty state, and "Load more" beneath.
 *
 * Every row the server has sent is on one page of the table — the server
 * does the paging, so the table's own pages are turned off — and in the
 * order the server sent them, newest or soonest first.
 */
export function PagedTable<Row>({
  list,
  noun,
  end,
  ...table
}: Omit<DataTableProps<Row>, "rows" | "loading" | "error" | "pageSize"> & {
  list: ListView<Row>;
  /** What a row is, for "That is every session". */
  noun: string;
  /** Said under the last page instead, when "every" would not be true — a search's best matches. */
  end?: string;
}) {
  if (list.error) return <LoadError message={list.error} onRetry={list.reload} />;

  // A filtered page that found nothing in the stretch it read, but has more
  // to read: not "none", just "none yet".
  if (!list.loading && list.items.length === 0 && list.nextCursor) {
    return (
      <EmptyState
        title="None found yet"
        description="Only the most recent part of the list has been looked through so far. Look further back to keep searching."
        action={
          <Button variant="secondary" loading={list.loadingMore} onClick={list.loadMore}>
            Look further back
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <DataTable {...table} rows={list.items} loading={list.loading} pageSize={ONE_PAGE} />
      {list.loading ? null : <LoadMore list={list} noun={noun} end={end} />}
    </div>
  );
}

/** Two to four filters in a row, wrapping on a phone. */
export function FilterRow({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {children}
    </div>
  );
}
