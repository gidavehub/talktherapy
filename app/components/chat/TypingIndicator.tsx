"use client";

import { motion } from "motion/react";

/**
 * Three dots in an incoming-shaped bubble.
 *
 * Sits in the thread where the next message will appear, not in the header, so
 * it reads as "something is coming" rather than as a status line — which
 * matters for someone who cannot read the word "typing".
 */
export default function TypingIndicator({ name }: { name?: string | null }) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="flex justify-start"
    >
      <div
        role="status"
        aria-label={name ? `${name} is typing` : "Typing"}
        className="rounded-[22px] rounded-bl-[8px] bg-white px-4 py-3.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
      >
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                // Staggered so the three read as a wave rather than a blink.
                delay: index * 0.16,
                ease: "easeInOut",
              }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}
