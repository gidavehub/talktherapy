import Link from "next/link";

/**
 * The dark brown band at the foot of every public page: TALK and its four
 * words on the left; the few links, and the address, on the right. The
 * urgent-help link is here too — it must be one tap away from every page.
 */
const LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
  { href: "/community", label: "Community" },
];

const MORE = [
  { href: "/providers", label: "Providers" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/plans", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
  { href: "/for-providers", label: "For providers" },
];

export default function Footer() {
  return (
    <footer className="bg-[var(--dark)] text-[var(--cream)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-5 py-12 md:grid-cols-[1fr_auto] md:px-10 md:py-14">
        <div>
          <p className="font-display text-[40px] font-semibold leading-none tracking-[0.02em]">TALK</p>
          <p className="mt-3 text-[11px] tracking-[0.42em] text-[var(--cream)]/80">LISTEN&nbsp; SUPPORT&nbsp; HEAL&nbsp; GROW</p>
          <nav aria-label="More" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-[var(--cream)]/65">
            {MORE.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-[var(--cream)]">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="md:text-right">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-7 gap-y-2 text-[14.5px] md:justify-end">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-[var(--peach)]">
                {link.label}
              </Link>
            ))}
          </nav>
          <a href="https://www.talktherapy.gm" className="mt-4 inline-block text-[14.5px] text-[var(--peach)]">
            talktherapy.gm
          </a>
          <p className="mt-6">
            <Link
              href="/crisis"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--cream)]/25 px-4 py-2 text-[13px] text-[var(--cream)] hover:bg-[var(--cream)]/10"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--peach)]" aria-hidden />
              Urgent help — free, no account
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
