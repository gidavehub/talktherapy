"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CHART_INK, MAX_SERIES, OTHER_COLOR, seriesColor } from "./palette";
import {
  ChartTooltip,
  formatValue,
  linePath,
  niceTicks,
  stepIndex,
  textWidth,
  truncate,
  useContainerWidth,
} from "./shared";
import type { ChartLegendItem, ChartTableData } from "./ChartCard";

/**
 * Time series.
 *
 * One y-axis, always: two measures on different scales are two charts, never
 * a second axis. Lines are 2px; with a single series an optional wash of
 * area underneath. Hovering anywhere over the plot snaps a crosshair to the
 * nearest date and lists every series there, so nobody has to land on a 2px
 * line. The plot is one tab stop; left and right arrows walk the dates and a
 * live region reads each one out.
 *
 * Up to four series are labelled at their right-hand end when the labels
 * have room and do not collide; otherwise the card's legend and the tooltip
 * carry identity. Labels are never stacked or nudged off their line.
 */

export type LinePoint = { x: number; y: number };

export type LineSeries = {
  id: string;
  label: string;
  /** `x` is a timestamp in milliseconds. */
  points: LinePoint[];
  /** Pin a colour to the entity so a filter that hides a series never repaints the others. */
  color?: string;
};

type Line = LineSeries & { color: string };

const DAY = 86_400_000;

// A full year: "Jul 26" would read as the 26th of July.
const AXIS_MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const AXIS_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const AXIS_TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const TIP_MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const TIP_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIP_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Axis dates change grain with the span: 14:00, then 14 Oct, then Oct 2026. */
function axisFormat(span: number) {
  const format = span >= 330 * DAY ? AXIS_MONTH : span >= 2 * DAY ? AXIS_DAY : AXIS_TIME;
  return (ms: number) => format.format(ms);
}

function tooltipFormat(span: number) {
  const format = span >= 330 * DAY ? TIP_MONTH : span >= 2 * DAY ? TIP_DAY : TIP_TIME;
  return (ms: number) => format.format(ms);
}

/**
 * Six series keep their colours; the seventh onwards are summed into one
 * grey "Other" line rather than handed a generated hue nobody can tell apart.
 */
export function foldLineSeries(series: LineSeries[]): Line[] {
  const kept = series
    .slice(0, MAX_SERIES)
    .map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  if (series.length <= MAX_SERIES) return kept;

  const sums = new Map<number, number>();
  for (const s of series.slice(MAX_SERIES)) {
    for (const p of s.points) sums.set(p.x, (sums.get(p.x) ?? 0) + p.y);
  }
  return [
    ...kept,
    {
      id: "__other",
      label: "Other",
      color: OTHER_COLOR,
      points: [...sums].map(([x, y]) => ({ x, y })),
    },
  ];
}

