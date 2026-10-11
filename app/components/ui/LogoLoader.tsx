"use client";

import { motion } from "motion/react";

/**
 * The loading screen's mark: the Talk Therapy logo itself — TALK, its dot,
 * THERAPY — with the dot breathing, and a ring leaving it now and then like a
 * voice. The same mark as the tab icon (public/tablogo.png), so waiting looks
 * like Talk Therapy and nothing else.
 */
export default function LogoLoader({ label, size = 34 }: { label?: string; size?: number }) {
  return (
    <div role="status" aria-label={label ?? "Loading"} className="flex flex-col items-center gap-7">
      <motion.div
        aria-hidden
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="font-medium leading-[0.86] tracking-tight text-[var(--foreground)]"
        style={{ fontSize: size }}
      >
        <div className="flex items-center">
          <span>TALK</span>
          <span className="relative ml-[0.1em] inline-flex h-[0.52em] w-[0.52em] items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-[var(--foreground)]"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 2.4], opacity: [0.45, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", repeatDelay: 0.2 }}
            />
            <motion.span
              className="h-full w-full rounded-full bg-[var(--foreground)]"
              animate={{ scale: [1, 0.62, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
        </div>
        <span className="block">THERAPY</span>
      </motion.div>
      {label ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
        >
          {label}
        </motion.p>
      ) : null}
    </div>
  );
}
