"use client";

import { useMemo, useState } from "react";
import { MOOD_LABELS, type MoodEntry, type MoodScore } from "../../lib/models";
import { dayKey } from "../../lib/wellbeing";

/**
 * Mood over time.
 *
 * One series, so there is no legend — the heading names it. Hand-rolled SVG
 * rather than a charting library: this is a single line on a 1–5 scale, and
 * shipping ~80KB of chart runtime to draw it would be the largest dependency
 * in the app.
 *
 * Deliberate choices, in case they look like omissions:
 *  - Solid hairline gridlines, not dashed. Dashes read as "threshold".
 *  - No value printed on every point — the extremes are labelled and the
 *    hover layer carries the rest.
 *  - A table view twin, because a chart that can only be read by hovering
 *    excludes keyboard and screen-reader users entirely.
 *  - Hit targets span the full column, not the 9px dot.
 */

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 20, right: 20, bottom: 34, left: 34 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

type Point = { x: number; y: number; score: number; label: string; at: number };

/** One average per calendar day, oldest first, gaps left as gaps. */
function toDailyPoints(entries: MoodEntry[], days: number): Point[] {
  const byDay = new Map<string, { sum: number; count: number; at: number }>();

  for (const entry of entries) {
    const key = dayKey(entry.recordedAt);
    const existing = byDay.get(key);
    if (existing) {
      existing.sum += entry.score;
      existing.count += 1;
    } else {
      byDay.set(key, { sum: entry.score, count: 1, at: entry.recordedAt });
    }
  }

  const out: Point[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const bucket = byDay.get(key);
    if (!bucket) continue;

    const score = bucket.sum / bucket.count;
    const slot = days - 1 - i;
    out.push({
      x: PAD.left + (slot / Math.max(days - 1, 1)) * PLOT_W,
      // Scale 1–5 mapped to the plot, inverted because SVG y grows downward.
      y: PAD.top + PLOT_H - ((score - 1) / 4) * PLOT_H,
      score,
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      at: bucket.at,
    });
  }

  return out;
}

export default function MoodTrendChart({
  entries,
  days = 14,
}: {
  entries: MoodEntry[];
  days?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const points = useMemo(() => toDailyPoints(entries, days), [entries, days]);

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
        <p className="text-[14px] text-[var(--muted)]">
          Your trend appears here once you have checked in.
        </p>
      </div>
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(PAD.top + PLOT_H).toFixed(1)} L ${points[0].x.toFixed(1)} ${(PAD.top + PLOT_H).toFixed(1)} Z`
      : "";

  // Label only the extremes, never every point.
  const highest = points.reduce((a, b) => (b.score > a.score ? b : a));
  const lowest = points.reduce((a, b) => (b.score < a.score ? b : a));
  const labelled = new Set(
    points.length > 2 ? [highest.at, lowest.at, points[points.length - 1].at] : points.map((p) => p.at),
  );

  const active = hover != null ? points[hover] : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Last {days} days
        </p>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">
              Average mood score by day over the last {days} days
            </caption>
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th scope="col" className="py-2 font-normal">Day</th>
                <th scope="col" className="py-2 font-normal">Score</th>
                <th scope="col" className="py-2 font-normal">Feeling</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.at} className="border-t border-[var(--border)]">
                  <td className="py-2.5">{p.label}</td>
                  <td className="py-2.5 tabular-nums">{p.score.toFixed(1)}</td>
                  <td className="py-2.5 text-[var(--muted)]">
                    {MOOD_LABELS[Math.round(p.score) as MoodScore]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            role="img"
            aria-label={`Mood trend over the last ${days} days. Use the table view for exact values.`}
          >
            {/* Gridlines + y ticks. Solid hairlines, one shade off the surface. */}
            {([1, 2, 3, 4, 5] as MoodScore[]).map((score) => {
              const y = PAD.top + PLOT_H - ((score - 1) / 4) * PLOT_H;
              return (
                <g key={score}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[var(--muted)]"
                    style={{ fontSize: 11 }}
                  >
                    {score}
                  </text>
                </g>
              );
            })}

            {areaPath ? (
              <path d={areaPath} fill="var(--accent)" opacity={0.08} />
            ) : null}

            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {points.map((p, i) => (
              <g key={p.at}>
                {/* 2px surface ring keeps markers legible where the line passes
                    under them, without drawing a border around the mark. */}
                <circle cx={p.x} cy={p.y} r="5.5" fill="var(--surface)" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active?.at === p.at ? "5" : "4"}
                  fill="var(--accent)"
                />
                {labelled.has(p.at) && active?.at !== p.at ? (
                  <text
                    x={p.x}
                    y={p.y - 12}
                    textAnchor="middle"
                    className="fill-[var(--foreground)]"
                    style={{ fontSize: 11, fontWeight: 500 }}
                  >
                    {p.score.toFixed(1)}
                  </text>
                ) : null}

                {/* Full-column hit target — far larger than the 8px dot. */}
                <rect
                  x={p.x - PLOT_W / Math.max(points.length, 1) / 2}
                  y={PAD.top}
                  width={PLOT_W / Math.max(points.length, 1)}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}: ${p.score.toFixed(1)} out of 5, ${MOOD_LABELS[Math.round(p.score) as MoodScore]}`}
                  className="outline-none focus-visible:fill-[var(--accent)]/5"
                />
              </g>
            ))}

            {/* Crosshair on the active column. */}
            {active ? (
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--foreground)"
                strokeWidth="1"
                opacity={0.2}
              />
            ) : null}

            {/* X labels: first and last only, so they never collide. */}
            <text
              x={PAD.left}
              y={HEIGHT - 12}
              className="fill-[var(--muted)]"
              style={{ fontSize: 11 }}
            >
              {points[0].label}
            </text>
            {points.length > 1 ? (
              <text
                x={WIDTH - PAD.right}
                y={HEIGHT - 12}
                textAnchor="end"
                className="fill-[var(--muted)]"
                style={{ fontSize: 11 }}
              >
                {points[points.length - 1].label}
              </text>
            ) : null}
          </svg>

          {active ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl bg-[var(--dark)] text-white px-3 py-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
              style={{
                left: `${(active.x / WIDTH) * 100}%`,
                top: `${(active.y / HEIGHT) * 100}%`,
                marginTop: -10,
              }}
            >
              <p className="text-[11px] text-white/65 whitespace-nowrap">{active.label}</p>
              <p className="text-[13px] font-medium whitespace-nowrap">
                {active.score.toFixed(1)} ·{" "}
                {MOOD_LABELS[Math.round(active.score) as MoodScore]}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
