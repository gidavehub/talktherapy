import Link from "next/link";
import Logo from "./components/Logo";

/**
 * Root 404.
 *
 * Lives at the app root rather than inside `(marketing)`, so it also catches
 * unmatched paths under the authenticated areas. That means it renders without
 * the marketing Header and Footer — hence the logo on its own and the links here.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <div className="px-4 sm:px-6 md:px-10 pt-5 md:pt-8">
        <Link href="/" aria-label="TALK — home" className="inline-block">
          <Logo height={36} />
        </Link>
      </div>

      <div className="flex-1 grid place-items-center px-4 sm:px-6 py-16">
        <div className="max-w-[560px] text-center">
          <p className="eyebrow">
            404
          </p>
          <h1 className="mt-4 text-[36px] sm:text-[48px] md:text-[58px] leading-[1.06] font-display font-medium">
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
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-deep)] transition-colors text-white px-7 text-[14px] font-medium"
            >
              Back home
            </Link>
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] px-7 text-[14px] font-medium hover:bg-[var(--dark)] hover:text-[var(--cream)] transition-colors"
            >
              Get help
            </Link>
          </div>

          <p className="mt-12 text-[13px] text-[var(--muted)]">
            If you were looking for emergency numbers,{" "}
            <Link href="/crisis" className="underline underline-offset-4 text-[var(--foreground)]">
              they are here
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
