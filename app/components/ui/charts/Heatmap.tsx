"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CHART_INK,
  HATCH_CSS,
  SEQUENTIAL,
  SUPPRESSED_LABEL,
  SUPPRESSION_THRESHOLD,
  sequentialStep,
} from "./palette";
import {
  ChartTooltip,
  HatchPattern,
  alignFor,
  formatValue,
  textWidth,
  truncate,
  useContainerWidth,
  useSvgId,
} from "./shared";
import type { ChartTableData } from "./ChartCard";

/**
 * A grid of magnitudes — weekday by hour is the usual one.
 *
 * One hue, light to dark, in six steps of sage: darker means more, which a
 * reader gets without the key. No numbers in the cells (168 numbers is a
 * spreadsheet, not a picture); the tooltip and the table carry them.
 *
 * A `null` cell is suppressed — fewer than five — and wears the hatch, so it
 * can never be mistaken for a pale "low" cell.
 *
 * One tab stop for the whole grid; the arrow keys move between cells the way
 * they do in a spreadsheet.
 */

/** The table twin: one row per row label, one column per column label. */
export function heatmapTable(
  rows: string[],
  cols: string[],
  values: (number | null)[][],
  { corner = "", valueFormat }: { corner?: string; valueFormat?: (v: number) => string } = {},
): ChartTableData {
  return {
    columns: [corner, ...cols],
    rows: rows.map((row, r) => [
      row,
      ...cols.map((_, c) => {
        const v = values[r]?.[c];
        if (v === null || v === undefined) return v === null ? SUPPRESSED_LABEL : "—";
        return valueFormat ? valueFormat(v) : v;
      }),
    ]),
  };
}

