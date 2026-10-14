"use client";

import { useState } from "react";
import { ChartTooltip, useContainerWidth, type TooltipRow } from "@/components/ui/charts/shared";
import { HATCH_CSS, SUPPRESSION_THRESHOLD, seriesColor } from "@/components/ui/charts/palette";
import { SUPPRESSED_TEXT, type FunnelStep } from "@/lib/adminStats";
import { cellText, percentText } from "./format";

/**
 * From a visit to a first session, step by step.
 *
 * The first step counts visits to the site and the rest count people who
 * made an account in the range, so they are not one scale: a bar for 4,824
 * visits beside one for 55 payers would leave every later step a sliver.
 * Visits lead as a figure; the bars start at "Made an account" (full width)
 * and each later step is drawn against it. Every row says its number and
 * what share of the step before carried on, so the chart reads without
 * hovering; the tooltip adds the share of everyone who signed up.
 *
 * A withheld step (fewer than five) is the hatch at the width five would
 * be, labelled "<5", and no share is worked out from it.
 */

const shown = (s: FunnelStep) => (s.suppressed ? null : s.value);

function rate(part: FunnelStep, whole: FunnelStep): number | null {
  const p = shown(part);
  const w = shown(whole);
  return p !== null && w ? p / w : null;
}

/**
 * One step as a share of another, for the chart and its table alike. A step
 * can outgrow the one before it — somebody who paid for a longer talk is
 * shown providers without paying for a first conversation — and "283%"
 * would read as a fault, so anything over the whole says so plainly.
 */
export function stepShare(part: FunnelStep, whole: FunnelStep | undefined): string {
  const r = whole ? rate(part, whole) : null;
  return r === null ? "—" : r > 1 ? ">100%" : percentText(r);
}

/** Above the row it describes, or below it for the first row, where above is the card's edge. */
const ROOM_ABOVE = 72;

export default function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [active, setActive] = useState<{ index: number; top: number; height: number } | null>(null);

  const [visits, ...people] = steps;
  const first = people[0];
  const scale = Math.max(
    1,
    ...people.map((s) => shown(s) ?? 0),
    people.some((s) => s.suppressed) ? SUPPRESSION_THRESHOLD : 0,
  );
  const color = seriesColor(0);
  const signupRate = first ? rate(first, visits) : null;
  const widthOf = (s: FunnelStep) => {
    const value = shown(s);
    if (value === 0) return 0;
    return Math.max(0.04, (value ?? SUPPRESSION_THRESHOLD) / scale);
  };

  function tooltipRows(index: number): TooltipRow[] {
    const step = people[index];
    if (step.suppressed) return [{ value: SUPPRESSED_TEXT, label: "hidden to protect privacy", key: "hatch" }];
    const out: TooltipRow[] = [{ value: cellText(step), label: "people", color, key: "square" }];
    if (index > 0 && rate(step, people[index - 1]) !== null) {
      out.push({ value: stepShare(step, people[index - 1]), label: "of the step before" });
    }
    if (index > 0 && rate(step, first) !== null) {
      out.push({ value: stepShare(step, first), label: "of those who made an account" });
    }
    return out;
  }

  function point(index: number, row: HTMLElement) {
    setActive({ index, top: row.offsetTop, height: row.offsetHeight });
  }

  const tip = active !== null && active.index < people.length ? active : null;
  const tipX = tip ? Math.min(width - 12, Math.max(12, widthOf(people[tip.index]) * width)) : 0;
  const above = tip ? tip.top >= ROOM_ABOVE : true;

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13.5px] text-[var(--foreground)]">
        <span className="font-display text-[26px] font-medium leading-none">{cellText(visits)}</span>
        <span>visits to the site</span>
        {signupRate !== null ? (
          <span className="text-[var(--muted)]">— {percentText(signupRate)} of them led to a new account</span>
        ) : null}
      </p>

      <div ref={ref} className="relative mt-5">
        <ol aria-label="Of the people who made an account" className="space-y-2">
          {people.map((step, i) => {
            const before = i > 0 && rate(step, people[i - 1]) !== null ? stepShare(step, people[i - 1]) : null;
            return (
              <li
                key={step.key}
                onPointerEnter={(e) => point(i, e.currentTarget)}
                onPointerDown={(e) => point(i, e.currentTarget)}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") setActive(null);
                }}
                className={`rounded-2xl px-3 py-2.5 transition-colors ${tip?.index === i ? "bg-[var(--sand)]/70" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13.5px] text-[var(--foreground)]">{step.label}</span>
                  <span
                    className={`shrink-0 text-[14px] tabular-nums ${
                      step.suppressed ? "text-[var(--muted)]" : "font-medium text-[var(--foreground)]"
                    }`}
                  >
                    {cellText(step)}
                    {step.suppressed ? <span className="sr-only"> (fewer than 5, hidden to protect privacy)</span> : null}
                  </span>
                </div>
                <div aria-hidden className="mt-2 h-3 w-full rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthOf(step) * 100}%`, background: step.suppressed ? HATCH_CSS : color }}
                  />
                </div>
                {before !== null ? (
                  <p className="mt-1.5 text-[12px] text-[var(--muted)]">{before} of the step before</p>
                ) : null}
              </li>
            );
          })}
        </ol>

        {tip && width > 0 ? (
          <ChartTooltip
            x={tipX}
            y={above ? tip.top + 6 : tip.top + tip.height - 6}
            bound={width}
            align={tipX > width / 2 ? "end" : "start"}
            placement={above ? "above" : "below"}
            title={people[tip.index].label}
            rows={tooltipRows(tip.index)}
          />
        ) : null}
      </div>
    </div>
  );
}
