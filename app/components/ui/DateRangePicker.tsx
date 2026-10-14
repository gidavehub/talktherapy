"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Input } from "./Input";

/**
 * The date range for a dashboard: a row of presets, and "Custom" for two
 * dates.
 *
 * It belongs once, above everything it scopes — never inside a chart card —
 * so every chart and figure on the page answers for the same slice of time.
 * Presets come first because "last 30 days" is what almost everybody wants,
 * and nobody should have to fight two date fields to get it.
 *
 * Presets are relative ("the last 7 days"), so the value stores the preset,
 * not dates; `resolveDateRange` turns it into timestamps at the moment of
 * fetching. Custom ranges are whole days in local time, start of the first
 * to the end of the last, so "1 Oct to 1 Oct" is one full day.
 */

export type DateRangePreset = "7d" | "30d" | "90d" | "12m" | "all" | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  /** Custom only: start of the first day, ms. */
  from?: number;
  /** Custom only: end of the last day, ms. */
  to?: number;
};

const LABELS: Record<DateRangePreset, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
  all: "All time",
  custom: "Custom",
};

const DEFAULT_PRESETS: DateRangePreset[] = ["7d", "30d", "90d", "12m", "all", "custom"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * A range as timestamps. `from` is null for "All time". Each preset counts
 * today as its last day, so "7 days" is today and the six before it.
 */
export function resolveDateRange(
  value: DateRangeValue,
  now: number = Date.now(),
): { from: number | null; to: number } {
  const today = new Date(now);
  const to = endOfDay(today);
  const daysBack = (days: number) =>
    startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));

  switch (value.preset) {
    case "7d":
      return { from: daysBack(7), to };
    case "30d":
      return { from: daysBack(30), to };
    case "90d":
      return { from: daysBack(90), to };
    case "12m":
      return {
        from: startOfDay(new Date(today.getFullYear(), today.getMonth() - 12, today.getDate() + 1)),
        to,
      };
    case "all":
      return { from: null, to };
    case "custom":
      return { from: value.from ?? null, to: value.to ?? to };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ms → "YYYY-MM-DD" in local time, which is what a date input holds. */
function toInputDate(ms?: number) {
  if (ms === undefined) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseInputDate(text: string) {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  label = "Date range",
  className = "",
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Which presets to offer, in order. Include "custom" to allow dates. */
  presets?: DateRangePreset[];
  label?: string;
  className?: string;
}) {
  const uid = useId();
  const panelId = `${uid}-custom`;
  const errorId = `${uid}-error`;

  // What the person is typing, held only while it is not yet a valid range.
  // Once it is valid it goes up through onChange and the inputs read from
  // `value` again, so there is never a second copy to keep in step.
  //
  // A draft remembers the value it was typed against and is ignored once
  // that value changes. Otherwise a parent that resets the range (a "clear
  // filters" button, say) would hide the fields, and going back to Custom
  // later would bring the old half-typed dates back with it.
  const [draft, setDraft] = useState<{ from: string; to: string; basis: string } | null>(null);
  const basis = `${value.preset}|${value.from ?? ""}|${value.to ?? ""}`;
  const typed = draft?.basis === basis ? draft : null;

  const custom = value.preset === "custom";
  const fromText = typed?.from ?? toInputDate(value.from);
  const toText = typed?.to ?? toInputDate(value.to);
  // ISO dates compare correctly as strings.
  const backwards = Boolean(fromText && toText && fromText > toText);
  const problem = backwards ? "The end date must be on or after the start date." : null;

  function choose(preset: DateRangePreset) {
    // Custom again while already on it changes nothing, typing included.
    if (preset === "custom" && custom) return;
    setDraft(null);
    if (preset !== "custom") {
      onChange({ preset });
      return;
    }
    // Start Custom from the range already on screen, so choosing it changes
    // nothing until a date is edited. "All time" has no start, so it offers
    // the last 30 days to edit from.
    const shown = resolveDateRange(value);
    const fallback = resolveDateRange({ preset: "30d" });
    onChange({ preset: "custom", from: shown.from ?? fallback.from ?? undefined, to: shown.to });
  }

  function edit(part: "from" | "to", text: string) {
    const next = { from: fromText, to: toText, [part]: text };
    if (!next.from || !next.to || next.from > next.to) {
      setDraft({ ...next, basis });
      return;
    }
    setDraft(null);
    onChange({
      preset: "custom",
      from: startOfDay(parseInputDate(next.from)),
      to: endOfDay(parseInputDate(next.to)),
    });
  }

  return (
    <div className={className}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const active = value.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              aria-expanded={preset === "custom" ? custom : undefined}
              aria-controls={preset === "custom" && custom ? panelId : undefined}
              onClick={() => choose(preset)}
              // The offset keeps the ring readable around the filled pill,
              // where an accent ring would otherwise merge into the fill.
              className={`inline-flex h-9 items-center rounded-full border-[1.5px] px-4 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--dark)]/25 text-[var(--foreground)] hover:bg-[var(--sand)]"
              }`}
            >
              {LABELS[preset]}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {custom ? (
          <motion.div
            key="custom"
            id={panelId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING_SOFT}
            className="mt-4 grid max-w-[480px] grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <Input
              type="date"
              label="From"
              value={fromText}
              max={toText || undefined}
              onChange={(e) => edit("from", e.target.value)}
              aria-invalid={backwards || undefined}
              aria-describedby={problem ? errorId : undefined}
            />
            <Input
              type="date"
              label="To"
              value={toText}
              min={fromText || undefined}
              onChange={(e) => edit("to", e.target.value)}
              error={problem}
              aria-describedby={problem ? errorId : undefined}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The visible message sits under "To", but the date that made the
          range backwards may have been "From", so it is announced as well
          as shown, and both fields point at it. Always mounted, so a screen
          reader is already listening when the text arrives. */}
      <p id={errorId} role="status" className="sr-only">
        {custom && problem ? problem : ""}
      </p>
    </div>
  );
}
