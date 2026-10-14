"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "../Logo";
import { useAuth } from "../AuthProvider";
import { signOutToHome } from "@/lib/signOutFlow";

/**
 * The top of the application screens: the TALK mark, a way to ask for help,
 * and — once signed in — a way out. Deliberately not the app's own shell: an
 * applicant is not in the product yet, and a menu full of places they cannot
 * go would only say so over and over.
 */
export default function ApplyHeader() {
  const { user } = useAuth();
  const router = useRouter();
  return (
    <header className="relative z-10">
      <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between gap-3 px-5 md:h-[88px] md:px-10">
        <Link href="/" aria-label="TALK — home" className="shrink-0">
          <Logo height={34} priority />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/support"
            className="hidden h-11 items-center rounded-full px-4 text-[13.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] sm:flex"
          >
            Questions? Ask us
          </Link>
          {user ? (
            <button
              type="button"
              onClick={() => void signOutToHome(router)}
              className="flex h-11 items-center rounded-full border-[1.5px] border-[var(--dark)] px-5 text-[13.5px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/for-providers"
              className="flex h-11 items-center rounded-full border-[1.5px] border-[var(--dark)] px-5 text-[13.5px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
            >
              Back
            </Link>
          )}
        </div>
      </div>
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
    </header>
  );
}
