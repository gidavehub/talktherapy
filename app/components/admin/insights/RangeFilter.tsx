"use client";

import { useState, useSyncExternalStore } from "react";
import DateRangePicker, { type DateRangePreset, type DateRangeValue } from "@/components/ui/DateRangePicker";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { PageBar } from "@/components/ui/AppShell";
import { wellbeingMonths } from "@/lib/adminStats";
import { useNow } from "@/lib/useNow";
import { monthText } from "./format";

/**
 * The filter on the overview and insights dashboards: which days the
 * figures are for. (Wellbeing has MonthFilter, below.)
 *
 * On a computer it is the DateRangePicker under the page heading, above
 * everything it scopes. On a phone it is pinned in the top bar instead, so
 * the dates stay under the thumb however far down the charts somebody has
 * scrolled: the four presets as short pills, and "Dates" for a sheet with
 * the full picker, where your own days can be typed. "All time" is not
 * offered — the function counts two years at most.
 */

const PRESETS: DateRangePreset[] = ["7d", "30d", "90d", "12m", "custom"];

const QUICK: { preset: DateRangePreset; short: string; long: string }[] = [
  { preset: "7d", short: "7d", long: "last 7 days" },
  { preset: "30d", short: "30d", long: "last 30 days" },
  { preset: "90d", short: "90d", long: "last 90 days" },
  { preset: "12m", short: "12m", long: "last 12 months" },
];

const PHONE = "(max-width: 767px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The top bar is the phone's place for the filter; on a computer it would sit empty over the heading. */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

const PILL =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

function pillTone(active: boolean) {
  return active
    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
    : "border-[var(--dark)]/25 text-[var(--foreground)] hover:bg-[var(--sand)]";
}

export default function RangeFilter({
  value,
  onChange,
  title,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** The page's name, beside the pills in the phone's top bar when there is room. */
  title: string;
}) {
  const phone = useIsPhone();
  const [sheet, setSheet] = useState(false);

  return (
    <>
      <DateRangePicker
        className="hidden md:block"
        value={value}
        onChange={onChange}
        presets={PRESETS}
        label="Show figures for"
      />

      {phone ? (
        <PageBar>
          <span className="font-display hidden shrink-0 text-[20px] font-medium min-[420px]:block">{title}</span>
          <div role="group" aria-label="Show figures for" className="ml-auto flex min-w-0 items-center gap-1">
            {QUICK.map((q) => (
              <button
                key={q.preset}
                type="button"
                aria-pressed={value.preset === q.preset}
                onClick={() => onChange({ preset: q.preset })}
                className={`${PILL} ${pillTone(value.preset === q.preset)}`}
              >
                {q.short}
                <span className="sr-only"> ({q.long})</span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={value.preset === "custom"}
              aria-haspopup="dialog"
              onClick={() => setSheet(true)}
              className={`${PILL} ${pillTone(value.preset === "custom")}`}
            >
              Dates
            </button>
          </div>
        </PageBar>
      ) : null}

      <Drawer
        open={phone && sheet}
        onClose={() => setSheet(false)}
        eyebrow="Figures for"
        title="Choose the dates"
        footer={
          <Button fullWidth onClick={() => setSheet(false)}>
            Show these figures
          </Button>
        }
      >
        <DateRangePicker value={value} onChange={onChange} presets={PRESETS} label="Show figures for" />
        <p className="mt-5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Days run midnight to midnight UTC, Gambian time. Your own dates can cover up to two years.
        </p>
      </Drawer>
    </>
  );
}

/**
 * The wellbeing page's filter: one whole month, from a list. Never free
 * dates — who people are and what they struggle with only comes a month at a
 * time, once the month has ended (composeWellbeing in adminStatsCore.ts).
 * Under the heading on a computer; pinned in the top bar on a phone, like
 * the dates elsewhere.
 */
export function MonthFilter({
  value,
  onChange,
  title,
}: {
  /** "2026-09" */
  value: string;
  onChange: (month: string) => void;
  title: string;
}) {
  const phone = useIsPhone();
  // Only moves on at the turn of a month; an hour is plenty.
  const now = useNow(60 * 60_000);
  const options: DropdownOption<string>[] = wellbeingMonths(now).map((month) => ({
    value: month,
    label: monthText(month),
  }));

  return (
    <>
      <Dropdown
        className="hidden max-w-[320px] md:block"
        label="Show figures for"
        options={options}
        value={value}
        onChange={onChange}
        hint="A whole month at a time, once it has ended."
      />

      {phone ? (
        <PageBar>
          <span className="font-display hidden shrink-0 text-[20px] font-medium min-[420px]:block">{title}</span>
          <Dropdown
            className="ml-auto min-w-0"
            variant="pill"
            label="Month"
            options={options}
            value={value}
            onChange={onChange}
          />
        </PageBar>
      ) : null}
    </>
  );
}
