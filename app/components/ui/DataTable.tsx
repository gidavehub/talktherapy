"use client";

import { useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Button from "./Button";
import { EmptyState, Skeleton } from "./Feedback";
import { IconChevronLeft } from "./icons";

/**
 * The list behind the admin and provider screens: payments, providers,
 * sessions, payouts.
 *
 * Two layouts from one set of columns. From md up it is a real table, with a
 * sticky header, sortable columns and hairline rows. Below md every row
 * becomes a card of label and value, because a six-column table on a 375px
 * screen is a sideways scroll nobody finishes.
 *
 * The card clips its overflow rather than scrolling sideways: a scroll
 * container would stop the header sticking to the page. A column that does
 * not fit at md takes `hideBelow: "lg"` instead.
 */

export type DataColumn<Row> = {
  /** Unique per table. Without `render`, the cell shows `row[key]`. */
  key: string;
  header: string;
  render?: (row: Row) => React.ReactNode;
  /** Makes the column sortable. Return a number for amounts and dates. */
  sortValue?: (row: Row) => string | number;
  /** What the CSV gets when `render` returns something that is not text. */
  csvValue?: (row: Row) => string | number;
  align?: "left" | "right" | "center";
  /** Any CSS width, e.g. "140px" or "20%". */
  width?: string;
  /**
   * Leaves the column out of the narrow layouts. "lg" hides it from the
   * table between md and lg; either value leaves it off the phone cards.
   */
  hideBelow?: "md" | "lg";
};

export type DataSort = { key: string; dir: "asc" | "desc" };

export type CsvRecord = Record<string, string | number>;

export type DataTableProps<Row> = {
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  loading?: boolean;
  error?: string | null;
  empty?: { title: string; description?: string };
  /** Rows per page. Pagination appears once there is more than one page. */
  pageSize?: number;
  initialSort?: DataSort;
  /**
   * Adds a "Download CSV" button. Without `rows` the file is the table as
   * sorted, every page and every column; pass `rows` to shape it yourself.
   */
  csv?: { filename: string; rows?: () => CsvRecord[] };
  /** The table's name: shown above it and read out as its label. */
  caption?: string;
  /**
   * Where the header sticks, in pixels from the top of the window. 0 by
   * default; 64 under a screen that puts a PageBar in the AppShell top bar.
   */
  stickyOffset?: number;
  className?: string;
};

/** The sage caps label, shared by the header and the phone cards. */
const LABEL = "text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--sage)]";

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

// The header draws its own hairline underneath, so the line travels with it
// once it sticks over the rows. The first row leaves out its top rule,
// which would otherwise double that line while the table is at rest.
const HEADER_RULE = "shadow-[inset_0_-1px_0_var(--border)]";
const ROW_RULE = "border-t border-[var(--border)] [tr:first-child>&]:border-t-0";

// A click on a link or button inside a row belongs to that control, not to
// the row: "Refund" in a payments row must not also open the payment.
const CONTROLS = "a, button, input, select, textarea, label, summary, [role='button']";

/** Whether a click or key press on a row is meant for the row itself. */
function meantForRow(event: React.SyntheticEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;
  // React bubbles events through portals, so a dialog or a dropdown opened
  // from a cell reaches the row although it is drawn elsewhere on the page.
  // Enter in a "Remove this provider?" dialog must submit that dialog, not
  // open the provider underneath it.
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const control = target.closest(CONTROLS);
  return control === null || control === row || !row.contains(control);
}

/** Dragging across a reference to copy it is not a request to open the row. */
function selectingText(row: HTMLElement): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.anchorNode && row.contains(selection.anchorNode));
}

function field(row: unknown, key: string): unknown {
  return row !== null && typeof row === "object" ? (row as Record<string, unknown>)[key] : undefined;
}

function cellContent<Row>(column: DataColumn<Row>, row: Row): React.ReactNode {
  if (column.render) return column.render(row);
  const raw = field(row, column.key);
  if (raw === null || raw === undefined || raw === "") {
    return <span className="text-[var(--muted)]">—</span>;
  }
  if (typeof raw === "string" || typeof raw === "number") return raw;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return String(raw);
}

