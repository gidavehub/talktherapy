"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../../motion/primitives";
import { HATCH, HATCH_CSS } from "./palette";

/**
 * The machinery every chart shares: measuring the container, tick maths,
 * number formats, path builders, the suppression hatch and the one tooltip.
 *
 * Internal to the kit. Screens import charts, not these pieces.
 */

/**
 * The live width of a container.
 *
 * A ResizeObserver rather than the window size, because a chart in a
 * two-column dashboard changes width when the sidebar collapses, not when the
 * window does. The ref is a callback that stores the node in state, so the
 * effect re-subscribes when the node changes and nothing reads a ref during
 * render. Width is 0 until the first measurement, which also means nothing
 * date-formatted renders on the server and hydration cannot disagree.
 */
export function useContainerWidth<T extends Element = HTMLDivElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      // Rounded so sub-pixel jitter does not re-render the chart on a loop.
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { ref: setNode, node, width };
}

/**
 * An id safe to use inside `url(#…)`. React's ids carry characters that are
 * legal in an attribute but awkward inside a CSS url reference.
 */
export function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const WHOLE = new Intl.NumberFormat("en-GB");
const DECIMAL = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const PERCENT = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * The default value format: thousands-comma'd under ten thousand, compact
 * (12.9K) above it, so axis ticks stay short without losing small numbers.
 */
export function formatValue(value: number): string {
  if (Math.abs(value) >= 10_000) return COMPACT.format(value);
  return Number.isInteger(value) ? WHOLE.format(value) : DECIMAL.format(value);
}

/** A share of a whole. Anything above zero but under 1% says so, not "0%". */
export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.01) return "<1%";
  return PERCENT.format(fraction);
}

/** Full-precision number for a table cell. */
export function formatCell(value: number): string {
  return Number.isInteger(value) ? WHOLE.format(value) : DECIMAL.format(value);
}

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step =
    normalised >= 7.5 ? 10 : normalised >= 3.5 ? 5 : normalised >= 1.5 ? 2 : 1;
  return step * magnitude;
}

/**
 * Round axis ticks covering [lo, hi]: 0 / 50 / 100, never 0 / 47 / 94.
 * The first and last tick are the domain the chart should draw.
 *
 * `integers` is for counts: with a peak of two sessions the axis reads
 * 0 / 1 / 2, not 0 / 0.5 / 1 / 1.5 / 2, because half a session is not a thing.
 */
export function niceTicks(lo: number, hi: number, count = 4, integers = false): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) {
    if (hi === 0) return [0, 1];
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  const nice = niceStep(hi - lo, count);
  const step = integers ? Math.max(1, nice) : nice;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let i = 0; start + i * step <= end + step / 2; i++) {
    // toPrecision tidies float noise, so 0.30000000000000004 prints as 0.3.
    ticks.push(Number((start + i * step).toPrecision(12)));
  }
  return ticks.length > 1 ? ticks : [start, start + step];
}

/**
 * A rough rendered width for a label in Poppins, character by character:
 * figures and capitals are wide, thin letters and spaces narrow. Good enough
 * to reserve margins and decide whether a label fits, and it errs wide so
 * text is never clipped by its own mark.
 */
export function textWidth(text: string, size = 12): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") em += 0.62;
    else if (ch >= "A" && ch <= "Z") em += 0.7;
    else if (" .,:;'|!ilj".includes(ch)) em += 0.3;
    else if ("mwMW".includes(ch)) em += 0.86;
    else em += 0.56;
  }
  return em * size;
}

/** Shorten a label to fit `maxWidth`, with an ellipsis. Full text lives in the tooltip. */
export function truncate(text: string, maxWidth: number, size = 12): string {
  // The half-pixel of slack stops float noise truncating a label that fits.
  if (textWidth(text, size) <= maxWidth + 0.5) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

type Point = [number, number];

/**
 * A line through points, straight or smoothed.
 *
 * The smoothing is monotone (Fritsch–Carlson tangents, as in d3's
 * curveMonotoneX): the curve never overshoots a point, so a count can never
 * appear to dip below zero or peak higher than it did. A plain spline would
 * invent both.
 */
export function linePath(points: Point[], smooth: boolean): string {
  if (points.length === 0) return "";
  const [first] = points;
  if (points.length === 1) return `M${first[0]},${first[1]}`;
  if (!smooth || points.length === 2) {
    return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("");
  }

  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    slopes.push(dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) {
      // A peak or a trough: flat tangent, so the curve turns on the point.
      tangents[i] = 0;
    } else {
      const h0 = points[i][0] - points[i - 1][0];
      const h1 = points[i + 1][0] - points[i][0];
      tangents[i] =
        (3 * (h0 + h1)) / ((2 * h1 + h0) / before + (h1 + 2 * h0) / after);
    }
  }

  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const third = (x1 - x0) / 3;
    d += `C${x0 + third},${y0 + tangents[i] * third},${x1 - third},${y1 - tangents[i + 1] * third},${x1},${y1}`;
  }
  return d;
}

