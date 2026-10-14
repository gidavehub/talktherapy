import Link from "next/link";

/**
 * The way back up from a detail screen: "Providers › Awa Jallow › Payouts".
 *
 * Small and quiet; the earlier steps are terracotta links and the last one,
 * the screen you are on, is plain text marked as the current page.
 */

export type BreadcrumbItem = {
  label: string;
  /** Leave off for a step that has no screen of its own. */
  href?: string;
};

function Chevron() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--muted)]/60"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function Breadcrumbs({
  items,
  className = "",
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] leading-snug">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {item.href && !last ? (
                // The deep terracotta: at this size the lighter accent is
                // too faint on cream to read as text, let alone as a link.
                <Link
                  href={item.href}
                  className="truncate rounded-sm text-[var(--accent-deep)] underline-offset-4 outline-none transition-colors hover:text-[var(--dark)] hover:underline focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`truncate ${last ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}
                >
                  {item.label}
                </span>
              )}
              {last ? null : <Chevron />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
