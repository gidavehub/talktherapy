"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING_SNAP } from "../../motion/primitives";
import {
  CHART_INK,
  HATCH_CSS,
  OTHER_COLOR,
  SUPPRESSED_LABEL,
  SUPPRESSION_THRESHOLD,
  seriesColor,
} from "./palette";
import { formatShare, formatValue, stepIndex, useContainerWidth } from "./shared";
import type { ChartTableData } from "./ChartCard";

/**
 * Part-to-whole at a glance — and only that. If the slices are close in size
 * and the comparison matters, use a BarChart; angles are hard to compare.
 *
 * At most six slices: past six, the first five keep their colours and the
 * rest are summed into a grey "Other". Pass slices in a stable order, largest
 * first, so a filter does not hand a group somebody else's colour.
 *
 * Slices are parted by a 2px gap in the surface colour. The legend sits
 * beside the ring (below it on a phone) with each value and its share, so
 * the ochre slot is always labelled and no slice relies on colour alone.
 *
 * Hovering or focusing a slice lifts it, lights its legend row and reads
 * its value and share in the hole, where it cannot cover anything.
 *
 * Suppressed groups (under five people) are not drawn — an angle would state
 * a value we are withholding. They are listed in the legend as "<5" and
 * left out of the percentages.
 */

export type DonutDatum = {
  label: string;
  value: number;
  /** Under the threshold. `value` is never read for these, so send 0. */
  suppressed?: boolean;
  /** Pin a colour to the entity. */
  color?: string;
};

type Slice = DonutDatum & { color: string; index: number };

const MAX_SLICES = 6;

/** Six slices at most: five named and the rest summed into "Other". */
export function foldDonut(data: DonutDatum[]): Slice[] {
  const named =
    data.length > MAX_SLICES ? data.slice(0, MAX_SLICES - 1) : data;
  const slices: Slice[] = named.map((d, i) => ({
    ...d,
    color: d.color ?? seriesColor(i),
    index: i,
  }));
  if (data.length <= MAX_SLICES) return slices;

  const rest = data.slice(MAX_SLICES - 1);
  const known = rest.filter((d) => !d.suppressed);
  slices.push({
    label: "Other",
    value: known.reduce((sum, d) => sum + d.value, 0),
    suppressed: known.length === 0,
    color: OTHER_COLOR,
    index: slices.length,
  });
  return slices;
}

/** The table twin: label, value, share. */
export function donutChartTable(
  data: DonutDatum[],
  {
    labelHeading = "Group",
    valueHeading = "Count",
    valueFormat,
  }: { labelHeading?: string; valueHeading?: string; valueFormat?: (v: number) => string } = {},
): ChartTableData {
  const slices = foldDonut(data);
  const total = slices.reduce((sum, s) => sum + (s.suppressed ? 0 : s.value), 0);
  return {
    columns: [labelHeading, valueHeading, "Share"],
    rows: slices.map((s) =>
      s.suppressed
        ? [s.label, SUPPRESSED_LABEL, "—"]
        : [s.label, valueFormat ? valueFormat(s.value) : s.value, total ? formatShare(s.value / total) : "—"],
    ),
  };
}

/** An annular sector. A whole ring cannot be one arc command, so it is two. */
function arcPath(c: number, inner: number, outer: number, a0: number, a1: number) {
  const at = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return (
      `M${c + outer},${c}A${outer},${outer} 0 1 1 ${c - outer},${c}A${outer},${outer} 0 1 1 ${c + outer},${c}` +
      `M${c + inner},${c}A${inner},${inner} 0 1 0 ${c - inner},${c}A${inner},${inner} 0 1 0 ${c + inner},${c}Z`
    );
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${at(outer, a0)}A${outer},${outer} 0 ${large} 1 ${at(outer, a1)}L${at(inner, a1)}A${inner},${inner} 0 ${large} 0 ${at(inner, a0)}Z`;
}

/**
 * An open arc just outside the ring, for the focus mark. Only the outer
 * edge: the slice drawn after this one would paint over a closed outline
 * along their shared side, so the ring would look broken on one end.
 */
function focusArc(c: number, r: number, a0: number, a1: number) {
  const at = (a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return `M${c + r},${c}A${r},${r} 0 1 1 ${c - r},${c}A${r},${r} 0 1 1 ${c + r},${c}`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${at(a0)}A${r},${r} 0 ${large} 1 ${at(a1)}`;
}

