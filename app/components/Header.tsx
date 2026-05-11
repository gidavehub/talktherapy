"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";

export default function Header() {
  return (
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
          <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight inline-block">
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
              href="/sign-in"
              className="h-11 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-transparent px-5 text-[13px] font-medium tracking-wide uppercase hover:bg-black/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
              Sign In
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </motion.header>
  );
}
