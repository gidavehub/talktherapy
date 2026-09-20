"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Public site error boundary.
 *
 * Next 16 renamed the recovery prop from `reset` to `unstable_retry`. The old
 * `reset` still exists but only re-renders — it does not re-run the failed
 * fetch — so `unstable_retry` is what actually gives someone a second chance.
 */
export default function MarketingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surfaced in the dev overlay anyway; this is the hook point for real
    // error reporting once that exists.
    console.error("[marketing] render error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] grid place-items-center px-4 sm:px-6 py-24">
      <div className="max-w-[560px] text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Something went wrong
        </p>
        <h1 className="mt-4 text-[32px] sm:text-[42px] md:text-[52px] leading-[1.02] tracking-[-0.025em] font-medium">
          That did not
          <br />
          load properly.
        </h1>
        <p className="mt-5 text-[14px] md:text-[16px] leading-relaxed text-[var(--muted)]">
          This is a problem on our side, not yours. Trying again often works.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={unstable_retry}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white px-7 text-[12px] uppercase tracking-[0.14em] font-medium"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--foreground)] px-7 text-[12px] uppercase tracking-[0.14em] font-medium hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)] transition-colors"
          >
            Back home
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-10 text-[12px] text-[var(--muted)]">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <p className="mt-6 text-[13px] text-[var(--muted)]">
          Need urgent help?{" "}
          <Link href="/crisis" className="underline underline-offset-4 text-[var(--foreground)]">
            Crisis contacts
          </Link>
        </p>
      </div>
    </div>
  );
}
