"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "../motion/primitives";

/**
 * Modal / bottom sheet.
 *
 * One component, two presentations: a centred dialog on desktop and a bottom
 * sheet on mobile, because a centred dialog on a 375px screen is unusable once
 * the keyboard opens. Which one you get is driven by `variant`, defaulting to
 * the responsive pairing.
 */

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "responsive",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "sheet" always slides from the bottom; "dialog" always centres. */
  variant?: "responsive" | "sheet" | "dialog";
  className?: string;
}) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const asSheet = variant === "sheet";
  const responsive = variant === "responsive";

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: asSheet || responsive ? 80 : 30, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: asSheet || responsive ? 60 : 20, opacity: 0, scale: 0.98 }}
            transition={SPRING_SOFT}
            className={`relative z-10 w-full bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)] max-h-[92vh] overflow-y-auto
              ${
                asSheet
                  ? "rounded-t-[28px] max-w-[640px]"
                  : responsive
                    ? "rounded-t-[28px] md:rounded-3xl max-w-[560px] md:max-h-[85vh]"
                    : "rounded-3xl max-w-[560px] mx-4"
              }
              p-6 sm:p-8 ${className}`}
          >
            {/* Drag affordance — only meaningful in the sheet presentation. */}
            {asSheet || responsive ? (
              <div
                aria-hidden
                className="md:hidden mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--foreground)]/15"
              />
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title ? (
                  <h2 className="text-[22px] md:text-[26px] leading-[1.1] tracking-tight font-medium">
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
                    {description}
                  </p>
                ) : null}
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close"
                whileHover={{ scale: 1.06, rotate: -8 }}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SNAP}
                className="h-9 w-9 shrink-0 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-black/5 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </motion.button>
            </div>

            <div className={title || description ? "mt-6" : ""}>{children}</div>

            {footer ? <div className="mt-8">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
