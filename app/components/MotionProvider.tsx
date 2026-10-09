"use client";

import { MotionConfig } from "motion/react";

/**
 * Every animation in the product respects the person's own setting for
 * reduced motion.
 *
 * Before this, only the voice blob checked `prefers-reduced-motion`. Every
 * entrance, hover lift, stagger and spring elsewhere ignored it — and some of
 * the people who turn that setting on do it because movement makes them
 * physically unwell, which is not a thing a mental-health product should do to
 * anybody.
 *
 * `reducedMotion="user"` makes `motion` skip transform and layout animations
 * when the OS asks for it, while keeping opacity fades: the interface still
 * shows that something changed, it just stops moving things around.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
