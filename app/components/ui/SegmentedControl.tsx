"use client";

import { useId, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * Stretched, the container sets each column and padding only eats into the
 * label: with px-4, "No preference" in a third of a phone screen loses its
 * last letters. Hugging, the padding is what gives each segment its width.
 */
const PADDING = {
  stretched: { sm: "px-1.5 sm:px-3", md: "px-2 sm:px-4" },
  hugging: { sm: "px-3", md: "px-4" },
};

/**
 * A row of two to four mutually exclusive choices with a brown pill that
 * slides to the chosen one — the home page's "A man / A woman / No
 * preference" control, made reusable.
 *
 * The pill's `layoutId` carries this instance's `useId`, so two controls on
 * one page each keep their own pill instead of one pill flying between them.
 *
 * It is a radio group to assistive technology: one tab stop, arrow keys move
 * the choice, as with native radio buttons.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  fullWidth = false,
  className = "",
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
  /** Stretches across its container, as on the home page. Otherwise it hugs its labels. */
  fullWidth?: boolean;
  className?: string;
}) {
  const uid = useId();
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const chosen = options.findIndex((option) => option.value === value);
  // With nothing chosen, or the choice since switched off, the first enabled
  // option holds the tab stop: a disabled button cannot take focus, and the
  // group would drop out of the Tab order altogether.
  const tabStop = chosen >= 0 && !options[chosen].disabled ? chosen : (enabled[0] ?? -1);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(index);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = enabled[(at + 1) % enabled.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = enabled[(at - 1 + enabled.length) % enabled.length];
    } else if (event.key === "Home") {
      next = enabled[0];
    } else if (event.key === "End") {
      next = enabled[enabled.length - 1];
    }
    if (next === null) return;
    event.preventDefault();
    // Home on the first choice, or an arrow with only one choice open, is
    // not a change.
    if (options[next].value !== value) onChange(options[next].value);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      className={`${fullWidth ? "grid w-full" : "inline-grid"} rounded-full border-[1.5px] border-[var(--dark)] bg-[var(--surface)] p-1 ${className}`}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={option.disabled}
            // A radio already on stays quiet when pressed again.
            onClick={() => {
              if (!on) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:cursor-not-allowed disabled:opacity-45 ${
              size === "sm" ? "h-8 text-[12.5px]" : "h-10 text-[13.5px]"
            } ${PADDING[fullWidth ? "stretched" : "hugging"][size]}`}
          >
            {on ? (
              <motion.span
                layoutId={`segment-${uid}`}
                transition={SPRING_SNAP}
                className="absolute inset-0 rounded-full bg-[var(--dark)]"
              />
            ) : null}
            <span
              className={`relative block truncate transition-colors ${on ? "text-[var(--cream)]" : "text-[var(--foreground)]"}`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
