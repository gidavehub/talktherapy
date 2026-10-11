"use client";

/**
 * A rounded search box for a pinned bar: the magnifier, the field, and a
 * clear button once there is something in it.
 */
export default function SearchField({
  value,
  onChange,
  placeholder,
  label = "Search",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <label className={`relative flex min-w-0 flex-1 items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute left-3.5 text-[var(--muted)]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-[var(--dark)]/15 bg-[var(--surface)] pl-10 pr-10 text-[14px] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the search"
          className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--sand)] hover:text-[var(--foreground)]"
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </label>
  );
}
