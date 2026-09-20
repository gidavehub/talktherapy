"use client";

import { useId } from "react";

/**
 * Form controls.
 *
 * The field style is inverted from the page on purpose — bone fill on a white
 * card — which is how AuthCard reads. Keep `bg-[var(--background)]`; a white
 * input on a white card disappears.
 *
 * Every control takes a real `label`. The auth card uses placeholders alone,
 * which is fine for two fields but fails accessibility everywhere else, so the
 * primitive requires one and offers `hideLabel` for the rare visual exception.
 */

const CONTROL =
  "w-full h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] px-4 text-[14px] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  hideLabel = false,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  hideLabel?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={
          hideLabel
            ? "sr-only"
            : "block text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-2"
        }
      >
        {label}
        {required ? <span className="text-[var(--accent)]"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-[13px] text-[var(--accent)] leading-snug">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-[12px] text-[var(--muted)] leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  hideLabel,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={props.required}
      hideLabel={hideLabel}
      className={className}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[var(--accent)]" : ""}`}
        {...props}
      />
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  hideLabel,
  rows = 5,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={props.required}
      hideLabel={hideLabel}
      className={className}
    >
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} h-auto py-3 resize-y leading-relaxed ${
          error ? "border-[var(--accent)]" : ""
        }`}
        {...props}
      />
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  hideLabel,
  options,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={props.required}
      hideLabel={hideLabel}
      className={className}
    >
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL} appearance-none pr-10 ${
            error ? "border-[var(--accent)]" : ""
          }`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </Field>
  );
}

/** Pill-shaped multi-select, used for specializations, topics and languages. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  multiple = true,
  className = "",
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  className?: string;
}) {
  function toggle(option: T) {
    if (!multiple) {
      onChange([option]);
      return;
    }
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option],
    );
  }

  return (
    <fieldset className={className}>
      <legend className="block text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option.value)}
              className={`h-9 px-4 rounded-full text-[12px] tracking-wide transition-colors border ${
                active
                  ? "bg-[var(--dark)] text-white border-[var(--dark)]"
                  : "bg-transparent border-[var(--border)] hover:bg-black/5"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Consent toggle. Deliberately explicit — never pre-checked. */
export function Checkbox({
  label,
  description,
  checked,
  onChange,
  className = "",
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-5 rounded-full shrink-0 flex items-center justify-center border transition-colors ${
          checked
            ? "bg-[var(--accent)] border-[var(--accent)] text-white"
            : "bg-transparent border-[var(--border)]"
        }`}
      >
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : null}
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-[14px] leading-snug">{label}</span>
        {description ? (
          <span className="mt-1 block text-[12px] text-[var(--muted)] leading-relaxed">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}
