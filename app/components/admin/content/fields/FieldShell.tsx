"use client";

import { displayLength } from "@/lib/content/tokens";

/**
 * The frame every control in the content form sits in: its label (with a
 * count of characters where there is a limit), the line of help under it,
 * and the problem, when there is one, in place of the help.
 */

/** The kit's field style (app/components/ui/Input.tsx), for the controls drawn here. */
export const CONTROL =
  "w-full rounded-2xl bg-[var(--background)] border border-[var(--dark)]/15 px-4 text-[14px] text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 transition-[border-color,box-shadow] disabled:opacity-60";

export const CONTROL_INVALID = "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]/10";

export const LABEL = "block text-[11px] uppercase tracking-[0.24em] text-[var(--accent-deep)] font-medium";

/** "42 / 60", in warning colours as it nears the limit and past it. */
export function Counter({ value, max, id }: { value: string; max: number; id?: string }) {
  const used = displayLength(value);
  const tone =
    used > max ? "text-[var(--danger)] font-medium" : used > max * 0.9 ? "text-[var(--warning)]" : "text-[var(--muted)]";
  return (
    <span id={id} className={`shrink-0 text-[11.5px] tabular-nums ${tone}`}>
      <span className="sr-only">Characters used: </span>
      {used} / {max}
    </span>
  );
}

export default function FieldShell({
  label,
  htmlFor,
  labelId,
  hideLabel = false,
  help,
  helpId,
  problem,
  problemId,
  aside,
  children,
  className = "",
}: {
  label: string;
  /** The control the label names. Leave out for a group of controls, and pass labelId instead. */
  htmlFor?: string;
  labelId?: string;
  /** Inside a list item, whose header already names it: the label is for screen readers only. */
  hideLabel?: boolean;
  help?: string;
  helpId?: string;
  problem?: string | null;
  problemId?: string;
  /** Beside the label, on the right: a character count, a menu. Under the control when the label is hidden. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const note = problem ? (
    <p id={problemId} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-[var(--danger)]">
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-[1px] shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" strokeLinecap="round" />
      </svg>
      <span>{problem}</span>
    </p>
  ) : help ? (
    <p id={helpId} className="text-[12px] leading-snug text-[var(--muted)]">
      {help}
    </p>
  ) : null;

  if (hideLabel) {
    return (
      <div className={className}>
        <label htmlFor={htmlFor} id={labelId} className="sr-only">
          {label}
        </label>
        {children}
        {note || aside ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">{note}</div>
            {aside ? <span className="flex shrink-0 items-center gap-2">{aside}</span> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex min-h-6 items-end justify-between gap-3">
        <label htmlFor={htmlFor} id={labelId} className={LABEL}>
          {label}
        </label>
        {aside ? <span className="flex items-center gap-2">{aside}</span> : null}
      </div>
      {children}
      {note ? <div className="mt-2">{note}</div> : null}
    </div>
  );
}
