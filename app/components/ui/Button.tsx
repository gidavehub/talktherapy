"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { useStartHref } from "../StartLink";

/**
 * The button vocabulary from the landing page, factored out.
 *
 * Class strings are lifted verbatim from Hero / ConsultationBanner / Pricing /
 * AuthCard rather than re-derived, so a new screen is pixel-identical to the
 * marketing site. If you find yourself hand-rolling a button elsewhere, add a
 * variant here instead — that drift is exactly what this file exists to stop.
 *
 * The trailing "puck" (the circular arrow that slides on hover) is the
 * signature detail; `withArrow` is on by default for primary and secondary.
 */

type Variant =
  | "primary" // accent fill, white text — the main CTA
  | "secondary" // hairline outline that inverts to dark on hover
  | "ghost" // subtle bordered pill, used in headers
  | "dark" // solid near-black
  | "onDark" // outlined, for use on a dark surface
  | "danger"; // destructive, reuses accent at low emphasis

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { base: string; padded: string; puck: string }> = {
  sm: { base: "h-11", padded: "px-5", puck: "h-8 w-8" },
  md: { base: "h-12", padded: "px-6", puck: "h-9 w-9" },
  lg: { base: "h-12 md:h-14", padded: "px-6 md:px-8", puck: "h-10 w-10 md:h-11 md:w-11" },
};

const LABEL = "text-[12px] uppercase tracking-[0.14em] font-medium";

const VARIANTS: Record<Variant, { shell: string; puck: string }> = {
  primary: {
    shell:
      "bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)]",
    puck: "bg-white/15",
  },
  secondary: {
    shell:
      "border border-[var(--foreground)] hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)]",
    puck: "bg-[var(--accent)] text-white",
  },
  ghost: {
    shell: "border border-[var(--border)] bg-transparent hover:bg-black/5",
    puck: "bg-[var(--dark)] text-white",
  },
  dark: {
    shell: "bg-[var(--dark)] text-white hover:bg-[var(--dark-soft)]",
    puck: "bg-white/15",
  },
  onDark: {
    shell: "border border-white/20 text-white hover:bg-white/10",
    puck: "bg-[var(--accent)] text-white",
  },
  danger: {
    shell:
      "border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white",
    puck: "bg-[var(--accent)] text-white",
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
  const href = rawHref === "/sign-up" ? startHref : rawHref;
  const sizing = SIZES[size];
  const styles = VARIANTS[variant];

  // The puck is the default for the two CTA variants and opt-in elsewhere,
  // matching how the marketing page uses it.
  const showArrow =
    withArrow ?? (variant === "primary" || variant === "secondary");

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
    whileHover: isDisabled ? undefined : { scale: 1.04 },
    whileTap: isDisabled ? undefined : { scale: 0.97 },
    transition: SPRING_SNAP,
    className: fullWidth ? "w-full" : "inline-block",
  };

  if (href && !isDisabled) {
    return (
      <motion.div {...motionProps}>
        <Link href={href} className={shell} {...rest}>
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
