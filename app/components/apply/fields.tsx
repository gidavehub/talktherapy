"use client";

import { useId, useRef } from "react";
import { motion } from "motion/react";
import { Dropdown } from "../ui/Dropdown";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * The pieces the application's steps are built from, beyond the shared kit:
 * cards to choose from, chips to toggle, a date of birth, a phone number with
 * its country code, a fee slider, and the small print under a text box.
 *
 * Each draws its own control rather than dressing up a native one, so the
 * whole application looks like TALK on every phone, and each keeps the
 * keyboard and screen-reader behaviour of the control it stands in for.
 */

const LEGEND = "block text-[11px] uppercase tracking-[0.24em] text-[var(--accent)] font-medium";

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
        on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--dark)]/30 bg-[var(--surface)]"
      }`}
    >
      {on ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
          <path d="M5 12l5 5L20 7" />
        </svg>
      ) : null}
    </span>
  );
}

/** A group's heading, hint and error, in the field style. */
export function GroupFrame({
  legend,
  hint,
  error,
  children,
  className = "",
}: {
  legend: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className={className} aria-describedby={hint || error ? hintId : undefined}>
      <legend className={`${LEGEND} mb-1`}>{legend}</legend>
      {hint ? <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--muted)]">{hint}</p> : <div className="mb-2" />}
      {children}
      {error ? (
        <p id={hintId} role="alert" className="mt-2 text-[13px] leading-snug text-[var(--accent)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Cards to choose from — one (`multiple` off, a radio group) or several.
 * Used where a choice needs a sentence beside it, like the kinds of support.
 */
export function ChoiceCards<T extends string>({
  legend,
  hint,
  error,
  options,
  value,
  onChange,
  multiple = false,
  columns = 2,
}: {
  legend: string;
  hint?: string;
  error?: string | null;
  options: { value: T; label: string; description?: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const grid = columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3";
  return (
    <GroupFrame legend={legend} hint={hint} error={error}>
      <div role={multiple ? "group" : "radiogroup"} className={`grid gap-2.5 ${grid}`}>
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <motion.button
              key={option.value}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_SNAP}
              onClick={() =>
                onChange(
                  multiple ? (on ? value.filter((v) => v !== option.value) : [...value, option.value]) : [option.value],
                )
              }
              className={`flex min-h-[56px] items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--dark)]/12 bg-[var(--background)] hover:border-[var(--dark)]/30"
              }`}
            >
              <span className="mt-0.5">
                {multiple ? (
                  <Tick on={on} />
                ) : (
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                      on ? "border-[var(--accent)]" : "border-[var(--dark)]/30"
                    }`}
                  >
                    {on ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" /> : null}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium leading-snug">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--muted)]">{option.description}</span>
                ) : null}
              </span>
            </motion.button>
          );
        })}
      </div>
    </GroupFrame>
  );
}

/** Pills to toggle on and off. For short lists of single words. */
export function ToggleChips<T extends string>({
  legend,
  hint,
  error,
  options,
  value,
  onChange,
  max,
}: {
  legend: string;
  hint?: string;
  error?: string | null;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  /** The most that may be on at once; the rest wait until one is turned off. */
  max?: number;
}) {
  const full = max != null && value.length >= max;
  return (
    <GroupFrame legend={legend} hint={hint} error={error}>
      <div role="group" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option.value);
          const blocked = !on && full;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])}
              className={`inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] px-4 text-[13px] transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 disabled:opacity-40 ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--dark)]/25 bg-transparent hover:bg-[var(--sand)]"
              }`}
            >
              {on ? (
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : null}
              {option.label}
            </button>
          );
        })}
      </div>
      {max != null ? (
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          {value.length} of {max} chosen
        </p>
      ) : null}
    </GroupFrame>
  );
}