/**
 * A bar with a 4px rounded data end and a square foot on the baseline.
 * `end` says which side the data end is on: "top" for columns, "right" for
 * horizontal bars.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  end: "top" | "right",
): string {
  if (w <= 0 || h <= 0) return "";
  if (end === "top") {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
  }
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
}

/**
 * Arrow-key movement along a row of marks. Returns the next index, or null
 * for a key the chart should leave alone (so Tab and page scrolling work).
 *
 * "both" is for marks that form a plain list (bars, slices): either pair of
 * arrows walks it, because nobody should have to guess which way it runs.
 */
export function stepIndex(
  key: string,
  index: number,
  count: number,
  axis: "horizontal" | "vertical" | "both",
): number | null {
  const back =
    axis === "both" ? ["ArrowLeft", "ArrowUp"] : [axis === "horizontal" ? "ArrowLeft" : "ArrowUp"];
  const forward =
    axis === "both"
      ? ["ArrowRight", "ArrowDown"]
      : [axis === "horizontal" ? "ArrowRight" : "ArrowDown"];
  if (back.includes(key)) return Math.max(0, index - 1);
  if (forward.includes(key)) return Math.min(count - 1, index + 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The suppression hatch, for use inside an SVG <defs>. */
export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      width="5"
      height="5"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="5" height="5" style={{ fill: HATCH.ground }} />
      {/* At x=1, not 0: each tile clips its own content, so a stroke centred
          on the edge would lose half its width and the hatch would fade. */}
      <line x1="1" y1="0" x2="1" y2="5" stroke={HATCH.ink} strokeWidth="2" />
    </pattern>
  );
}

export type TooltipRow = {
  /** The number, already formatted. Leads the row. */
  value: string;
  /** What the number is. Follows, quieter. */
  label?: string;
  color?: string;
  /** A short stroke for lines, a square for bars and slices, hatch for suppressed. */
  key?: "line" | "square" | "hatch";
};

/**
 * The one tooltip.
 *
 * Values lead and labels follow: by the time somebody hovers they already
 * know which series it is and want the number. Rows are keyed with a small
 * mark in the series colour; the text itself stays in the text tokens.
 *
 * It is placed by a transform from an anchor point rather than measured,
 * so there is no layout read and no second render. Charts pick `align` by
 * which half of the plot the anchor is in, and `bound` (the chart width)
 * caps its width to the room on that side. Without the cap a 240px tooltip
 * opening right from the middle of a phone-width chart runs past the screen
 * edge and scrolls the whole page sideways.
 *
 * Hidden from screen readers: every mark carries its own aria-label, and
 * the table view holds every value without hovering at all.
 */
export function ChartTooltip({
  x,
  y,
  bound,
  align,
  placement,
  title,
  rows,
}: {
  x: number;
  y: number;
  /** The width of the box the tooltip must stay inside. */
  bound: number;
  align: "start" | "center" | "end";
  placement: "above" | "below" | "middle";
  title?: string;
  rows: TooltipRow[];
}) {
  const gap = 12;
  const room =
    align === "start" ? bound - x - gap : align === "end" ? x - gap : 2 * Math.min(x, bound - x);
  // Labels wrap inside the cap; 112px still fits a value and a short word.
  const maxWidth = Math.max(112, Math.min(240, Math.floor(room)));
  const tx =
    align === "start" ? `${gap}px` : align === "end" ? `calc(-100% - ${gap}px)` : "-50%";
  const ty =
    placement === "above"
      ? `calc(-100% - ${gap}px)`
      : placement === "below"
        ? `${gap}px`
        : "-50%";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-20"
      // Two translates: the first moves to the anchor, the second shifts by
      // the tooltip's own size (percentages here are of this box), which is
      // how it flips sides without anyone measuring it.
      style={{ transform: `translate(${x}px, ${y}px) translate(${tx}, ${ty})` }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_SNAP}
        className="w-max rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 shadow-[var(--shadow-floating)]"
        style={{ maxWidth, minWidth: Math.min(132, maxWidth) }}
      >
        {title ? (
          <p className="mb-1.5 text-[11.5px] leading-snug text-[var(--muted)]">{title}</p>
        ) : null}
        <ul className="space-y-1">
          {rows.map((row, i) => (
            <li key={i} className="flex items-baseline gap-2 leading-snug">
              {row.key ? <TooltipKey kind={row.key} color={row.color} /> : null}
              <span className="whitespace-nowrap text-[13.5px] font-semibold tabular-nums text-[var(--foreground)]">
                {row.value}
              </span>
              {row.label ? (
                // Wraps rather than truncates: a tooltip is where a value
                // pushed off its mark lives, so it must not hide any of it.
                <span className="min-w-0 text-[12px] text-[var(--muted)]">{row.label}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

function TooltipKey({ kind, color }: { kind: "line" | "square" | "hatch"; color?: string }) {
  if (kind === "line") {
    return (
      <span aria-hidden className="h-[2px] w-3 shrink-0 rounded-full" style={{ background: color }} />
    );
  }
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
      style={{ background: kind === "hatch" ? HATCH_CSS : color }}
    />
  );
}

/** Where a tooltip should sit horizontally, from an anchor's x in a box of `width`. */
export function alignFor(x: number, width: number): "start" | "center" | "end" {
  if (x < 120) return "start";
  if (x > width - 120) return "end";
  return "center";
}