export default function DonutChart({
  data,
  centerLabel,
  centerValue,
  valueFormat = formatValue,
  label = "Donut chart",
}: {
  data: DonutDatum[];
  /** Small text under the centre value, e.g. "sessions". */
  centerLabel?: string;
  /** The headline in the hole, usually the total. */
  centerValue?: React.ReactNode;
  valueFormat?: (value: number) => string;
  /** What the chart shows, for screen readers. */
  label?: string;
}) {
  const { ref, node, width } = useContainerWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const slices = foldDonut(data);
  const drawn = slices.filter((s) => !s.suppressed && s.value > 0);
  const total = drawn.reduce((sum, s) => sum + s.value, 0);

  // Beside the legend when there is room, above it on a phone. Never wider
  // than the container, however narrow it gets.
  const wide = width >= 440;
  const size = wide ? 200 : Math.min(width, 220);
  const c = size / 2;
  // Room inside the box for the lifted slice (+4) and the focus arc (+7,
  // 2px wide): an SVG clips what it draws past its own edge.
  const outer = c - 9;
  const inner = outer - Math.max(18, size * 0.13);

  // Clockwise from twelve o'clock, each slice starting where the last ended.
  const arcs: { slice: Slice; a0: number; a1: number }[] = [];
  for (const s of drawn) {
    const a0 = arcs.length ? arcs[arcs.length - 1].a1 : -Math.PI / 2;
    arcs.push({ slice: s, a0, a1: a0 + (s.value / total) * Math.PI * 2 });
  }
  const tabStop = Math.min(focusIndex, Math.max(0, arcs.length - 1));

  function shareOf(s: Slice) {
    return total ? formatShare(s.value / total) : "—";
  }

  function onKeyDown(event: React.KeyboardEvent, i: number) {
    const next = stepIndex(event.key, i, arcs.length, "both");
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    node?.querySelector<SVGGElement>(`[data-mark="${next}"]`)?.focus();
  }

  const live = active !== null ? arcs.find((a) => a.slice.index === active) : undefined;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={`w-full ${wide ? "flex items-center gap-8" : "flex flex-col items-center gap-6"}`}
      style={{ minHeight: 200 }}
    >
      {width > 0 ? (
        <>
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="block select-none">
              {/* The ring turns a little into place as one piece; each slice
                  scaling about its own centre would look like it was wobbling. */}
              <motion.g
                initial={reduceMotion ? false : { opacity: 0, rotate: -24 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 110, damping: 22 }}
              >
                {arcs.map(({ slice, a0, a1 }, i) => {
                  const isActive = active === slice.index;
                  return (
                    <g
                      key={`${slice.label}-${slice.index}`}
                      data-mark={i}
                      tabIndex={i === tabStop ? 0 : -1}
                      role="img"
                      aria-label={`${slice.label}: ${valueFormat(slice.value)}, ${shareOf(slice)}`}
                      className="group cursor-default outline-none"
                      onPointerEnter={() => setActive(slice.index)}
                      onPointerDown={() => setActive(slice.index)}
                      onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setActive(null);
                      }}
                      onFocus={() => {
                        setFocusIndex(i);
                        setActive(slice.index);
                      }}
                      onBlur={() => setActive(null)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                    >
                      {/* The 2px gap is the surface-coloured stroke, 1px into each neighbour. */}
                      <path
                        d={arcPath(c, inner, isActive ? outer + 4 : outer, a0, a1)}
                        fill={slice.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        style={{ stroke: CHART_INK.surface }}
                      />
                      <path
                        d={focusArc(c, outer + 7, a0, a1)}
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="opacity-0 group-focus-visible:opacity-100"
                        style={{ stroke: "var(--accent)" }}
                      />
                    </g>
                  );
                })}
              </motion.g>
              {arcs.length === 0 ? (
                <circle
                  cx={c}
                  cy={c}
                  r={(outer + inner) / 2}
                  fill="none"
                  strokeWidth={outer - inner}
                  style={{ stroke: CHART_INK.wash }}
                />
              ) : null}
            </svg>

            {/* The hover readout lives in the hole. A floating tooltip would
                land on the legend beside the ring, which is showing the same
                slice highlighted; the hole is the one place free of both. */}
            {live || centerValue !== undefined || centerLabel ? (
              <div
                aria-hidden={live ? true : undefined}
                className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
                style={{ inset: size / 2 - inner + 8 }}
              >
                {live ? (
                  <motion.div
                    key={live.slice.index}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING_SNAP}
                    className="flex min-w-0 max-w-full flex-col items-center"
                  >
                    <span className="font-display text-[26px] font-medium leading-none text-[var(--foreground)]">
                      {valueFormat(live.slice.value)}
                    </span>
                    <span className="mt-1.5 flex max-w-full items-center gap-1.5 text-[11.5px] leading-tight text-[var(--muted)]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ background: live.slice.color }}
                      />
                      <span className="truncate">{live.slice.label}</span>
                    </span>
                    <span className="mt-0.5 text-[11.5px] tabular-nums text-[var(--muted)]">
                      {shareOf(live.slice)} of total
                    </span>
                  </motion.div>
                ) : (
                  <>
                    {centerValue !== undefined ? (
                      <span className="font-display text-[26px] font-medium leading-none text-[var(--foreground)]">
                        {centerValue}
                      </span>
                    ) : null}
                    {centerLabel ? (
                      <span className="mt-1.5 text-[11.5px] leading-tight text-[var(--muted)]">
                        {centerLabel}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-0.5" aria-label="Legend">
            {slices.map((s) => {
              const isActive = active === s.index;
              return (
                <li
                  key={`${s.label}-${s.index}`}
                  onPointerEnter={() => {
                    if (!s.suppressed) setActive(s.index);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setActive(null);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-[13px] transition-colors ${
                    isActive ? "bg-[var(--sand)]/70" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: s.suppressed ? HATCH_CSS : s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{s.label}</span>
                  <span
                    className={`tabular-nums ${s.suppressed ? "text-[var(--muted)]" : "font-medium text-[var(--foreground)]"}`}
                  >
                    {s.suppressed ? SUPPRESSED_LABEL : valueFormat(s.value)}
                    {s.suppressed ? (
                      <span className="sr-only">
                        {" "}
                        (fewer than {SUPPRESSION_THRESHOLD}, hidden to protect privacy)
                      </span>
                    ) : null}
                  </span>
                  <span className="w-11 text-right text-[12.5px] tabular-nums text-[var(--muted)]">
                    {s.suppressed ? "—" : shareOf(s)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
