"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for the signed-in app.
 *
 * Without one, a render error in the dashboard or a conversation fell all the
 * way through to the global shell and took the navigation with it — so
 * somebody in the middle of writing to their provider lost their way back as
 * well as the screen.
 *
 * The emergency numbers are here on purpose. Whoever hits this page may have
 * been about to reach for help when it broke, and a failure screen is the
 * worst possible place to leave them without it.
 *
 * Next 16.3: the recovery prop is `retry` (it re-fetches); see the note in
 * app/(marketing)/error.tsx for why `unstable_retry` and `reset` are wrong.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] grid place-items-center py-16">
      <div className="max-w-[520px] text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Something went wrong
        </p>
        <h1 className="mt-4 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          That did not load properly.
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--muted)]">
          This is a problem on our side, not yours. Your conversations and
          sessions are safe — trying again usually works.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white px-7 text-[12px] uppercase tracking-[0.14em] font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] px-7 text-[12px] uppercase tracking-[0.14em] font-medium hover:bg-black/[.03] transition-colors"
          >
            Go home
          </Link>
        </div>

        <p className="mt-10 text-[13px] leading-relaxed text-[var(--muted)]">
          If you are in danger right now, call <strong className="text-[var(--foreground)]">117</strong>{" "}
          for the police or <strong className="text-[var(--foreground)]">116</strong> for an ambulance.
        </p>
      </div>
    </div>
  );
}
