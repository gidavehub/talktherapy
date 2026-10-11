"use client";

import Image from "next/image";
import { motion } from "motion/react";

/**
 * The loading screen's mark: the TALK logo itself, with the terracotta dot
 * inside its arch breathing, and a ring leaving it now and then like a voice.
 *
 * The dot is drawn over the logo's own at the same place (measured from
 * public/brand/logo.png: centre 37.1% across, 49.6% down, 6.9% of the width).
 */
export default function LogoLoader({ label, size = 76 }: { label?: string; size?: number }) {
  const width = Math.round((size * 507) / 211);
  const dot = width * 0.069;
  return (
    <div role="status" aria-label={label ?? "Loading"} className="flex flex-col items-center gap-6">
      <motion.div
        aria-hidden
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative"
        style={{ width, height: size }}
      >
        <Image src="/brand/logo.png" alt="" width={width} height={size} priority style={{ width, height: size }} />
        <span className="absolute" style={{ left: "37.1%", top: "49.6%", width: dot, height: dot, transform: "translate(-50%, -50%)" }}>
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", repeatDelay: 0.2 }}
          />
          <motion.span
            className="absolute inset-0 rounded-full bg-[var(--accent)]"
            animate={{ scale: [1, 0.7, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>
      {label ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-[11px] uppercase tracking-[0.3em] text-[var(--muted)]"
        >
          {label}
        </motion.p>
      ) : null}
    </div>
  );
}