function csvContent<Row>(column: DataColumn<Row>, row: Row): string | number {
  if (column.csvValue) return column.csvValue(row);
  if (column.render) {
    const shown = column.render(row);
    if (typeof shown === "string" || typeof shown === "number") return shown;
  }
  const raw = field(row, column.key);
  if (typeof raw === "string" || typeof raw === "number") return raw;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  // A badge or a link has no text to give; the sort key is the next best
  // thing, and is at least the value the column is about.
  if (column.sortValue) return column.sortValue(row);
  return "";
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  // numeric: "Room 9" before "Room 10"; base: "awa" and "Awa" sort together.
  return String(a).localeCompare(String(b), "en-GB", { numeric: true, sensitivity: "base" });
}

// ------------------------------------------------------------------ CSV

function csvCell(value: string | number): string {
  let text = String(value);
  // A cell that starts like a formula is run by a spreadsheet when the file
  // opens. These exports hold names and messages people typed, so a leading
  // quote keeps it as text. Plain negative numbers are left alone.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(lines: (string | number)[][]): string {
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}

function recordsToLines(records: CsvRecord[]): (string | number)[][] {
  // The union of every record's keys, in the order they first appear, so a
  // field missing from the first record still gets a column.
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return [headers, ...records.map((record) => headers.map((header) => record[header] ?? ""))];
}

function downloadCsv(filename: string, text: string) {
  // The byte-order mark is what makes Excel read the file as UTF-8, so a
  // name with an accent arrives as written. Written as an escape because the
  // character itself is invisible, and an editor may quietly drop it.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked well after the click: Firefox and older Safari read the address
  // after the click has returned, and cancel a download whose address has
  // already gone. A few kilobytes held for half a minute costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ------------------------------------------------------------------ table

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg aria-hidden width="9" height="13" viewBox="0 0 10 14" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5L5 2.5l3 3" stroke="currentColor" className={dir === "asc" ? "text-[var(--accent)]" : "opacity-35"} />
      <path d="M2 8.5l3 3 3-3" stroke="currentColor" className={dir === "desc" ? "text-[var(--accent)]" : "opacity-35"} />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </svg>
  );
}

/**
 * The phone's way to sort. A native select, because the system picker is the
 * one control every phone already knows how to use.
 */
