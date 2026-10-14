"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
 * all share one shell with four different rails. A long rail — the staff one —
 * is broken into labelled sections (NavItem.section) so it can be scanned.
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
  /**
   * The group this item belongs to. The rail labels a group above its first
   * item, so items sharing a section must sit next to each other in the list.
   */
  section?: string;
  /**
   * Lit only on this exact path, never on the pages beneath it. For a root
   * like "/admin", which every staff page starts with.
   */
  exact?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}

/**
 * The one item to light up: the closest match, not every match. On
 * "/admin/content/media" both Content and Media match by prefix, and only
 * Media is where you are. In the bottom bar, where Media is absent, the same
 * rule lights Content instead.
 */
function activeHref(pathname: string, items: NavItem[]) {
  let best: string | null = null;
  for (const item of items) {
    if (isActive(pathname, item) && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/**
 * The rail in runs of one section each, in list order. A list with no
 * sections — the patient and provider ones — comes back as a single run.
 */
function sectionsOf(items: NavItem[]) {
  const runs: { section?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else runs.push({ section: item.section, items: [item] });
  }
  return runs;
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
        // The ring is drawn inside the pill: the rail scrolls, and a scroll
        // box clips anything drawn outside it, so a browser outline on the
        // first or last link would be cut in half.
        className={`flex items-center gap-3 rounded-full h-11 px-4 text-[13px] tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--cream)]/60 ${
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
  const railActive = activeHref(pathname, nav);
  const barActive = activeHref(pathname, primary);
  const messages = inMessages(pathname);
  // One conversation open: it draws both bars itself.
  const conversation = pathname.startsWith("/chats/");
  const displayName = profile?.displayName ?? user?.displayName ?? user?.email ?? "You";
  // A count on an item the bottom bar leaves out — staff Messages — would
  // otherwise only be seen by someone who opened the menu, so the menu
  // button carries it on a phone.
  const menuBadge = nav.reduce((sum, item) => (primary.includes(item) ? sum : sum + (item.badge ?? 0)), 0);

  // The phone menu behaves like the app's other overlays: focus goes into it
  // when it opens and back to where it was when it closes, and Escape closes
  // it, so a keyboard is not left tabbing through the page underneath.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const before = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => menuRef.current?.focus());
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, [menuOpen]);

  const rail = (
    <>
      <Link href="/" aria-label="TALK — home">
        <Logo height={40} light />
      </Link>

      {/* Scrolls on its own when it outgrows the screen — the staff rail is
          three times the length of a patient one — so the account card below
          stays put. Pulled out into the padding so the hover nudge has room
          and is not clipped by the scroll box. */}
      <nav className="mt-10 -mx-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-6 [scrollbar-color:rgb(255_255_255/0.15)_transparent] [scrollbar-width:thin]">
        {/* Each section is a named group, so a screen reader announces
            "People" on the way into it; the visible label is the same word
            and is hidden from it to avoid saying it twice. */}
        {sectionsOf(nav).map((run, i) => (
          <div
            key={`${i}-${run.section ?? ""}`}
            role={run.section ? "group" : undefined}
            aria-label={run.section}
            className="flex flex-col gap-1"
          >
            {run.section ? (
              <p
                aria-hidden
                className={`px-4 pb-1 text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--cream)]/50 ${
                  i === 0 ? "" : "pt-5"
                }`}
              >
                {run.section}
              </p>
            ) : null}
            {run.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={item.href === railActive}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </div>
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
              ref={menuRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={SPRING_SOFT}
              className="absolute inset-y-0 right-0 w-[80%] max-w-[320px] bg-[var(--dark)] px-6 py-8 flex flex-col overflow-y-auto outline-none"
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
                  aria-label={menuBadge > 0 ? `Menu, ${menuBadge} unread` : "Menu"}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING_SNAP}
                  className="relative h-10 w-10 rounded-full border-[1.5px] border-[var(--dark)]/70 text-[var(--foreground)] flex items-center justify-center"
                >
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
                    <rect width="16" height="1.6" rx="0.8" fill="currentColor" />
                    <rect y="5.2" width="16" height="1.6" rx="0.8" fill="currentColor" />
                    <rect y="10.4" width="16" height="1.6" rx="0.8" fill="currentColor" />
                  </svg>
                  {menuBadge > 0 ? (
                    <motion.span
                      key={menuBadge}
                      aria-hidden
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING_SNAP}
                      className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[var(--accent)] ring-2 ring-[var(--background)]"
                    />
                  ) : null}
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
            const active = item.href === barActive;
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
