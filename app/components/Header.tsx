"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { beginDoorway, talkHref } from "../lib/talkDoorway";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";
import { useAuth } from "./AuthProvider";
import Logo from "./Logo";

/**
 * Public site header: the TALK mark, four links with a terracotta underline on
 * the page you are on, Sign in, "Begin with TALK", and the menu.
 *
 * Pinned to the top of the window on every public page, however far down you
 * scroll — the logo and the menu are always there. At the very top it is
 * clear, so the page's first band — cream on the home page, sand on the
 * others — runs up behind it; once the page moves, it turns solid. Pages
 * leave room for it (HomeHero, PageIntro). Talk's screen has its own.
 *
 * The menu carries the rest of the site and the urgent-help link — always
 * one tap away. On a phone it is also where the four links go.
 */

const PRIMARY_LINKS = [
  { href: "/providers", label: "Providers" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/plans", label: "Pricing" },
  { href: "/support", label: "Support" },
];

const SECONDARY_LINKS = [
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
  { href: "/safety", label: "Safety & ethics" },
  { href: "/for-providers", label: "For providers" },
  { href: "/for-institutions", label: "For institutions" },
  { href: "/community", label: "Community" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user, ready } = useAuth();
  const pathname = usePathname();
  // Moved off the very top: the bar turns solid so it reads over anything.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const begin = (
    <Link
      href={user ? "/dashboard" : talkHref()}
      onClick={(e) => {
        if (ready && !user) beginDoorway(false, e);
        setOpen(false);
      }}
      className="inline-flex h-11 items-center rounded-full bg-[var(--accent)] px-6 text-[14px] font-medium text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--accent-deep)]"
    >
      {user ? "Your dashboard" : "Begin with TALK"}
    </Link>
  );

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        className={`fixed left-0 right-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
          scrolled
            ? "bg-[var(--background)]/92 shadow-[0_8px_24px_-18px_rgba(74,53,48,0.35)] backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 transition-[height] duration-300 md:px-10 ${
            scrolled ? "h-[68px] md:h-[72px]" : "h-[84px] md:h-[92px]"
          }`}
        >
          <Link href="/" aria-label="TALK — home" className="shrink-0">
            <Logo height={38} priority />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-9 lg:flex">
            {PRIMARY_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative py-2 text-[14.5px] transition-colors ${
                    active ? "font-medium text-[var(--foreground)]" : "text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                  }`}
                >
                  {link.label}
                  {active ? (
                    <motion.span
                      layoutId="nav-underline"
                      transition={SPRING_SNAP}
                      className="absolute inset-x-0 -bottom-0.5 h-[2.5px] rounded-full bg-[var(--accent)]"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 md:gap-6">
            <Link
              href={user ? "/dashboard" : talkHref({ signIn: true })}
              // Signing in is Talk's to do: she asks, and brings it up.
              onClick={(e) => {
                if (ready && !user) beginDoorway(false, e);
              }}
              className="hidden text-[14.5px] font-medium text-[var(--foreground)] hover:text-[var(--accent)] sm:inline"
            >
              {user ? "Dashboard" : "Sign in"}
            </Link>
            <div className="hidden sm:block">{begin}</div>
            <motion.button
              type="button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAP}
              className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)]/70 text-[var(--foreground)] transition-colors hover:bg-[var(--sand)]"
            >
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
                <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
                <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
              </svg>
            </motion.button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[var(--cream)] text-[var(--foreground)]"
          >
            <div className="mx-auto flex min-h-full max-w-[1200px] flex-col px-5 pb-14 md:px-10">
              <div className="flex h-[84px] items-center justify-between">
                <Link href="/" onClick={() => setOpen(false)} aria-label="TALK — home">
                  <Logo height={36} />
                </Link>
                <motion.button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAP}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)]/70"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </motion.button>
              </div>

              <div className="zigzag mt-2" />

              <motion.nav
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}
                className="mt-10 grid flex-1 grid-cols-1 gap-10 md:grid-cols-[1.2fr_1fr] md:gap-16"
              >
                <div className="flex flex-col gap-1">
                  {PRIMARY_LINKS.map((link) => (
                    <motion.div
                      key={link.href}
                      variants={{ hidden: { x: -24, opacity: 0 }, show: { x: 0, opacity: 1, transition: SPRING_SOFT } }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className={`font-display block text-[36px] leading-[1.2] md:text-[48px] ${
                          isActive(pathname, link.href) ? "display-accent" : "hover:text-[var(--accent)]"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 md:pt-3">
                  <p className="eyebrow mb-1">More</p>
                  {SECONDARY_LINKS.map((link) => (
                    <motion.div
                      key={link.href}
                      variants={{ hidden: { x: -16, opacity: 0 }, show: { x: 0, opacity: 1, transition: SPRING_SOFT } }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="block text-[16px] text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </motion.nav>

              <div className="mt-12 flex flex-col gap-4 border-t border-[var(--border)] pt-8 sm:flex-row sm:items-center sm:gap-6">
                <div className="self-start">{begin}</div>
                {user ? null : (
                  <Link
                    href={talkHref({ signIn: true })}
                    onClick={(e) => {
                      if (ready) beginDoorway(false, e);
                      setOpen(false);
                    }}
                    className="text-[15px] font-medium"
                  >
                    Sign in
                  </Link>
                )}
                {/* Always one tap away, from every page, signed in or not. */}
                <Link
                  href="/crisis"
                  onClick={() => setOpen(false)}
                  className="text-[14px] text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-4"
                >
                  In danger? Free emergency numbers
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
