"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * An on/off setting that takes effect straight away: reminders, sounds,
 * sharing a mood log with a provider.
 *
 * Use `Checkbox` instead for anything agreed to as part of a form (consent,
 * terms), where nothing should happen until the form is sent. A switch says
 * "this is now on"; a checkbox says "I will".
 *
 * Sage when on, matching the "Next available" badge rather than the
 * terracotta CTAs, so a page of switches does not shout.
 */
export default function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  hideLabel = false,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div
      className={`flex items-start justify-between gap-4 ${disabled ? "opacity-60" : ""} ${className}`}
    >
      <div className={hideLabel ? "sr-only" : "min-w-0"}>
        <label
          htmlFor={id}
          className={`block select-none text-[14px] leading-snug ${disabled ? "" : "cursor-pointer"}`}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[var(--sage)]/25 disabled:cursor-not-allowed ${
          checked ? "bg-[var(--sage)]" : "bg-[var(--dark)]/15"
        }`}
      >
        {/* 48px track, 4px padding, 20px thumb: 20px of travel. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={SPRING_SNAP}
          className="h-5 w-5 rounded-full bg-[var(--surface)] shadow-[0_2px_6px_-1px_rgba(74,53,48,0.35)]"
        />
      </button>
    </div>
  );
}
