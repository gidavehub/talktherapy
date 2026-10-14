"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CHART_INK,
  SUPPRESSED_LABEL,
  SUPPRESSION_THRESHOLD,
  seriesColor,
} from "./palette";
import {
  ChartTooltip,
  HatchPattern,
  alignFor,
  barPath,
  formatShare,
  formatValue,
  niceTicks,
  stepIndex,
  textWidth,
  truncate,
  useContainerWidth,
  useSvgId,
  type TooltipRow,
} from "./shared";
import type { ChartTableData } from "./ChartCard";

/**
 * One series of bars.
 *
 * Horizontal is the default because it is the right shape for a ranking —
 * topics, languages, regions — where the labels are words and need room to
 * be read. Pass the rows already in the order you want them read (largest
 * first, for a ranking); the chart does not re-sort, because ordered
 * categories such as age bands must keep their order.
 *
 * Every bar is one colour: colouring bars darker-where-bigger would spend the
 * only free channel saying what the length already says.
 *
 * Small-cell suppression: a row marked `suppressed` is a group under the
 * threshold (five people). It draws as a hatched placeholder up to the
 * threshold, labelled "<5", and its value is never shown, because a precise
 * small count can be enough to identify somebody.
 *
 * Marks: bars at most 24px thick (16px horizontal), 4px rounded at the data
 * end and square on the baseline. Each bar's hover and focus target is its
 * whole row or column, not the painted pixels. One tab stop; arrow keys move
 * between bars.
 */

export type BarDatum = {
  label: string;
  value: number;
  /**
   * A group under the threshold, withheld for privacy. The chart never reads
   * `value` for these, so send 0 from the server: a real small count sitting
   * in the page data can be read by anyone who opens the dev tools.
   */
  suppressed?: boolean;
};

const ROW = 34;
const BAR = 16;

/** The table twin: label, value, and share of the shown total. */
export function barChartTable(
  data: BarDatum[],
  {
    labelHeading = "Category",
    valueHeading = "Count",
    valueFormat,
  }: { labelHeading?: string; valueHeading?: string; valueFormat?: (v: number) => string } = {},
): ChartTableData {
  const total = data.reduce((sum, d) => sum + (d.suppressed ? 0 : d.value), 0);
  return {
    columns: [labelHeading, valueHeading, "Share"],
    rows: data.map((d) =>
      d.suppressed
        ? [d.label, SUPPRESSED_LABEL, "—"]
        : [d.label, valueFormat ? valueFormat(d.value) : d.value, total ? formatShare(d.value / total) : "—"],
    ),
  };
}