export default function Heatmap({
  rows,
  cols,
  values,
  valueFormat = formatValue,
  cellHeight = 26,
  label = "Heatmap",
}: {
  rows: string[];
  cols: string[];
  /** values[row][col]. `null` means suppressed for privacy. */
  values: (number | null)[][];
  valueFormat?: (value: number) => string;
  cellHeight?: number;
  /** What the chart shows, for screen readers. */
  label?: string;
}) {
  const { ref, node, width } = useContainerWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const hatchId = useSvgId("heat-hatch");

  const known = values.flat().filter((v): v is number => typeof v === "number");
  const lo = Math.min(0, ...known);
  const hi = Math.max(0, ...known);
  const hasSuppressed = values.some((row) => row.some((v) => v === null));
  const step = (v: number) => (hi === lo ? 0 : sequentialStep((v - lo) / (hi - lo)));

  const count = rows.length * cols.length;
  const tabStop = Math.min(focusIndex, Math.max(0, count - 1));

  const rowLabelW = Math.min(
    width * 0.3,
    Math.max(24, ...rows.map((r) => textWidth(r, 11.5))) + 12,
  );
  const headerH = 22;
  const pitch = cellHeight + 2;
  const cellW = (width - rowLabelW) / Math.max(1, cols.length);
  const svgH = headerH + rows.length * pitch;
  const longestCol = Math.max(0, ...cols.map((c) => textWidth(c, 11)));
  const colEvery = Math.max(1, Math.ceil((longestCol + 6) / Math.max(1, cellW)));
  const radius = Math.max(1, Math.min(4, (cellW - 2) / 3));

  const cellAt = (index: number) => ({ r: Math.floor(index / cols.length), c: index % cols.length });
  const valueAt = (index: number) => {
    const { r, c } = cellAt(index);
    return values[r]?.[c];
  };

  function describe(index: number) {
    const { r, c } = cellAt(index);
    const v = valueAt(index);
    const where = `${rows[r]}, ${cols[c]}`;
    if (v === null) return `${where}: fewer than ${SUPPRESSION_THRESHOLD}, hidden to protect privacy`;
    if (v === undefined) return `${where}: no data`;
    return `${where}: ${valueFormat(v)}`;
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const { r, c } = cellAt(index);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = r * cols.length + Math.min(cols.length - 1, c + 1);
    else if (event.key === "ArrowLeft") next = r * cols.length + Math.max(0, c - 1);
    else if (event.key === "ArrowDown") next = Math.min(rows.length - 1, r + 1) * cols.length + c;
    else if (event.key === "ArrowUp") next = Math.max(0, r - 1) * cols.length + c;
    else if (event.key === "Home") next = r * cols.length;
    else if (event.key === "End") next = r * cols.length + cols.length - 1;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    node?.querySelector<SVGGElement>(`[data-mark="${next}"]`)?.focus();
  }

  const tip = active !== null && active < count ? active : null;
  const tipCell = tip !== null ? cellAt(tip) : null;
  const tipX = tipCell ? rowLabelW + cellW * (tipCell.c + 0.5) : 0;
  const tipTop = tipCell ? headerH + tipCell.r * pitch : 0;
  const tipAbove = tipTop > 64;
  const tipValue = tip !== null ? valueAt(tip) : undefined;

  return (
    <div className="w-full">
      <div ref={ref} role="group" aria-label={label} className="relative w-full" style={{ minHeight: svgH }}>
        {width > 0 && count > 0 ? (
          <svg width={width} height={svgH} className="block select-none">
            <defs>
              <HatchPattern id={hatchId} />
            </defs>

            {/* Axis labels are for the eye. Every cell already names its row
                and column, so a screen reader would only hear them twice. */}
            <g aria-hidden>
              {cols.map((col, c) =>
                c % colEvery === 0 ? (
                  <text
                    key={`${col}-${c}`}
                    x={rowLabelW + cellW * (c + 0.5)}
                    y={headerH - 8}
                    textAnchor="middle"
                    fontSize={11}
                    style={{ fill: CHART_INK.text }}
                  >
                    {truncate(col, cellW * colEvery - 4, 11)}
                  </text>
                ) : null,
              )}

              {rows.map((row, r) => (
                <text
                  key={`${row}-${r}`}
                  x={0}
                  y={headerH + r * pitch + pitch / 2}
                  dy="0.32em"
                  fontSize={11.5}
                  style={{ fill: CHART_INK.text }}
                >
                  {truncate(row, rowLabelW - 10, 11.5)}
                </text>
              ))}
            </g>

            <motion.g
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {rows.map((row, r) =>
                cols.map((col, c) => {
                  const index = r * cols.length + c;
                  const v = values[r]?.[c];
                  // The 2px surface gap: each cell is inset 1px on every side.
                  const x = rowLabelW + c * cellW + 1;
                  const y = headerH + r * pitch + 1;
                  const w = Math.max(0, cellW - 2);
                  const fill =
                    v === null
                      ? `url(#${hatchId})`
                      : v === undefined
                        ? "transparent"
                        : SEQUENTIAL[step(v)];
                  return (
                    <g
                      key={`${row}-${col}-${index}`}
                      data-mark={index}
                      tabIndex={index === tabStop ? 0 : -1}
                      role="img"
                      aria-label={describe(index)}
                      className="group cursor-default outline-none"
                      onPointerEnter={() => setActive(index)}
                      onPointerDown={() => setActive(index)}
                      onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setActive(null);
                      }}
                      onFocus={() => {
                        setFocusIndex(index);
                        setActive(index);
                      }}
                      onBlur={() => setActive(null)}
                      onKeyDown={(e) => onKeyDown(e, index)}
                    >
                      {/* The target is the cell plus its share of the gap, so
                          a pointer crossing between cells never lands on
                          nothing and the tooltip does not blink. */}
                      <rect
                        x={rowLabelW + c * cellW}
                        y={headerH + r * pitch}
                        width={cellW}
                        height={pitch}
                        fill="transparent"
                      />
                      <rect x={x} y={y} width={w} height={cellHeight} rx={radius} fill={fill} />
                      {active === index ? (
                        <rect
                          x={x + 0.75}
                          y={y + 0.75}
                          width={Math.max(0, w - 1.5)}
                          height={cellHeight - 1.5}
                          rx={radius}
                          fill="none"
                          strokeWidth={1.5}
                          style={{ stroke: "var(--dark)" }}
                        />
                      ) : null}
                      <rect
                        x={x - 1}
                        y={y - 1}
                        width={w + 2}
                        height={cellHeight + 2}
                        rx={radius + 1}
                        fill="none"
                        strokeWidth={2}
                        className="opacity-0 group-focus-visible:opacity-100"
                        style={{ stroke: "var(--accent)" }}
                      />
                    </g>
                  );
                }),
              )}
            </motion.g>
          </svg>
        ) : null}

        {width > 0 && tipCell ? (
          <ChartTooltip
            x={tipX}
            y={tipAbove ? tipTop : tipTop + pitch}
            bound={width}
            align={alignFor(tipX, width)}
            placement={tipAbove ? "above" : "below"}
            title={`${rows[tipCell.r]} · ${cols[tipCell.c]}`}
            rows={[
              tipValue === null
                ? { value: SUPPRESSED_LABEL, label: "hidden to protect privacy", key: "hatch" }
                : tipValue === undefined
                  ? { value: "No data" }
                  : { value: valueFormat(tipValue), color: SEQUENTIAL[step(tipValue)], key: "square" },
            ]}
          />
        ) : null}
      </div>

      {/* The scale: low to high in the six steps, ends labelled. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] text-[var(--muted)]">
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{valueFormat(lo)}</span>
          <span aria-hidden className="flex gap-[2px]">
            {SEQUENTIAL.map((color) => (
              <span key={color} className="h-3 w-5 rounded-[3px]" style={{ background: color }} />
            ))}
          </span>
          <span className="tabular-nums">{valueFormat(hi)}</span>
          <span className="sr-only">Darker cells mean more.</span>
        </div>
        {hasSuppressed ? (
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-5 rounded-[3px]" style={{ background: HATCH_CSS }} />
            Fewer than {SUPPRESSION_THRESHOLD}, hidden for privacy
          </div>
        ) : null}
      </div>
    </div>
  );
}
