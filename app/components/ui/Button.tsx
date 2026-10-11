"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { useStartHref } from "../StartLink";
import { useAuth } from "../AuthProvider";
import { beginDoorway, isTalk } from "../../lib/talkDoorway";

/**
 * The button vocabulary, one place for every screen.
 *
 * The redesign's buttons are plain pills with a sentence-case label —
 * "Begin with TALK" in solid terracotta, "View profile" outlined in brown. If
 * you find yourself hand-rolling a button elsewhere, add a variant here
 * instead — that drift is exactly what this file exists to stop.
 *
 * The trailing arrow puck is opt-in (`withArrow`).
 */

type Variant =
  | "primary" // terracotta fill — the main CTA
  | "secondary" // brown outline that fills brown on hover
  | "ghost" // subtle bordered pill
  | "dark" // solid brown
  | "sage" // solid sage green
  | "onDark" // outlined, for use on a dark surface
  | "danger"; // destructive

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { base: string; padded: string; puck: string }> = {
  sm: { base: "h-10", padded: "px-5", puck: "h-7 w-7" },
  md: { base: "h-11", padded: "px-6", puck: "h-8 w-8" },
  lg: { base: "h-12 md:h-[52px]", padded: "px-7 md:px-8", puck: "h-9 w-9" },
};

const LABEL = "text-[14px] font-medium tracking-[0.01em]";

const VARIANTS: Record<Variant, { shell: string; puck: string }> = {
  primary: {
    shell: "bg-[var(--accent)] hover:bg-[var(--accent-deep)] text-white shadow-[var(--shadow-accent)]",
    puck: "bg-white/20",
  },
  secondary: {
    shell:
      "border-[1.5px] border-[var(--dark)] text-[var(--foreground)] bg-transparent hover:bg-[var(--dark)] hover:text-[var(--cream)]",
    puck: "bg-[var(--accent)] text-white",
  },
  ghost: {
    shell: "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--sand)]",
    puck: "bg-[var(--dark)] text-white",
  },
  dark: {
    shell: "bg-[var(--dark)] text-[var(--cream)] hover:bg-[var(--dark-soft)]",
    puck: "bg-white/15",
  },
  sage: {
    shell: "bg-[var(--sage)] text-white hover:bg-[var(--sage-deep)]",
    puck: "bg-white/15",
  },
  onDark: {
    shell: "border-[1.5px] border-[var(--cream)]/50 text-[var(--cream)] hover:bg-[var(--cream)]/10",
    puck: "bg-[var(--accent)] text-white",
  },
  danger: {
    shell: "border-[1.5px] border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white",
    puck: "bg-[var(--danger)] text-white",
  },
};

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export type ButtonProps = {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  /** Renders a Link instead of a button. */
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  withArrow?: boolean;
  fullWidth?: boolean;
  className?: string;
  "aria-label"?: string;
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  href: rawHref,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  withArrow,
  fullWidth = false,
  className = "",
  ...rest
}: ButtonProps) {
  // "Create your account" must never ask a signed-in person to sign up
  // again: a plain /sign-up link resolves to where they actually belong.
  const startHref = useStartHref();
  const { user, ready } = useAuth();
  const href = rawHref === "/sign-up" ? startHref : rawHref;
  const sizing = SIZES[size];
  const styles = VARIANTS[variant];

  // The arrow puck is opt-in: the redesign's pills are plain.
  const showArrow = withArrow ?? false;

  const isDisabled = disabled || loading;

  // With a puck the right padding shrinks to pr-2 so the circle sits flush
  // inside the pill, which is what makes the shape read correctly.
  const padding = showArrow
    ? `${sizing.padded} pr-2`
    : `${sizing.padded} justify-center`;

  const shell = [
    "inline-flex items-center gap-3 rounded-full transition-colors",
    sizing.base,
    padding,
    LABEL,
    styles.shell,
    fullWidth ? "w-full" : "",
    isDisabled ? "opacity-60 pointer-events-none" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span className={showArrow ? "" : "text-center"}>
        {loading ? "Please wait…" : children}
      </span>
      {showArrow ? (
        <motion.span
          whileHover={{ x: 4 }}
          transition={SPRING_SNAP}
          className={`${sizing.puck} ${styles.puck} rounded-full flex items-center justify-center shrink-0`}
        >
          <Arrow />
        </motion.span>
      ) : null}
    </>
  );

  const motionProps = {
    whileHover: isDisabled ? undefined : { scale: 1.02 },
    whileTap: isDisabled ? undefined : { scale: 0.97 },
    transition: SPRING_SNAP,
    className: fullWidth ? "w-full" : "inline-block",
  };

  if (href && !isDisabled) {
    return (
      <motion.div {...motionProps}>
        <Link
          href={href}
          className={shell}
          // A button that leads to Talk starts her speaking inside the tap.
          onClick={isTalk(href) && ready ? (e) => beginDoorway(Boolean(user), e) : undefined}
          {...rest}
        >
          {inner}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div {...motionProps}>
      <button
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        className={shell}
        {...rest}
      >
        {inner}
      </button>
    </motion.div>
  );
}