function SortSelect<Row>({
  columns,
  sort,
  onChange,
}: {
  columns: DataColumn<Row>[];
  sort: DataSort | null;
  onChange: (sort: DataSort) => void;
}) {
  const id = useId();

  function choose(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    // Split on the last colon: a column key may hold one of its own.
    const at = value.lastIndexOf(":");
    if (at < 0) return;
    onChange({ key: value.slice(0, at), dir: value.slice(at + 1) === "desc" ? "desc" : "asc" });
  }

  return (
    <div className="mb-3 flex items-center justify-end gap-3">
      <label htmlFor={id} className={LABEL}>
        Sort
      </label>
      <div className="relative min-w-0">
        <select
          id={id}
          value={sort ? `${sort.key}:${sort.dir}` : ""}
          onChange={choose}
          className="h-10 max-w-full appearance-none truncate rounded-full border border-[var(--border)] bg-[var(--surface)] pl-4 pr-9 text-[13px] text-[var(--foreground)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10"
        >
          {sort ? null : <option value="">As listed</option>}
          {columns.flatMap((column) => [
            <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
              {column.header}, ascending
            </option>,
            <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
              {column.header}, descending
            </option>,
          ])}
        </select>
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading = false,
  error = null,
  empty,
  pageSize = 20,
  initialSort,
  csv,
  caption,
  stickyOffset = 0,
  className = "",
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<DataSort | null>(initialSort ?? null);
  const [page, setPage] = useState(1);
  const captionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => direction * compare(value(a), value(b)));
  }, [rows, columns, sort]);

  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : Math.max(sorted.length, 1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  // Clamped here rather than corrected in an effect: when a live list
  // shrinks under someone on its last page, they land on the new last page
  // in the same render instead of seeing an empty one first.
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * size, current * size);

  const clickable = Boolean(onRowClick);
  const cardColumns = columns.filter((column) => !column.hideBelow);
  const sortable = columns.filter((column) => column.sortValue);
  const skeletonCount = Math.min(size, 6);

  function toggleSort(key: string) {
    setSort((was) =>
      was?.key === key ? { key, dir: was.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
    setPage(1);
  }

  function chooseSort(next: DataSort) {
    setSort(next);
    setPage(1);
  }

  function goToPage(next: number) {
    setPage(next);
    // Turning the page from the bottom of a long list should show the top
    // of the next one, not leave the reader looking at its last rows.
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 0) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    }
  }

  function activate(event: React.MouseEvent<HTMLElement>, row: Row) {
    if (!meantForRow(event) || selectingText(event.currentTarget)) return;
    onRowClick?.(row);
  }

  function activateByKey(event: React.KeyboardEvent<HTMLElement>, row: Row) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!meantForRow(event)) return;
    event.preventDefault();
    onRowClick?.(row);
  }

  function exportCsv() {
    if (!csv) return;
    const lines = csv.rows
      ? recordsToLines(csv.rows())
      : [columns.map((c) => c.header), ...sorted.map((row) => columns.map((c) => csvContent(c, row)))];
    downloadCsv(csv.filename, toCsv(lines));
  }

  const tableHide = (column: DataColumn<Row>) => (column.hideBelow === "lg" ? "hidden lg:table-cell" : "");

  let body: React.ReactNode;

  if (error) {
    body = (
      <div role="alert" className="rounded-[22px] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-5 py-4">
        <p className="text-[13px] font-medium leading-snug text-[var(--danger)]">This list could not load</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{error}</p>
      </div>
    );
  } else if (!loading && rows.length === 0) {
    body = (
      <EmptyState
        title={empty?.title ?? "Nothing here yet"}
        description={empty?.description}
      />
    );
  } else {
    body = (
      <>
        {loading ? (
          <p role="status" className="sr-only">
            Loading
          </p>
        ) : null}

        {/* From md: the table. */}
        <div className="hidden md:block overflow-clip rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <table
            className="w-full border-separate border-spacing-0"
            aria-labelledby={caption ? captionId : undefined}
            aria-busy={loading || undefined}
          >
            <thead>
              <tr>
                {columns.map((column) => {
                  const align = column.align ?? "left";
                  const active = sort?.key === column.key ? sort.dir : null;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        column.sortValue
                          ? active === "asc"
                            ? "ascending"
                            : active === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                      style={{ width: column.width, top: stickyOffset }}
                      className={`sticky z-10 bg-[var(--surface-2)] px-4 py-3.5 first:pl-6 last:pr-6 font-medium ${HEADER_RULE} ${ALIGN[align]} ${tableHide(column)}`}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={`inline-flex items-center gap-1.5 rounded-full outline-none transition-colors hover:text-[var(--sage-deep)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 ${LABEL} ${
                            align === "right" ? "flex-row-reverse" : ""
                          }`}
                        >
                          <span>{column.header}</span>
                          <SortGlyph dir={active} />
                        </button>
                      ) : (
                        <span className={LABEL}>{column.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: skeletonCount }, (_, i) => (
                    <tr key={i}>
                      {columns.map((column, c) => (
                        <td
                          key={column.key}
                          className={`${ROW_RULE} px-4 py-4 first:pl-6 last:pr-6 ${tableHide(column)}`}
                        >
                          <Skeleton
                            rounded="rounded-full"
                            className={`h-3.5 ${c === 0 ? "w-3/4" : "w-1/2"} ${
                              column.align === "right" ? "ml-auto" : column.align === "center" ? "mx-auto" : ""
                            }`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageRows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? (event) => activate(event, row) : undefined}
                      onKeyDown={clickable ? (event) => activateByKey(event, row) : undefined}
                      className={`transition-colors hover:bg-[var(--cream)]/45 ${
                        clickable
                          ? "cursor-pointer outline-none focus-visible:bg-[var(--cream)]/60 focus-visible:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]"
                          : ""
                      }`}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`${ROW_RULE} px-4 py-3.5 first:pl-6 last:pr-6 align-middle text-[13.5px] leading-snug tabular-nums text-[var(--foreground)] [overflow-wrap:anywhere] ${
                            ALIGN[column.align ?? "left"]
                          } ${tableHide(column)}`}
                        >
                          {cellContent(column, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Below md: a card per row, and a select in place of the headers
            that would otherwise be the only way to sort. */}
        <div className="md:hidden">
          {!loading && sortable.length > 0 && rows.length > 1 ? (
            <SortSelect columns={sortable} sort={sort} onChange={chooseSort} />
          ) : null}
          <ul className="space-y-3" aria-labelledby={caption ? captionId : undefined} aria-busy={loading || undefined}>
            {loading
              ? Array.from({ length: Math.min(skeletonCount, 4) }, (_, i) => (
                  <li
                    key={i}
                    className="space-y-3 rounded-[22px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)]"
                  >
                    <Skeleton rounded="rounded-full" className="h-3.5 w-2/3" />
                    <Skeleton rounded="rounded-full" className="h-3 w-1/2" />
                    <Skeleton rounded="rounded-full" className="h-3 w-1/3" />
                  </li>
                ))
              : pageRows.map((row) => (
                  <li
                    key={rowKey(row)}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? (event) => activate(event, row) : undefined}
                    onKeyDown={clickable ? (event) => activateByKey(event, row) : undefined}
                    className={`rounded-[22px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)] ${
                      clickable
                        ? "cursor-pointer outline-none transition-[transform,box-shadow] active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                        : ""
                    }`}
                  >
                    <dl className="divide-y divide-[var(--border)]">
                      {cardColumns.map((column) => (
                        <div key={column.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                          <dt className={`shrink-0 pt-[3px] ${LABEL}`}>{column.header}</dt>
                          <dd className="min-w-0 text-right text-[13.5px] leading-snug tabular-nums text-[var(--foreground)] [overflow-wrap:anywhere]">
                            {cellContent(column, row)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
          </ul>
        </div>

        {!loading && pageCount > 1 ? (
          <Pagination
            className="mt-4"
            page={current}
            pageCount={pageCount}
            total={sorted.length}
            pageSize={size}
            onPageChange={goToPage}
          />
        ) : null}
      </>
    );
  }

  return (
    <div ref={rootRef} className={`scroll-mt-24 ${className}`}>
      {caption || csv ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {caption ? (
            <p id={captionId} className="font-display text-[18px] font-medium leading-tight">
              {caption}
            </p>
          ) : (
            <span />
          )}
          {csv ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              disabled={loading || (!csv.rows && rows.length === 0)}
            >
              <span className="inline-flex items-center gap-2">
                <DownloadGlyph />
                Download CSV
              </span>
            </Button>
          ) : null}
        </div>
      ) : null}

      {body}
    </div>
  );
}

// ------------------------------------------------------------------ pages

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={SPRING_SNAP}
      className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)]/60 text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}

/**
 * "21–40 of 132", with previous and next. One-based `page`. DataTable draws
 * its own; this is exported for lists that page on the server.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  className = "",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pages" className={`flex items-center justify-between gap-3 ${className}`}>
      <p className="text-[12.5px] text-[var(--muted)] tabular-nums">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <IconChevronLeft size={15} strokeWidth={2.2} />
        </PageButton>
        <span className="min-w-[5.5rem] text-center text-[13px] tabular-nums" aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <PageButton label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <IconChevronLeft size={15} strokeWidth={2.2} className="rotate-180" />
        </PageButton>
      </div>
    </nav>
  );
}
