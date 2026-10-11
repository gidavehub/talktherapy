"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/** Fades a block up into place as it scrolls into view. */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  y = 24,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      initial={{ y, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ ...SPRING_SOFT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