function sortedXs(lines: Line[]) {
  return [...new Set(lines.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
}

/** The legend for a ChartCard holding this chart, keyed with line strokes. */
export function lineChartLegend(series: LineSeries[]): ChartLegendItem[] {
  return foldLineSeries(series).map((s) => ({ label: s.label, color: s.color, shape: "line" }));
}

/** The table twin: one row per date, one column per series. */
export function lineChartTable(
  series: LineSeries[],
  {
    xLabel = "Date",
    xFormat,
    yFormat,
  }: { xLabel?: string; xFormat?: (ms: number) => string; yFormat?: (v: number) => string } = {},
): ChartTableData {
  const lines = foldLineSeries(series);
  const xs = sortedXs(lines);
  const span = xs.length ? xs[xs.length - 1] - xs[0] : 0;
  const formatX = xFormat ?? tooltipFormat(span);
  const lookups = lines.map((s) => new Map(s.points.map((p) => [p.x, p.y])));

  return {
    columns: [xLabel, ...lines.map((s) => s.label)],
    rows: xs.map((x) => [
      formatX(x),
      ...lookups.map((lookup) => {
        const y = lookup.get(x);
        if (y === undefined) return "—";
        return yFormat ? yFormat(y) : y;
      }),
    ]),
  };
}

export default function LineChart({
  series,
  height = 240,
  yFormat = formatValue,
  xFormat,
  area = false,
  curve = "smooth",
  label = "Line chart",
}: {
  series: LineSeries[];
  /** Total height, x-axis labels included, so the card never scrolls inside. */
  height?: number;
  yFormat?: (value: number) => string;
  /** Formats dates on the axis and in the tooltip. Defaults by span. */
  xFormat?: (ms: number) => string;
  /** A light wash under the line. Single series only — stacked washes muddy. */
  area?: boolean;
  /** Smooth curves are monotone and never overshoot a point. */
  curve?: "smooth" | "straight";
  /** What the chart shows, for screen readers. */
  label?: string;
}) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();

  const lines = foldLineSeries(series);
  const lookups = lines.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
  const ordered = lines.map((s) => [...s.points].sort((a, b) => a.x - b.x));
  const xs = sortedXs(lines);
  const span = xs.length ? xs[xs.length - 1] - xs[0] : 0;
  const formatAxisX = xFormat ?? axisFormat(span);
  const formatTipX = xFormat ?? tooltipFormat(span);

  // Counts start from zero; anything negative pulls the floor down with it.
  const ys = lines.flatMap((s) => s.points.map((p) => p.y));
  const ticks = niceTicks(
    Math.min(0, ...ys),
    Math.max(0, ...ys),
    height < 200 ? 3 : 4,
    ys.every(Number.isInteger),
  );
  const d0 = ticks[0];
  const d1 = ticks[ticks.length - 1];
  const tickText = ticks.map(yFormat);

  const top = 12;
  const bottom = 28;
  const left = Math.ceil(Math.max(...tickText.map((t) => textWidth(t, 11)))) + 12;
  const plotH = Math.max(40, height - top - bottom);
  const sy = (v: number) => top + plotH - ((v - d0) / (d1 - d0 || 1)) * plotH;

  // Direct end labels: a single series is labelled with its latest value (the
  // title already names it); two to four with their names. Only when every
  // line ends on the last date and no two labels sit within 14px — a nudged
  // label detaches from its line and reads as noise, so we drop them instead.
  const lastX = xs[xs.length - 1];
  const ends = ordered.map((points, i) => {
    const last = points[points.length - 1];
    return last
      ? { text: lines.length === 1 ? yFormat(last.y) : lines[i].label, x: last.x, y: sy(last.y) }
      : null;
  });
  const endYs = ends.flatMap((e) => (e ? [e.y] : [])).sort((a, b) => a - b);
  const separated = endYs.every((y, i) => i === 0 || y - endYs[i - 1] >= 14);
  const labelRoom = Math.min(
    140,
    Math.max(0, ...ends.map((e) => (e ? textWidth(e.text, 12) : 0))) + 18,
  );
  const direct =
    lines.length <= 4 &&
    separated &&
    ends.every((e) => e && e.x === lastX) &&
    width - left - labelRoom >= 220;

  const right = direct ? labelRoom : 14;
  const plotW = Math.max(10, width - left - right);
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const sx = (x: number) => (x1 === x0 ? left + plotW / 2 : left + ((x - x0) / (x1 - x0)) * plotW);
  const baseline = sy(Math.max(d0, Math.min(0, d1)));

  // X ticks sit on data positions, thinned to roughly one per 84px.
  const every = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor(plotW / 84))));
  const xTicks = xs.filter((_, i) => i % every === 0);

  const smooth = curve === "smooth";
  const paths = ordered.map((points) =>
    linePath(
      points.map((p) => [sx(p.x), sy(p.y)]),
      smooth,
    ),
  );
  const areaPath =
    area && lines.length === 1 && ordered[0].length > 1
      ? `${paths[0]}L${sx(ordered[0][ordered[0].length - 1].x)},${baseline}L${sx(ordered[0][0].x)},${baseline}Z`
      : null;

  function readout(index: number) {
    const x = xs[index];
    const values = lines.map((s, i) => {
      const y = lookups[i].get(x);
      return `${s.label} ${y === undefined ? "no data" : yFormat(y)}`;
    });
    return `${formatTipX(x)}: ${values.join(", ")}`;
  }

  function pick(clientX: number, box: DOMRect) {
    const px = clientX - box.left;
    let best = 0;
    let bestDistance = Infinity;
    xs.forEach((x, i) => {
      const distance = Math.abs(sx(x) - px);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActive(best);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!xs.length) return;
    if (event.key === "Escape") {
      setActive(null);
      return;
    }
    const next = stepIndex(event.key, active ?? xs.length - 1, xs.length, "horizontal");
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  const activeX = active !== null && active < xs.length ? xs[active] : null;
  const ready = width > 0 && xs.length > 0;

  return (
    <div
      ref={ref}
      tabIndex={xs.length ? 0 : -1}
      role="group"
      aria-roledescription="line chart"
      aria-label={`${label}. Use the left and right arrow keys to read each date.`}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
        setActive((current) => current ?? (xs.length ? xs.length - 1 : null));
      }}
      onBlur={() => {
        setFocused(false);
        setActive(null);
      }}
      // Solid, like the focus stroke on the other charts' marks: the plot is
      // the control, and this ring is the only sign the keys now drive it.
      className="relative w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface)]"
      style={{ height }}
    >
      {ready ? (
        <svg
          width={width}
          height={height}
          aria-hidden
          className="block select-none"
          style={{ touchAction: "pan-y" }}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={(e) => {
            // A finger lifting is not a "leave": keep the reading until the
            // next tap or until focus moves away.
            if (e.pointerType === "mouse") setActive(null);
          }}
        >
          {ticks.map((t, i) => (
            <g key={t}>
              <line
                x1={left}
                x2={left + plotW}
                y1={sy(t)}
                y2={sy(t)}
                strokeWidth={1}
                shapeRendering="crispEdges"
                style={{ stroke: t === 0 ? CHART_INK.axis : CHART_INK.grid }}
              />
              <text
                x={left - 10}
                y={sy(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                className="tabular-nums"
                style={{ fill: CHART_INK.text }}
              >
                {tickText[i]}
              </text>
            </g>
          ))}

          {xTicks.map((x) => {
            const px = sx(x);
            const anchor = px < left + 24 ? "start" : px > left + plotW - 24 ? "end" : "middle";
            return (
              <text
                key={x}
                x={px}
                y={top + plotH + 19}
                textAnchor={anchor}
                fontSize={11}
                style={{ fill: CHART_INK.text }}
              >
                {formatAxisX(x)}
              </text>
            );
          })}

          {areaPath ? (
            <motion.path
              d={areaPath}
              fill={lines[0].color}
              fillOpacity={0.1}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          ) : null}

          {lines.map((s, i) =>
            ordered[i].length === 1 ? (
              <circle
                key={s.id}
                cx={sx(ordered[i][0].x)}
                cy={sy(ordered[i][0].y)}
                r={4}
                fill={s.color}
              />
            ) : (
              <motion.path
                key={s.id}
                d={paths[i]}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
              />
            ),
          )}

          {direct
            ? ends.map((end, i) =>
                end ? (
                  <g key={lines[i].id}>
                    <circle
                      cx={sx(end.x)}
                      cy={end.y}
                      r={4}
                      fill={lines[i].color}
                      strokeWidth={2}
                      style={{ stroke: CHART_INK.surface }}
                    />
                    <text
                      x={sx(end.x) + 10}
                      y={end.y}
                      dy="0.32em"
                      fontSize={12}
                      fontWeight={500}
                      className="tabular-nums"
                      style={{ fill: CHART_INK.strong }}
                    >
                      {truncate(end.text, labelRoom - 18, 12)}
                    </text>
                  </g>
                ) : null,
              )
            : null}

          {activeX !== null ? (
            <g pointerEvents="none">
              <line
                x1={sx(activeX)}
                x2={sx(activeX)}
                y1={top}
                y2={top + plotH}
                strokeWidth={1}
                shapeRendering="crispEdges"
                style={{ stroke: CHART_INK.crosshair }}
              />
              {lines.map((s, i) => {
                const y = lookups[i].get(activeX);
                return y === undefined ? null : (
                  <circle
                    key={s.id}
                    cx={sx(activeX)}
                    cy={sy(y)}
                    r={4.5}
                    fill={s.color}
                    strokeWidth={2}
                    style={{ stroke: CHART_INK.surface }}
                  />
                );
              })}
            </g>
          ) : null}

          {/* The hit layer: the whole plot, so the pointer only has to be near a date. */}
          <rect x={left} y={top} width={plotW} height={plotH} fill="transparent" />
        </svg>
      ) : null}

      {ready && activeX !== null ? (
        <ChartTooltip
          x={sx(activeX)}
          y={top}
          bound={width}
          align={sx(activeX) > left + plotW / 2 ? "end" : "start"}
          placement="below"
          title={formatTipX(activeX)}
          rows={lines.map((s, i) => {
            const y = lookups[i].get(activeX);
            return {
              value: y === undefined ? "—" : yFormat(y),
              label: s.label,
              color: s.color,
              key: "line" as const,
            };
          })}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">
        {focused && active !== null && active < xs.length ? readout(active) : ""}
      </p>
    </div>
  );
}
