"use client";

import { CHART_INK } from "./palette";
import { linePath, useContainerWidth } from "./shared";

/**
 * A word-sized trend line: no axes, no grid, no hover.
 *
 * It says "rising, falling or flat", never a value — the number it sits next
 * to does that. So it is hidden from screen readers unless given a `label`.
 * The line is in a quiet colour and only the latest point is marked, in the
 * accent, because "where are we now" is the one thing it should point at.
 */
export default function Sparkline({
  values,
  color = "var(--sage)",
  endColor = "var(--accent)",
  height = 32,
  label,
  className = "",
}: {
  values: number[];
  color?: string;
  /** The latest point's marker. */
  endColor?: string;
  height?: number;
  /** Only if the sparkline carries meaning the text beside it does not. */
  label?: string;
  className?: string;
}) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();

  // Room for the end marker so it is never clipped at the edge.
  const pad = 4;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const sx = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  // A flat series sits in the middle rather than on the floor.
  const sy = (v: number) =>
    hi === lo ? height / 2 : pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  const points = values.map((v, i): [number, number] => [sx(i), sy(v)]);
  const last = points[points.length - 1];

  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block w-full ${className}`}
      style={{ height }}
    >
      {width > 0 && values.length > 1 ? (
        <svg width={width} height={height} className="block overflow-visible">
          <path
            d={linePath(points, true)}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: color }}
          />
          <circle
            cx={last[0]}
            cy={last[1]}
            r={3}
            strokeWidth={1.5}
            style={{ fill: endColor, stroke: CHART_INK.surface }}
          />
        </svg>
      ) : null}
    </div>
  );
}
