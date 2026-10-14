"use client";

import { useId, useRef } from "react";
import type { LongTextField, TextField } from "@/lib/content/schema";
import { fillTokens, placeholdersIn } from "@/lib/content/tokens";
import FieldShell, { CONTROL, CONTROL_INVALID, Counter } from "./FieldShell";
import TokenMenu, { insertAtCaret } from "./TokenMenu";
import { useForm } from "./context";

/**
 * One line (a heading line, a label, a button's words) or a paragraph.
 * Counts as a visitor reads it: a placeholder counts as the price it shows.
 */
export default function TextControl({
  field,
  value,
  onChange,
  fieldKey,
  label,
  hideLabel = false,
}: {
  field: TextField | LongTextField;
  value: string;
  onChange: (next: string) => void;
  fieldKey: string;
  /** Overrides the field's own label — "Line 2" inside a list. */
  label?: string;
  /** Inside a list item, whose header already says what it is. */
  hideLabel?: boolean;
}) {
  const { problem, touch } = useForm();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const issue = problem(fieldKey);
  const name = label ?? field.label;
  const described = [issue ? `${id}-problem` : field.help ? `${id}-help` : null, `${id}-count`].filter(Boolean).join(" ");
  const filled = placeholdersIn(value).length > 0 ? fillTokens(value) : null;

  const common = {
    id,
    value,
    "aria-invalid": issue ? true : undefined,
    "aria-describedby": described,
    "aria-required": field.required || undefined,
    onBlur: () => touch(fieldKey),
  } as const;

  return (
    <FieldShell
      label={name}
      htmlFor={id}
      hideLabel={hideLabel}
      help={field.help}
      helpId={`${id}-help`}
      problem={issue}
      problemId={`${id}-problem`}
      aside={
        <>
          <TokenMenu
            label={name}
            onInsert={(placeholder) =>
              insertAtCaret(field.kind === "text" ? inputRef.current : areaRef.current, value, placeholder, onChange)
            }
          />
          <Counter value={value} max={field.max} id={`${id}-count`} />
        </>
      }
    >
      {field.kind === "text" ? (
        <input
          {...common}
          ref={inputRef}
          type="text"
          onChange={(e) => onChange(e.target.value)}
          className={`${CONTROL} h-12 ${issue ? CONTROL_INVALID : ""}`}
        />
      ) : (
        <textarea
          {...common}
          ref={areaRef}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          // Grows with its words where the browser can; three lines elsewhere.
          className={`${CONTROL} min-h-[96px] resize-y py-3 leading-relaxed [field-sizing:content] ${issue ? CONTROL_INVALID : ""}`}
        />
      )}
      {filled ? (
        <p className="mt-2 text-[12px] leading-snug text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">Reads as: </span>
          {filled}
        </p>
      ) : null}
    </FieldShell>
  );
}
