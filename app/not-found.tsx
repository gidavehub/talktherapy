import Link from "next/link";

/**
 * Root 404.
 *
 * Lives at the app root rather than inside `(marketing)`, so it also catches
 * unmatched paths under the authenticated areas. That means it renders without
 * the marketing Header and Footer — hence the minimal wordmark and links here.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <div className="px-4 sm:px-6 md:px-10 pt-5 md:pt-8">
        <Link
          href="/"
          className="leading-[0.85] text-[15px] font-medium tracking-tight inline-block"
        >
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
      </div>

      <div className="flex-1 grid place-items-center px-4 sm:px-6 py-16">
        <div className="max-w-[560px] text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            404
          </p>
          <h1 className="mt-4 text-[36px] sm:text-[48px] md:text-[58px] leading-[1.02] tracking-[-0.025em] font-medium">
            This page does
            <br />
            not exist.
          </h1>
          <p className="mt-5 text-[14px] md:text-[16px] leading-relaxed text-[var(--muted)]">
            The link may be out of date, or the page may have moved. Nothing has
            gone wrong with your account.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white px-7 text-[12px] uppercase tracking-[0.14em] font-medium"
            >
              Back home
            </Link>
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--foreground)] px-7 text-[12px] uppercase tracking-[0.14em] font-medium hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)] transition-colors"
            >
              Get help
            </Link>
          </div>

          <p className="mt-12 text-[13px] text-[var(--muted)]">
            If you were looking for urgent help,{" "}
            <Link href="/crisis" className="underline underline-offset-4 text-[var(--foreground)]">
              crisis contacts are here
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