/** "120 / 600" under a text box, terracotta when it is outside the range. */
export function CharCount({ value, min = 0, max }: { value: string; min?: number; max: number }) {
  const n = value.trim().length;
  const outside = n > max || (n > 0 && n < min);
  return (
    <p aria-live="polite" className={`mt-1.5 text-right text-[11.5px] tabular-nums ${outside ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
      {min > 0 && n < min ? `${min - n} more to go · ` : ""}
      {n} / {max}
    </p>
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A date of birth as three lists — day, month, year — rather than a calendar.
 * Nobody pages back forty years through a calendar to find their birthday.
 * Stored as "YYYY-MM-DD"; an incomplete choice is kept as far as it goes.
 */
export function BirthDate({
  value,
  onChange,
  error,
  now,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  now: number;
}) {
  const [y = "", m = "", d = ""] = value.split("-");
  const thisYear = new Date(now).getUTCFullYear();
  const years = Array.from({ length: 83 }, (_, i) => String(thisYear - 18 - i));
  const set = (part: "y" | "m" | "d", next: string) => {
    const parts = { y, m, d, [part]: next };
    onChange(`${parts.y}-${parts.m}-${parts.d}`);
  };
  return (
    <GroupFrame legend="Date of birth" hint="Providers on TALK are 18 or older. Only staff see this." error={error}>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <Dropdown
          label="Day"
          hideLabel
          placeholder="Day"
          value={d || null}
          onChange={(next) => set("d", next)}
          options={Array.from({ length: 31 }, (_, i) => {
            const v = String(i + 1).padStart(2, "0");
            return { value: v, label: String(i + 1) };
          })}
        />
        <Dropdown
          label="Month"
          hideLabel
          placeholder="Month"
          value={m || null}
          onChange={(next) => set("m", next)}
          options={MONTHS.map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }))}
        />
        <Dropdown
          label="Year"
          hideLabel
          placeholder="Year"
          searchable
          searchPlaceholder="Type a year"
          value={y || null}
          onChange={(next) => set("y", next)}
          options={years.map((v) => ({ value: v, label: v }))}
        />
      </div>
    </GroupFrame>
  );
}

/** A Gambian number: +220 shown in front, seven digits typed after it. */
export function PhoneField({
  label,
  hint,
  value,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  /** What they have typed, or a stored "+2207000000". */
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
}) {
  const id = useId();
  const local = value.replace(/^\+220/, "");
  return (
    <div>
      <label htmlFor={id} className={`${LEGEND} mb-2`}>
        {label}
      </label>
      <div
        className={`flex h-12 items-center rounded-2xl border bg-[var(--background)] transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent)]/10 ${
          error ? "border-[var(--accent)]" : "border-[var(--dark)]/15"
        }`}
      >
        <span className="flex h-full items-center border-r border-[var(--dark)]/10 pl-4 pr-3 text-[14px] text-[var(--muted)]">
          🇬🇲 +220
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="700 0000"
          value={local}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, "").slice(0, 9))}
          className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent px-3 text-[14px] outline-none"
        />
      </div>
      {error ? (
        <p className="mt-2 text-[13px] leading-snug text-[var(--accent)]">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-[12px] leading-snug text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A slider drawn by hand: a sand track, a terracotta fill, an arch-topped
 * handle. Arrow keys move one step, Page keys ten, Home and End to the ends —
 * the same as a native range input, which it reports itself as.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format: (v: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fraction = (Math.min(max, Math.max(min, value)) - min) / (max - min);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));

  function fromPointer(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const at = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    onChange(snap(min + at * (max - min)));
  }

  return (
    <div className="select-none py-3">
      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer rounded-full bg-[var(--sand)] touch-none"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) fromPointer(e.clientX);
        }}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${fraction * 100}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          onKeyDown={(e) => {
            const moves: Record<string, number> = {
              ArrowRight: step,
              ArrowUp: step,
              ArrowLeft: -step,
              ArrowDown: -step,
              PageUp: step * 10,
              PageDown: -step * 10,
            };
            if (e.key in moves) {
              e.preventDefault();
              onChange(snap(value + moves[e.key]));
            } else if (e.key === "Home") {
              e.preventDefault();
              onChange(min);
            } else if (e.key === "End") {
              e.preventDefault();
              onChange(max);
            }
          }}
          className="arch absolute top-1/2 h-8 w-7 -translate-x-1/2 -translate-y-1/2 rounded-b-lg bg-[var(--accent)] shadow-[var(--shadow-accent)] outline-none ring-[var(--accent)]/20 focus-visible:ring-4"
          style={{ left: `${fraction * 100}%` }}
        >
          <span aria-hidden className="absolute inset-x-0 top-1/2 mx-auto block h-3 w-[2px] -translate-y-1/3 rounded-full bg-white/80" />
        </div>
      </div>
      <div aria-hidden className="mt-3 flex justify-between text-[11.5px] text-[var(--muted)]">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/** A row in a summary: the label, and what they said or a gentle "not yet". */
export function SummaryValue({ children }: { children: React.ReactNode }) {
  const empty = children == null || children === "" || (Array.isArray(children) && children.length === 0);
  return empty ? <span className="text-[var(--muted)]">Not given yet</span> : <>{children}</>;
}
