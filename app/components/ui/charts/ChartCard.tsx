"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../../motion/primitives";
import { HATCH_CSS } from "./palette";
import { formatCell } from "./shared";

/**
 * The frame every chart sits in: a surface card with the brand header, an
 * optional legend, and a Chart / Table switch.
 *
 * The table is not an extra. It is the accessible twin of the chart — the
 * same numbers as rows a screen reader can walk, and the place a value lives
 * when its colour is too light to label (the ochre slot) or its mark too
 * small to hover. So `table` is required: a chart without one is not done.
 *
 * Loading shows a chart-shaped placeholder; `refreshing` instead holds the
 * last render at half strength, so a date-range change does not flash the
 * card back to a skeleton and jump the layout.
 */

export type ChartLegendItem = {
  label: string;
  color: string;
  /** Mirror the mark: a short stroke for lines, a square for bars and slices. */
  shape?: "square" | "line" | "hatch";
};

export type ChartTableData = {
  columns: string[];
  rows: (string | number)[][];
};

type View = "chart" | "table";

export default function ChartCard({
  eyebrow,
  title,
  subtitle,
  legend,
  table,
  actions,
  children,
  loading = false,
  refreshing = false,
  empty,
  note,
  minHeight = 240,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Shown only for two or more series — with one, the title already names it. */
  legend?: ChartLegendItem[];
  /** The same data as the chart, as rows. Required: it is the accessible twin. */
  table: ChartTableData;
  /** Extra controls in the header, e.g. a metric switch. Filters belong above the cards. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** First load: a placeholder in the chart's shape. */
  loading?: boolean;
  /** Reload after a filter change: keep the last render, dimmed. */
  refreshing?: boolean;
  /** When set, the card shows this message instead of a chart. */
  empty?: string;
  /** A footnote under the chart, e.g. how small groups are hidden. */
  note?: string;
  /** Height reserved for the placeholder and the empty state. */
  minHeight?: number;
  className?: string;
}) {
  const [view, setView] = useState<View>("chart");
  const uid = useId();
  const titleId = `${uid}-title`;

  const settled = !loading && !empty;
  const showLegend = settled && view === "chart" && legend && legend.length >= 2;

  let body: React.ReactNode;
  if (loading) {
    body = <ChartSkeleton height={minHeight} />;
  } else if (empty) {
    body = <EmptyChart message={empty} height={minHeight} />;
  } else {
    // Both views dim while refreshing: the table is as stale as the chart.
    body = (
      <div
        aria-busy={refreshing || undefined}
        className={`transition-opacity duration-300 ${refreshing ? "opacity-45" : "opacity-100"}`}
      >
        {view === "table" ? <ChartTable caption={title} data={table} /> : children}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.28em] text-[var(--sage)]">
              {eyebrow}
            </p>
          ) : null}
          <h3
            id={titleId}
            className="font-display text-[20px] font-medium leading-tight text-[var(--foreground)] md:text-[22px]"
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        {actions || settled ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
            {settled ? <ViewSwitch id={uid} value={view} onChange={setView} /> : null}
          </div>
        ) : null}
      </header>

      {showLegend ? <Legend items={legend} /> : null}

      <div className="mt-5">{body}</div>

      {note ? (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">{note}</p>
      ) : null}
    </section>
  );
}

/**
 * Chart / Table, as a small segmented switch. The sliding surface pill uses
 * a layoutId scoped to this card, so two cards on one page do not trade
 * indicators.
 */
