"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";
import { IconClose } from "./icons";

/**
 * Drawer: the detail panel beside a list.
 *
 * Opening a payment, a provider or a session from a table should keep the
 * table in view, so on a computer the detail slides in from the right over
 * it. On a phone there is no "beside", and it rises from the bottom as a
 * sheet instead, like Modal does.
 *
 * Portalled into document.body for the same reason as Modal: a fixed panel
 * inside any transformed ancestor is positioned and clipped by that ancestor.
 */

const DESKTOP = "(min-width: 768px)";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Which way the panel travels: sideways on a computer, upwards on a phone. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** True once on the client — the portal needs a document to render into. */
function useHasDocument(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    // Restoring what was there, not "", so a drawer and a dialog opened from
    // it unlock in the right order.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * Keeps Tab inside the panel. Without it, tabbing past the last field walks
 * into the page underneath, which is covered and cannot be seen.
 */
function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const panel = event.currentTarget;
  // React bubbles key presses up through portals, so Tab inside a dialog
  // opened from the drawer arrives here too. That dialog keeps its own focus.
  if (!(event.target instanceof Node) || !panel.contains(event.target)) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = "520px",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling body: the drawer's actions. */
  footer?: React.ReactNode;
  /** The panel's width on a computer, as any CSS length. */
  width?: string;
  className?: string;
}) {
  useScrollLock(open);
  const hasDocument = useHasDocument();
  const desktop = useIsDesktop();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus goes into the panel when it opens and back to whatever opened it
  // when it closes — usually the row that was clicked — so a keyboard user
  // carries on down the list from where they were.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (before && document.contains(before)) before.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      // A menu or a picker inside the drawer that already used the Escape
      // to close itself has said so; the drawer stays where it is.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A dialog opened from inside the drawer ("Remove this provider?")
      // takes the Escape for itself; the drawer stays open behind it.
      if (event.target instanceof Element) {
        const dialog = event.target.closest("[aria-modal='true']");
        if (dialog && dialog !== panelRef.current) return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!hasDocument) return null;

  const away = desktop ? { x: "100%", y: 0 } : { x: 0, y: "100%" };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-[var(--dark)]/45 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={trapTab}
            initial={away}
            animate={{ x: 0, y: 0 }}
            exit={away}
            transition={SPRING_SOFT}
            style={{ "--drawer-width": width } as React.CSSProperties}
            // dvh rather than vh: on a phone vh is the height with the
            // browser bars hidden, so a tall sheet would push its own
            // close button up under them.
            className={`absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-[var(--surface)] shadow-[var(--shadow-floating)] outline-none
              md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[var(--drawer-width)] md:max-w-[calc(100vw-3rem)] md:rounded-t-none md:rounded-l-[28px] ${className}`}
          >
            {/* Drag affordance: only meaningful as a sheet. */}
            <div aria-hidden className="md:hidden mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[var(--foreground)]/15" />

            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-4 pb-5 md:px-8 md:pt-8">
              <div className="min-w-0">
                {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
                <h2
                  id={titleId}
                  className={`font-display text-[22px] font-medium leading-[1.1] md:text-[26px] ${eyebrow ? "mt-2" : ""}`}
                >
                  {title}
                </h2>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close"
                whileHover={{ scale: 1.06, rotate: -8 }}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SNAP}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] transition-colors hover:bg-[var(--dark)]/5"
              >
                <IconClose size={14} strokeWidth={2.2} />
              </motion.button>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 md:px-8 ${
                footer ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-8"
              }`}
            >
              {children}
            </div>

            {footer ? (
              <div className="shrink-0 border-t border-[var(--border)] px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8 md:pb-6">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
