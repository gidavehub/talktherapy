"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

/**
 * Where Modem Pay's checkout sends somebody after they pay for a conversation.
 *
 * Usually the checkout was opened as a NEW tab of Talk, and the original tab
 * is still open, watching for the payment and ready to begin. Two Talks in
 * two tabs is the confusing outcome, so this one closes itself and the person
 * is back where they were. A browser only lets a page close a tab a script
 * opened — when it will not, the page says where to go instead.
 *
 * When the checkout used the same tab (a blocked popup, an in-app browser),
 * there is nowhere else to go back to: straight on to Talk, which knows a
 * payment is on its way (?paid) and picks it up.
 */
export default function PaidPage() {
  const router = useRouter();
  const [stayed, setStayed] = useState(false);

  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) {
      router.replace("/talk?paid=1");
      return;
    }
    window.close();
    // Still here: the browser would not close it.
    const timer = setTimeout(() => setStayed(true), 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--stage)] px-6 text-[var(--cream)]">
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <Logo height={40} light />
        <p className="mt-8 text-[11px] uppercase tracking-[0.3em] text-[var(--peach)]">Payment received</p>
        <h1 className="mt-3 text-[28px] leading-tight font-display font-medium">Thank you.</h1>
        {stayed ? (
          <>
            <p className="mt-3 text-[14px] leading-relaxed text-white/70">
              TALK is waiting for you in the other tab — go back to it, and she will begin. You can
              close this one.
            </p>
            <Link
              href="/talk?paid=1"
              className="mt-6 inline-flex h-12 items-center rounded-full border border-white/25 px-6 text-[14px] font-medium hover:bg-white/10"
            >
              Or carry on here
            </Link>
          </>
        ) : (
          <p className="mt-3 text-[14px] text-white/70">Taking you back to TALK…</p>
        )}
      </div>
    </main>
  );
}
