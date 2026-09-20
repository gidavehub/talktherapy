"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";
import { useAuth } from "./AuthProvider";

/**
 * Public site header.
 *
 * The design keeps the bar deliberately bare — wordmark, menu, sign in — and
 * puts the whole navigation behind the menu button. That was always the intent
 * of the hamburger; it just had no handler until now.
 */

const PRIMARY_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/therapists", label: "Counsellors" },
  { href: "/resources", label: "Resources" },
  { href: "/plans", label: "Plans" },
];

const SECONDARY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/technology", label: "Technology" },
  { href: "/safety", label: "Safety & Ethics" },
  { href: "/for-counsellors", label: "For Counsellors" },
  { href: "/for-institutions", label: "For Institutions" },
  { href: "/support", label: "Support" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

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

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        className="absolute top-0 left-0 right-0 z-30 px-4 sm:px-6 md:px-10 pt-5 md:pt-8"
      >
        <div className="flex items-start justify-between">
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.15 }}
          >
            <Link
              href="/"
              className="leading-[0.85] text-[15px] font-medium tracking-tight inline-block"
            >
              <motion.span
                className="block"
                initial={{ y: -8 }}
                animate={{ y: 0 }}
                transition={{ ...SPRING_SNAP, delay: 0.2 }}
              >
                TALK
              </motion.span>
              <motion.span
                className="block"
                initial={{ y: 8 }}
                animate={{ y: 0 }}
                transition={{ ...SPRING_SNAP, delay: 0.26 }}
              >
                THERAPY
              </motion.span>
            </Link>
          </motion.div>

          <motion.div
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.2 }}
            className="flex items-center gap-2"
          >
            <motion.button
              type="button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              whileHover={{ scale: 1.06, rotate: -8 }}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAP}
              className="h-11 w-11 rounded-full bg-[var(--dark)] text-white flex items-center justify-center"
            >
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
                <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
                <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
              </svg>
            </motion.button>

            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
              <Link
                href={user ? "/dashboard" : "/sign-in"}
                className="h-11 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-transparent px-5 text-[13px] font-medium tracking-wide uppercase hover:bg-black/5 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
                {user ? "Dashboard" : "Sign In"}
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-[var(--dark)] text-white overflow-y-auto"
          >
            <div className="px-4 sm:px-6 md:px-10 pt-5 md:pt-8 pb-16 min-h-full flex flex-col">
              <div className="flex items-start justify-between">
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="leading-[0.85] text-[15px] font-medium tracking-tight"
                >
                  <span className="block">TALK</span>
                  <span className="block">THERAPY</span>
                </Link>
                <motion.button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  whileHover={{ scale: 1.06, rotate: 8 }}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAP}
                  className="h-11 w-11 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </motion.button>
              </div>

              <motion.nav
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
                }}
                className="mt-12 md:mt-16 flex-1"
              >
                <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-10 md:gap-16 max-w-[1100px]">
                  <div className="flex flex-col gap-2">
                    {PRIMARY_LINKS.map((link) => (
                      <motion.div
                        key={link.href}
                        variants={{
                          hidden: { x: -30, opacity: 0 },
                          show: { x: 0, opacity: 1, transition: SPRING_SOFT },
                        }}
                        whileHover={{ x: 8 }}
                      >
                        <Link
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className="block text-[32px] sm:text-[40px] md:text-[52px] leading-[1.1] tracking-tight font-medium hover:text-[var(--accent)] transition-colors"
                        >
                          {link.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 md:pt-4">
                    {SECONDARY_LINKS.map((link) => (
                      <motion.div
                        key={link.href}
                        variants={{
                          hidden: { x: -20, opacity: 0 },
                          show: { x: 0, opacity: 1, transition: SPRING_SOFT },
                        }}
                        whileHover={{ x: 6 }}
                      >
                        <Link
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className="block text-[15px] md:text-[16px] text-white/65 hover:text-white transition-colors"
                        >
                          {link.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.nav>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.4 }}
                className="mt-14 pt-8 border-t border-white/15 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
              >
                <Link
                  href={user ? "/dashboard" : "/sign-up"}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white pl-6 pr-2 text-[12px] uppercase tracking-[0.14em] font-medium self-start"
                >
                  {user ? "Go to dashboard" : "Get started"}
                  <span className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>

                {/* Always one tap away, from every page, signed in or not. */}
                <Link
                  href="/crisis"
                  onClick={() => setOpen(false)}
                  className="text-[13px] text-white/65 hover:text-white underline underline-offset-4 decoration-white/40"
                >
                  Need urgent help right now?
                </Link>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