function ViewSwitch({
  id,
  value,
  onChange,
}: {
  id: string;
  value: View;
  onChange: (next: View) => void;
}) {
  const options: { id: View; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "table", label: "Table" },
  ];

  return (
    <div
      role="group"
      aria-label="Show as"
      className="inline-flex items-center rounded-full bg-[var(--sand)] p-1"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            // The resting label is dark-soft, not muted: muted on the sand
            // track is 4.2:1, under AA for text this small.
            className={`relative h-8 rounded-full px-3.5 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
              active
                ? "text-[var(--foreground)]"
                : "text-[var(--dark-soft)] hover:text-[var(--foreground)]"
            }`}
          >
            {active ? (
              <motion.span
                layoutId={`${id}-view`}
                transition={SPRING_SNAP}
                className="absolute inset-0 rounded-full bg-[var(--surface)] shadow-[var(--shadow-card)]"
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Legend({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          className="flex items-center gap-2 text-[12.5px] text-[var(--foreground)]"
        >
          <LegendSwatch item={item} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function LegendSwatch({ item }: { item: ChartLegendItem }) {
  if (item.shape === "line") {
    return (
      <span
        aria-hidden
        className="h-[2px] w-4 shrink-0 rounded-full"
        style={{ background: item.color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
      style={{ background: item.shape === "hatch" ? HATCH_CSS : item.color }}
    />
  );
}

// Matches what charts put in table cells: 1,284 · 12.9K · 42% · <10 · —
// and money as the app writes it (D700, GMD 1,200), so fees right-align too.
const NUMERIC_CELL = /^(?:[−+-]?(?:D|GMD\s?)?[<>]?\s?\d[\d,.]*\s?[%KMBk]?|—)$/;

function isNumericColumn(rows: (string | number)[][], column: number) {
  return rows.every((row) => {
    const cell = row[column];
    return cell === undefined || typeof cell === "number" || NUMERIC_CELL.test(cell.trim());
  });
}

/**
 * The table twin. The first column is the row header (a date, a topic) so a
 * screen reader announces it with each value; number columns right-align on
 * tabular figures so they can be compared down the column.
 */
function ChartTable({ caption, data }: { caption: string; data: ChartTableData }) {
  const numeric = data.columns.map((_, i) => i > 0 && isNumericColumn(data.rows, i));

  return (
    // Focusable because it scrolls (24 hour columns on a phone, a long list
    // of dates): without a tab stop a keyboard cannot reach what is off to
    // the side in browsers that do not make scrollers focusable themselves.
    <div
      tabIndex={0}
      role="group"
      aria-label={`${caption}, as a table`}
      className="max-h-[420px] overflow-auto rounded-[18px] border border-[var(--border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
    >
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
          <tr>
            {data.columns.map((column, i) => (
              // The house caps label, as DataTable heads its columns, in
              // sage-deep: plain sage on surface-2 is 3.4:1, too faint at 10.5px.
              <th
                key={`${column}-${i}`}
                scope="col"
                className={`whitespace-nowrap px-3 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.28em] text-[var(--sage-deep)] sm:px-4 ${
                  numeric[i] ? "text-right" : "text-left"
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r} className="border-t border-[var(--border)]">
              {row.map((cell, i) => {
                const text = typeof cell === "number" ? formatCell(cell) : cell;
                return i === 0 ? (
                  <th
                    key={i}
                    scope="row"
                    className="whitespace-nowrap px-3 py-2.5 text-left font-normal text-[var(--foreground)] sm:px-4"
                  >
                    {text}
                  </th>
                ) : (
                  <td
                    key={i}
                    className={`whitespace-nowrap px-3 py-2.5 text-[var(--foreground)] sm:px-4 ${
                      numeric[i] ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A placeholder in the shape of a chart: a baseline and columns of sand. */
function ChartSkeleton({ height }: { height: number }) {
  const columns = [0.42, 0.66, 0.5, 0.82, 0.58, 0.74, 0.48, 0.62];
  return (
    <div
      role="status"
      aria-label="Loading chart"
      aria-busy="true"
      className="flex items-end gap-2 border-b border-[var(--border)] sm:gap-3"
      style={{ height }}
    >
      {columns.map((h, i) => (
        <span
          key={i}
          aria-hidden
          className="flex-1 rounded-t-[6px] bg-[var(--sand)] motion-safe:animate-pulse"
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </div>
  );
}

function EmptyChart({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-[var(--dark)]/15 bg-[var(--surface-2)]/50 px-6 text-center"
      style={{ minHeight: height }}
    >
      <svg
        aria-hidden
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-[var(--sage)]"
      >
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
      <p className="max-w-[340px] text-[13.5px] leading-relaxed text-[var(--muted)]">{message}</p>
    </div>
  );
}
