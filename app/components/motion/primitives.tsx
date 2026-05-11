"use client";

import { motion, useScroll, useTransform, type MotionProps, type Transition } from "motion/react";
import { type ComponentPropsWithoutRef, type ReactNode, type ElementType, useRef } from "react";

/**
 * Motion design rules for this app:
 *  - Slides, not fades. Pieces move from elsewhere into place.
 *  - Spring physics for entrances (quick-to-slow damping).
 *  - Tween eases for hovers/taps.
 *  - Stagger sibling reveals — the layout assembles like a story, not a flash.
 *  - Tiny rotational drift on bold pieces for life.
 */

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 22,
  mass: 0.9,
};

export const SPRING_SNAP: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
  mass: 0.6,
};

export const EASE_OUT: Transition = {
  duration: 0.85,
  ease: [0.22, 1, 0.36, 1],
};

type Direction = "up" | "down" | "left" | "right";

const offsets: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 56 },
  down: { x: 0, y: -56 },
  left: { x: 56, y: 0 },
  right: { x: -56, y: 0 },
};

type SlideInProps<T extends ElementType> = {
  as?: T;
  from?: Direction;
  delay?: number;
  amount?: number; // 0..1 — how much must be in view before triggering
  once?: boolean;
  distance?: number;
  rotate?: number;
  className?: string;
  children?: ReactNode;
  transition?: Transition;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children">;

export function SlideIn<T extends ElementType = "div">({
  as,
  from = "up",
  delay = 0,
  amount = 0.25,
  once = true,
  distance,
  rotate = 0,
  className,
  children,
  transition,
  ...rest
}: SlideInProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const MotionTag = motion(Tag);
  const base = offsets[from];
  const x = distance != null ? Math.sign(base.x) * distance : base.x;
  const y = distance != null ? Math.sign(base.y) * distance : base.y;

  return (
    <MotionTag
      initial={{ x, y, rotate: rotate, opacity: 0 }}
      whileInView={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      viewport={{ once, amount }}
      transition={{ ...SPRING_SOFT, delay, ...(transition ?? {}) }}
      className={className}
      {...(rest as MotionProps)}
    >
      {children}
    </MotionTag>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  step?: number;
  amount?: number;
  once?: boolean;
};

/**
 * Stagger direct children. Children should render their own initial state via
 * `<StaggerItem>` — that way each gets its own slide direction.
 */
export function Stagger({
  children,
  className,
  delay = 0,
  step = 0.08,
  amount = 0.2,
  once = true,
}: StaggerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: step, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = {
  from?: Direction;
  distance?: number;
  className?: string;
  children: ReactNode;
  transition?: Transition;
};

export function StaggerItem({
  from = "up",
  distance,
  className,
  children,
  transition,
}: StaggerItemProps) {
  const base = offsets[from];
  const x = distance != null ? Math.sign(base.x) * distance : base.x;
  const y = distance != null ? Math.sign(base.y) * distance : base.y;
  return (
    <motion.div
      variants={{
        hidden: { x, y, opacity: 0 },
        show: { x: 0, y: 0, opacity: 1, transition: transition ?? SPRING_SOFT },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Translates its content as the page scrolls. The translation runs from
 * `-distance` at the top of the viewport to `+distance` at the bottom.
 * Use sparingly — feels great on big stamps and accent visuals.
 */
export function Parallax({
  children,
  distance = 80,
  className,
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-distance, distance]);

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Subtle scroll-linked rise — content drifts up slowly as you scroll past.
 */
export function RiseOnScroll({
  children,
  amount = 40,
  className,
}: {
  children: ReactNode;
  amount?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

export { motion };
