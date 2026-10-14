"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { IconCheck } from "./icons";

/**
 * Where someone is in a process with stages: a provider's application
 * (details, licence, review), an organisation's setup, a payout's journey.
 *
 * The markers are small arches, the shape every person and icon chip in the
 * redesign stands in. Done is sage with a tick, the current stage terracotta,
 * a stage that went wrong the danger red, and what is still to come sand.
 */

export type StepStatus = "done" | "current" | "todo" | "error";

export type StepperStep = {
  id: string;
  label: string;
  status: StepStatus;
};

const MARKERS: Record<StepStatus, string> = {
  done: "bg-[var(--sage)] text-white",
  current: "bg-[var(--accent)] text-white shadow-[var(--shadow-accent)]",
  todo: "bg-[var(--sand)] text-[var(--muted)]",
  error: "bg-[var(--danger)] text-white",
};

// Read out after each label, since the colour alone carries the status.
const STATUS_TEXT: Record<StepStatus, string> = {
  done: "Done",
  current: "In progress",
  todo: "Not started",
  error: "Needs attention",
};

// The deep tints: at 12px plain sage and terracotta are too faint on white
// to read comfortably, and the status is the one line that must be read.
const STATUS_TONE: Record<StepStatus, string> = {
  done: "text-[var(--sage-deep)]",
  current: "text-[var(--accent-deep)]",
  todo: "text-[var(--muted)]",
  error: "text-[var(--danger)]",
};

const LABEL = "text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--sage)]";

function Marker({ status, index }: { status: StepStatus; index: number }) {
  return (
    <motion.span
      // Keyed on status so a stage that moves on pops into its new colour
      // rather than quietly swapping it.
      key={status}
      initial={{ scale: 0.82 }}
      animate={{ scale: 1 }}
      transition={SPRING_SNAP}
      aria-hidden
      className={`arch relative z-10 flex h-10 w-9 shrink-0 items-center justify-center rounded-b-xl text-[13px] font-medium tabular-nums ${MARKERS[status]}`}
    >
      {status === "done" ? (
        <IconCheck size={15} />
      ) : status === "error" ? (
        <span className="text-[15px] leading-none">!</span>
      ) : (
        index + 1
      )}
    </motion.span>
  );
}

export default function Stepper({
  steps,
  orientation = "horizontal",
  onStepClick,
  className = "",
}: {
  steps: StepperStep[];
  orientation?: "vertical" | "horizontal";
  /** Makes each stage a button. What a click means is the caller's call. */
  onStepClick?: (id: string) => void;
  className?: string;
}) {
  const vertical = orientation === "vertical";

  return (
    <ol className={`${vertical ? "" : "flex items-start"} ${className}`}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const current = step.status === "current";
        const error = step.status === "error";

        const label = vertical ? (
          <span className="min-w-0 pt-1.5 text-left">
            <span
              className={`block text-[14px] leading-snug ${
                current ? "font-medium text-[var(--foreground)]" : error ? "text-[var(--danger)]" : "text-[var(--foreground)]"
              }`}
            >
              {step.label}
            </span>
            <span className={`mt-0.5 block text-[12px] ${STATUS_TONE[step.status]}`}>{STATUS_TEXT[step.status]}</span>
          </span>
        ) : (
          // On a phone only the current stage, and any that went wrong, keep
          // their labels on screen: a red "!" with no word beside it says
          // something is wrong without saying what. The rest stay readable
          // to a screen reader.
          <span
            className={`mt-2.5 block px-1 text-center text-[12px] leading-snug ${
              current
                ? "font-medium text-[var(--foreground)]"
                : error
                  ? "text-[var(--danger)]"
                  : "max-sm:sr-only text-[var(--muted)]"
            }`}
          >
            {step.label}
            <span className="sr-only">, {STATUS_TEXT[step.status]}</span>
          </span>
        );

        const inner = (
          <>
            <Marker status={step.status} index={i} />
            {label}
          </>
        );

        const shape = vertical ? "flex items-start gap-4" : "flex flex-col items-center";
        const content = onStepClick ? (
          <button
            type="button"
            onClick={() => onStepClick(step.id)}
            className={`${shape} group rounded-2xl outline-none transition-opacity hover:opacity-85 focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15`}
          >
            {inner}
          </button>
        ) : (
          <div className={shape}>{inner}</div>
        );

        // The line to the next stage turns sage once this one is done.
        const line = step.status === "done" ? "bg-[var(--sage)]" : "bg-[var(--border)]";

        return (
          <li
            key={step.id}
            aria-current={current ? "step" : undefined}
            className={vertical ? `relative ${last ? "" : "pb-6"}` : "relative flex min-w-0 flex-1 flex-col items-center"}
          >
            {last ? null : vertical ? (
              <span aria-hidden className={`absolute left-[17px] top-11 bottom-1 w-0.5 rounded-full ${line}`} />
            ) : (
              // From this marker's centre to the next one's: each stage is
              // an equal share of the row, so the next centre is one share on.
              <span aria-hidden className={`absolute left-1/2 top-5 h-0.5 w-full -translate-y-1/2 ${line}`} />
            )}
            {content}
          </li>
        );
      })}
    </ol>
  );
}

/** A terracotta fill on a sand track. `value` runs from 0 to 1. */
export function ProgressBar({
  value,
  label,
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const labelId = useId();
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(fraction * 100);

  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span id={labelId} className={LABEL}>
            {label}
          </span>
          <span aria-hidden className="text-[12px] tabular-nums text-[var(--muted)]">
            {percent}%
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        // Named by the label on screen when there is one, so the two
        // cannot drift apart; the percentage is read from aria-valuenow.
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : "Progress"}
        className="h-2 overflow-hidden rounded-full bg-[var(--sand)]"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={SPRING_SOFT}
          className="h-full rounded-full bg-[var(--accent)]"
        />
      </div>
    </div>
  );
}