export default function BarChart({
  data,
  orientation = "horizontal",
  color = seriesColor(0),
  valueFormat = formatValue,
  height = 240,
  label = "Bar chart",
  shareOf,
}: {
  data: BarDatum[];
  orientation?: "horizontal" | "vertical";
  /** The series colour. One colour for every bar. */
  color?: string;
  valueFormat?: (value: number) => string;
  /** Vertical only: total height including the axis. Horizontal grows with its rows. */
  height?: number;
  /** What the chart shows, for screen readers. */
  label?: string;
  /**
   * What each bar's share is a share of. Left out, the bars are the parts of
   * one whole and it is their shown total. Give the real total and what it
   * counts when the bars are not parts of it — answers where somebody could
   * pick several ("37% of people") — or null where a share means nothing,
   * as for the same people counted day after day.
   */
  shareOf?: { total: number; label: string } | null;
}) {
  const { ref, node, width } = useContainerWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const hatchId = useSvgId("bar-hatch");

  const shown = data.filter((d) => !d.suppressed);
  const total = shown.reduce((sum, d) => sum + d.value, 0);
  const whole = shareOf === undefined ? { total, label: "total" } : shareOf;
  const shareText = (value: number) =>
    whole && whole.total ? `${formatShare(value / whole.total)} of ${whole.label}` : null;
  const anySuppressed = shown.length < data.length;
  // A suppressed bar is drawn up to the threshold, so the scale must reach it.
  const max = Math.max(0, ...shown.map((d) => d.value), anySuppressed ? SUPPRESSION_THRESHOLD : 0);
  const valueText = data.map((d) => (d.suppressed ? SUPPRESSED_LABEL : valueFormat(d.value)));
  const tabStop = Math.min(focusIndex, Math.max(0, data.length - 1));

  function ariaFor(i: number) {
    const d = data[i];
    if (d.suppressed) return `${d.label}: fewer than ${SUPPRESSION_THRESHOLD}, hidden to protect privacy`;
    const share = shareText(d.value);
    return `${d.label}: ${valueText[i]}${share ? `, ${share}` : ""}`;
  }

  function tooltipRows(i: number): TooltipRow[] {
    const d = data[i];
    if (d.suppressed) {
      return [
        {
          value: SUPPRESSED_LABEL,
          label: "hidden to protect privacy",
          key: "hatch",
        },
      ];
    }
    return [
      {
        value: valueText[i],
        label: shareText(d.value) ?? undefined,
        color,
        key: "square",
      },
    ];
  }

  function onKeyDown(event: React.KeyboardEvent, i: number) {
    const next = stepIndex(event.key, i, data.length, "both");
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    node?.querySelector<SVGGElement>(`[data-mark="${next}"]`)?.focus();
  }

  // Handlers shared by every mark: hover, focus and arrow keys all drive
  // the same `active` index, so a keyboard user sees exactly what a mouse
  // user sees.
  function markProps(i: number) {
    return {
      "data-mark": i,
      tabIndex: i === tabStop ? 0 : -1,
      role: "img",
      "aria-label": ariaFor(i),
      className: "group cursor-default outline-none",
      onPointerEnter: () => setActive(i),
      onPointerDown: () => setActive(i),
      onPointerLeave: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse") setActive(null);
      },
      onFocus: () => {
        setFocusIndex(i);
        setActive(i);
      },
      onBlur: () => setActive(null),
      onKeyDown: (e: React.KeyboardEvent) => onKeyDown(e, i),
    };
  }

  const ready = width > 0 && data.length > 0;

  if (orientation === "horizontal") {
    const labelW = Math.min(
      Math.max(56, Math.max(...data.map((d) => textWidth(d.label, 12.5))) + 14),
      width * 0.4,
    );
    const valueW = Math.max(...valueText.map((t) => textWidth(t, 12))) + 14;
    const plotW = Math.max(20, width - labelW - valueW);
    const sx = (v: number) => (max ? (v / max) * plotW : 0);
    const svgH = data.length * ROW + 4;
    const lengthOf = (d: BarDatum) =>
      d.suppressed ? Math.max(18, sx(SUPPRESSION_THRESHOLD)) : sx(d.value);

    const tip = active !== null && active < data.length ? active : null;
    const tipEnd = tip !== null ? labelW + lengthOf(data[tip]) + valueW : 0;
    // Beside the value when there is room for a tooltip there. Otherwise it
    // sits over the row above (or below the first row), anchored at the bar
    // end: tucking it to the left of a long bar on a phone pushed it past the
    // card edge and over the label it was describing.
    const beside = tipEnd + 160 <= width;
    const tipRowTop = tip !== null ? 2 + tip * ROW : 0;
    const tipAnchor = tip !== null ? labelW + lengthOf(data[tip]) : 0;

    return (
      <div ref={ref} role="group" aria-label={label} className="relative w-full" style={{ minHeight: svgH }}>
        {ready ? (
          <svg width={width} height={svgH} className="block select-none">
            <defs>
              <HatchPattern id={hatchId} />
            </defs>
            {data.map((d, i) => {
              const y = 2 + i * ROW;
              const barY = y + (ROW - BAR) / 2;
              const length = lengthOf(d);
              return (
                <g key={`${d.label}-${i}`} {...markProps(i)}>
                  {/* The whole row is the target; the wash shows which one is live. */}
                  <rect
                    x={0}
                    y={y + 1}
                    width={width}
                    height={ROW - 2}
                    rx={10}
                    style={{ fill: active === i ? CHART_INK.wash : "transparent" }}
                    fillOpacity={0.7}
                  />
                  <rect
                    x={1}
                    y={y + 2}
                    width={width - 2}
                    height={ROW - 4}
                    rx={10}
                    fill="none"
                    strokeWidth={2}
                    className="opacity-0 group-focus-visible:opacity-100"
                    style={{ stroke: "var(--accent)" }}
                  />
                  <text
                    x={8}
                    y={y + ROW / 2}
                    dy="0.32em"
                    fontSize={12.5}
                    style={{ fill: CHART_INK.strong }}
                  >
                    {truncate(d.label, labelW - 16, 12.5)}
                  </text>
                  <motion.path
                    d={barPath(labelW, barY, length, BAR, "right")}
                    fill={d.suppressed ? `url(#${hatchId})` : color}
                    fillOpacity={active === i && !d.suppressed ? 0.85 : 1}
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: "spring", stiffness: 140, damping: 24, delay: i * 0.04 }}
                    style={{ originX: 0 }}
                  />
                  <text
                    x={labelW + length + 8}
                    y={y + ROW / 2}
                    dy="0.32em"
                    fontSize={12}
                    fontWeight={d.suppressed ? 400 : 500}
                    className="tabular-nums"
                    style={{ fill: d.suppressed ? CHART_INK.text : CHART_INK.strong }}
                  >
                    {valueText[i]}
                  </text>
                </g>
              );
            })}
            <line
              x1={labelW}
              x2={labelW}
              y1={2}
              y2={svgH - 2}
              strokeWidth={1}
              shapeRendering="crispEdges"
              pointerEvents="none"
              style={{ stroke: CHART_INK.axis }}
            />
          </svg>
        ) : null}

        {ready && tip !== null ? (
          beside ? (
            <ChartTooltip
              x={tipEnd - 4}
              y={tipRowTop + ROW / 2}
              bound={width}
              align="start"
              placement="middle"
              title={data[tip].label}
              rows={tooltipRows(tip)}
            />
          ) : (
            <ChartTooltip
              x={tipAnchor}
              y={tip > 0 ? tipRowTop + 4 : tipRowTop + ROW - 4}
              bound={width}
              align={alignFor(tipAnchor, width)}
              placement={tip > 0 ? "above" : "below"}
              title={data[tip].label}
              rows={tooltipRows(tip)}
            />
          )
        ) : null}
      </div>
    );
  }

  // Vertical columns, for ordered categories along x (months, age bands).
  const ticks = niceTicks(
    0,
    max || 1,
    height < 200 ? 3 : 4,
    shown.every((d) => Number.isInteger(d.value)),
  );
  const dMax = ticks[ticks.length - 1];
  const tickText = ticks.map(valueFormat);
  const top = 18;
  const bottom = 28;
  const left = Math.ceil(Math.max(...tickText.map((t) => textWidth(t, 11)))) + 12;
  const plotW = Math.max(20, width - left - 4);
  const plotH = Math.max(40, height - top - bottom);
  const band = plotW / Math.max(1, data.length);
  // At most 24px, never wider than the band less a 2px surface gap.
  const barW = Math.max(1, Math.min(24, band * 0.64, band - 2));
  const sy = (v: number) => top + plotH - (v / dMax) * plotH;
  const base = sy(0);
  const topOf = (d: BarDatum) =>
    d.suppressed ? Math.min(base - 14, sy(SUPPRESSION_THRESHOLD)) : sy(d.value);

  const longest = Math.max(...data.map((d) => textWidth(d.label, 11)));
  const labelEvery = Math.max(1, Math.ceil((longest + 8) / band));
  // Label the one extreme on its cap, not every column.
  const peakValue = Math.max(...shown.map((d) => d.value));
  const peak = data.findIndex((d) => !d.suppressed && d.value === peakValue);

  const tip = active !== null && active < data.length ? active : null;
  const tipCx = tip !== null ? left + band * (tip + 0.5) : 0;

  return (
    <div ref={ref} role="group" aria-label={label} className="relative w-full" style={{ height }}>
      {ready ? (
        <svg width={width} height={height} className="block select-none">
          <defs>
            <HatchPattern id={hatchId} />
          </defs>
          {/* Tick numbers are for the eye; each bar speaks its own value. */}
          {ticks.map((t, i) => (
            <g key={t} pointerEvents="none" aria-hidden>
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

          {data.map((d, i) => {
            const cx = left + band * (i + 0.5);
            const y = topOf(d);
            const capLabel = d.suppressed
              ? textWidth(SUPPRESSED_LABEL, 11) + 4 <= band
              : i === peak && textWidth(valueText[i], 11) + 4 <= band * 1.6;
            const axisText = i % labelEvery === 0 ? truncate(d.label, band * labelEvery - 6, 11) : null;
            // Held inside the SVG: thinned labels are wider than their column,
            // and the last one centred on its column ran off the edge and was cut.
            const axisHalf = axisText ? textWidth(axisText, 11) / 2 : 0;
            const axisX = Math.min(width - axisHalf, Math.max(axisHalf, cx));
            return (
              <g key={`${d.label}-${i}`} {...markProps(i)}>
                <rect
                  x={left + band * i}
                  y={top}
                  width={band}
                  height={plotH}
                  rx={Math.min(8, band / 3)}
                  style={{ fill: active === i ? CHART_INK.wash : "transparent" }}
                  fillOpacity={0.7}
                />
                <rect
                  x={left + band * i + 1}
                  y={top + 1}
                  width={Math.max(0, band - 2)}
                  height={plotH - 2}
                  rx={Math.min(8, band / 3)}
                  fill="none"
                  strokeWidth={2}
                  className="opacity-0 group-focus-visible:opacity-100"
                  style={{ stroke: "var(--accent)" }}
                />
                <motion.path
                  d={barPath(cx - barW / 2, y, barW, base - y, "top")}
                  fill={d.suppressed ? `url(#${hatchId})` : color}
                  fillOpacity={active === i && !d.suppressed ? 0.85 : 1}
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: "spring", stiffness: 140, damping: 24, delay: i * 0.03 }}
                  style={{ originY: 1 }}
                />
                {capLabel ? (
                  <text
                    x={cx}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={d.suppressed ? 400 : 500}
                    className="tabular-nums"
                    style={{ fill: d.suppressed ? CHART_INK.text : CHART_INK.strong }}
                  >
                    {valueText[i]}
                  </text>
                ) : null}
                {axisText ? (
                  <text
                    x={axisX}
                    y={top + plotH + 19}
                    textAnchor="middle"
                    fontSize={11}
                    style={{ fill: CHART_INK.text }}
                  >
                    {axisText}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      {ready && tip !== null ? (
        <ChartTooltip
          x={tipCx}
          y={topOf(data[tip])}
          bound={width}
          align={alignFor(tipCx, width)}
          placement="above"
          title={data[tip].label}
          rows={tooltipRows(tip)}
        />
      ) : null}
    </div>
  );
}
