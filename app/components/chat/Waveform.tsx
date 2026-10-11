"use client";

/**
 * A voice note's bars — while it is being recorded, and in the bubble.
 *
 * `bars` are 0–100. Bars left of `progress` (0–1) are drawn in the played
 * colour, the way WhatsApp fills a note as it plays.
 */
export default function Waveform({
  bars,
  progress = 0,
  played,
  unplayed,
  height = 28,
  barWidth = 3,
  live = false,
}: {
  bars: number[];
  progress?: number;
  played: string;
  unplayed: string;
  height?: number;
  barWidth?: number;
  /** Recording: newest on the right, sliding left as more arrive. */
  live?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center gap-[2px] overflow-hidden ${live ? "justify-end" : "justify-between"}`}
      style={{ height }}
    >
      {bars.map((value, index) => (
        <span
          key={live ? bars.length - index : index}
          className="shrink-0 rounded-full"
          style={{
            width: barWidth,
            height: Math.max(3, Math.round((Math.min(100, value) / 100) * height)),
            background: (index + 0.5) / bars.length <= progress ? played : unplayed,
            transition: live ? "height 90ms linear" : "background-color 120ms linear",
          }}
        />
      ))}
    </div>
  );
}

/** Squeeze (or stretch) stored bars to the number that fits. Peak per bucket. */
export function resample(bars: number[], count: number): number[] {
  if (!bars.length) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * bars.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * bars.length) / count));
    let peak = 0;
    for (let j = from; j < to && j < bars.length; j += 1) peak = Math.max(peak, bars[j]);
    out.push(peak);
  }
  return out;
}
