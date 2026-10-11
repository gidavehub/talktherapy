"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import { signOutToHome } from "../../lib/signOutFlow";
import { voice } from "../../lib/audio/lines";
import { Avatar } from "./Feedback";
import Logo from "../Logo";

/**
 * Application chrome for every signed-in surface.
 *
 * Desktop: a fixed dark rail, echoing the Footer and ConsultationBanner so the
 * product reads as the same brand as the marketing site.
 * Mobile: a slim top bar plus a bottom tab bar — thumb-reachable, which matters
 * because phone is the default device for this audience, not the exception.
 *
 * Nav is injected rather than hardcoded so patient / provider / admin / org
 * all share one shell with four different rails.
 *
 * Messages is laid out like WhatsApp, edge to edge, and brings its own panes
 * (ChatsSplit). On a phone an open conversation IS the screen: its header is
 * the top bar — with the menu button in it, through useOpenMenu — and its
 * composer is the bottom bar. Neither of this shell's bars is drawn over it.
 *
 * The top bar is pinned to the top of every other screen. A screen can put
 * its own things in it with <PageBar> — the search on "Providers for you",
 * the way back on booking — and then the logo makes room for them. On a
 * phone the menu button is always at its right; on a computer, where the
 * rail is the menu, the bar is only drawn when a screen has something for it.
 */

/** Opens the full menu on a phone — for a screen that draws its own top bar. */
const OpenMenu = createContext<() => void>(() => {});
export function useOpenMenu() {
  return useContext(OpenMenu);
}

/** Where a screen's own top-bar content goes (PageBar). */
const PageBarSlot = createContext<{ slot: HTMLElement | null; register: () => () => void }>({
  slot: null,
  register: () => () => {},
});

/**
 * This screen's own top bar: whatever it needs at the top while it scrolls —
 * a search box, a way back, a title. Rendered into the shell's pinned bar.
 */
export function PageBar({ children }: { children: React.ReactNode }) {
  const { slot, register } = useContext(PageBarSlot);
  useEffect(() => register(), [register]);
  return slot ? createPortal(children, slot) : null;
}

function inMessages(pathname: string) {
  return pathname === "/chats" || pathname.startsWith("/chats/");
}

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
        onClick={() => {
          // Into Talk: unlock her voice inside this tap, so she can speak
          // the moment the screen opens.
          if (item.href.startsWith("/talk")) voice.unlock();
          onNavigate?.();
        }}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-full h-11 px-4 text-[13px] tracking-wide transition-colors ${
          active
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--cream)]/70 hover:text-[var(--cream)] hover:bg-white/5"
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
  const router = useRouter();
  const { user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // The pinned bar's slot, and how many screens have put something in it.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [bars, setBars] = useState(0);
  const register = useCallback(() => {
    setBars((n) => n + 1);
    return () => setBars((n) => n - 1);
  }, []);
  const hasBar = bars > 0;

  const primary = nav.filter((item) => item.primary).slice(0, 5);
  const messages = inMessages(pathname);
  // One conversation open: it draws both bars itself.
  const conversation = pathname.startsWith("/chats/");
  const displayName = profile?.displayName ?? user?.displayName ?? user?.email ?? "You";

  const rail = (
    <>
      <Link href="/" aria-label="TALK — home">
        <Logo height={40} light />
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
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-3">
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
          onClick={() => void signOutToHome(router)}
          className="mt-2 w-full h-10 rounded-full text-[13px] text-[var(--cream)]/60 hover:text-[var(--cream)] hover:bg-white/5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <OpenMenu.Provider value={() => setMenuOpen(true)}>
    <PageBarSlot.Provider value={{ slot, register }}>
    <div className="min-h-screen bg-[var(--background)]">
      {/* Desktop rail */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[264px] bg-[var(--dark)] px-6 py-8 flex-col z-30">
        {rail}
      </aside>

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
              className="absolute inset-0 bg-[var(--dark)]/50"
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

      {/* Content — Messages edge to edge, everything else in a column */}
      <div className="md:pl-[264px]">
        {/* The pinned top bar. On a phone: the screen's own bar (or the
            logo) and the menu. On a computer: only when a screen has one. */}
        {conversation ? null : (
          <header
            className={`sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/92 backdrop-blur-md ${
              hasBar ? "" : "md:hidden"
            }`}
          >
            <div
              className={`mx-auto flex h-16 items-center gap-3 px-4 sm:px-6 md:px-10 ${
                messages ? "" : wide ? "max-w-[1400px]" : "max-w-[1100px]"
              }`}
            >
              {hasBar ? null : (
                <Link href="/" aria-label="TALK — home" className="md:hidden">
                  <Logo height={32} />
                </Link>
              )}
              <div ref={setSlot} className={hasBar ? "flex min-w-0 flex-1 items-center gap-3" : "hidden"} />
              {hasBar ? null : <div className="flex-1" />}
              <div className="flex shrink-0 items-center gap-2 md:hidden">
                {actions}
                <motion.button
                  type="button"
                  aria-label="Menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAP}
                  className="h-10 w-10 rounded-full border-[1.5px] border-[var(--dark)]/70 text-[var(--foreground)] flex items-center justify-center"
                >
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
                    <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
                    <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </header>
        )}

      {messages ? (
        children
      ) : (
        <div
          className={`px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-28 md:pb-16 mx-auto ${
            wide ? "max-w-[1400px]" : "max-w-[1100px]"
          }`}
        >
          {eyebrow || title ? (
            <div className="flex items-start justify-between gap-4 mb-8 md:mb-10">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="eyebrow">
                    {eyebrow}
                  </p>
                ) : null}
                {title ? (
                  <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={SPRING_SOFT}
                    className={`font-display text-[30px] md:text-[40px] leading-[1.08] font-medium ${
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
      )}
      </div>

      {/* Mobile bottom bar */}
      {conversation ? null : (
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface)] border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (item.href.startsWith("/talk")) voice.unlock();
                }}
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
                  className={`relative w-5 h-5 flex items-center justify-center ${
                    active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  {item.icon}
                  {item.badge ? (
                    <motion.span
                      key={item.badge}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING_SNAP}
                      aria-label={`${item.badge} unread`}
                      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-medium leading-none text-white ring-2 ring-white tabular-nums"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </motion.span>
                  ) : null}
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
      )}
    </div>
    </PageBarSlot.Provider>
    </OpenMenu.Provider>
  );
}
