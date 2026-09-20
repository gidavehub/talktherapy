"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import { signOut } from "../../lib/auth";
import { Avatar } from "./Feedback";

/**
 * Application chrome for every signed-in surface.
 *
 * Desktop: a fixed dark rail, echoing the Footer and ConsultationBanner so the
 * product reads as the same brand as the marketing site.
 * Mobile: a slim top bar plus a bottom tab bar — thumb-reachable, which matters
 * because phone is the default device for this audience, not the exception.
 *
 * Nav is injected rather than hardcoded so patient / counsellor / admin / org
 * all share one shell with four different rails.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Shown in the bottom bar on mobile. Keep to five or fewer. */
  primary?: boolean;
  badge?: number;
};

function isActive(pathname: string, href: string) {
  // Exact match for the section root so "/journal" doesn't light up on
  // "/journal/new" *and* its parent simultaneously.
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <motion.div whileHover={{ x: 6 }} transition={SPRING_SNAP}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-full h-11 px-4 text-[13px] tracking-wide transition-colors ${
          active
            ? "bg-white/10 text-white"
            : "text-white/65 hover:text-white hover:bg-white/5"
        }`}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] text-white">
            {item.badge}
          </span>
        ) : null}
      </Link>
    </motion.div>
  );
}

export default function AppShell({
  nav,
  eyebrow,
  title,
  actions,
  children,
  /** Widens the content column for tables and calendars. */
  wide = false,
}: {
  nav: NavItem[];
  eyebrow?: string;
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const primary = nav.filter((item) => item.primary).slice(0, 5);
  const displayName = profile?.displayName ?? user?.displayName ?? user?.email ?? "You";

  const rail = (
    <>
      <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight text-white">
        <span className="block">TALK</span>
        <span className="block">THERAPY</span>
      </Link>

      <nav className="mt-10 flex flex-col gap-1">
        {nav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      </nav>

      <div className="mt-auto pt-8">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3">
          <Avatar src={profile?.photoURL ?? user?.photoURL} name={displayName} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white truncate">{displayName}</p>
            <p className="text-[11px] text-white/50 truncate capitalize">
              {profile?.role?.replace("_", " ") ?? "—"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 w-full h-10 rounded-full text-[11px] uppercase tracking-[0.18em] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Desktop rail */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[264px] bg-[var(--dark)] px-6 py-8 flex-col z-30">
        {rail}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 h-16 flex items-center justify-between">
        <Link href="/" className="leading-[0.85] text-[14px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <div className="flex items-center gap-2">
          {actions}
          <motion.button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            whileHover={{ scale: 1.06, rotate: -8 }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING_SNAP}
            className="h-10 w-10 rounded-full bg-[var(--dark)] text-white flex items-center justify-center"
          >
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
              <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
              <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
            </svg>
          </motion.button>
        </div>
      </header>

      {/* Mobile full menu — the complete nav, since the bottom bar shows five */}
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-40"
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={SPRING_SOFT}
              className="absolute inset-y-0 right-0 w-[80%] max-w-[320px] bg-[var(--dark)] px-6 py-8 flex flex-col overflow-y-auto"
            >
              {rail}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Content */}
      <div className="md:pl-[264px]">
        <div
          className={`px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-28 md:pb-16 mx-auto ${
            wide ? "max-w-[1400px]" : "max-w-[1100px]"
          }`}
        >
          {eyebrow || title ? (
            <div className="flex items-start justify-between gap-4 mb-8 md:mb-10">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    {eyebrow}
                  </p>
                ) : null}
                {title ? (
                  <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={SPRING_SOFT}
                    className={`text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium ${
                      eyebrow ? "mt-2" : ""
                    }`}
                  >
                    {title}
                  </motion.h1>
                ) : null}
              </div>
              <div className="hidden md:flex items-center gap-2 shrink-0">{actions}</div>
            </div>
          ) : null}

          {children}
        </div>
      </div>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5"
              >
                {active ? (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    transition={SPRING_SNAP}
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--accent)]"
                  />
                ) : null}
                <span
                  className={`w-5 h-5 flex items-center justify-center ${
                    active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[10px] tracking-wide ${
                    active ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
