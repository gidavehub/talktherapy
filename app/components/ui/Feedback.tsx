"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/**
 * Status, identity and empty-state primitives.
 *
 * Badges reuse the Pricing "Most chosen" pill; the check glyph is the same
 * `strokeWidth="2.6"` mark used in the pricing feature lists.
 */

type BadgeTone = "accent" | "neutral" | "positive" | "warning" | "dark";

const BADGE_TONES: Record<BadgeTone, string> = {
  accent: "bg-[var(--accent)] text-white",
  neutral: "bg-black/5 text-[var(--muted)]",
  positive: "bg-emerald-600/10 text-emerald-700",
  warning: "bg-amber-500/15 text-amber-700",
  dark: "bg-[var(--dark)] text-white",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-3 text-[10px] uppercase tracking-[0.18em] ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Larger, lower-contrast label for filters and metadata. */
export function Pill({
  children,
  active = false,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const shell = `inline-flex h-9 items-center gap-2 rounded-full px-4 text-[12px] tracking-wide border transition-colors ${
    active
      ? "bg-[var(--dark)] text-white border-[var(--dark)]"
      : "border-[var(--border)] hover:bg-black/5"
  } ${className}`;

  if (!onClick) return <span className={shell}>{children}</span>;

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={shell}>
      {children}
    </button>
  );
}

export function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  // Initials fallback keeps the directory looking intentional before anyone
  // has uploaded a photo.
  const initials = (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? "Profile photo"}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`rounded-full bg-[var(--dark)] text-white flex items-center justify-center shrink-0 font-medium ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </span>
  );
}

export function Spinner({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className={`rounded-[28px] border border-dashed border-[var(--border)] px-6 py-12 md:py-16 text-center ${className}`}
    >
      {icon ? (
        <span className="mx-auto mb-5 h-12 w-12 rounded-full bg-[var(--dark)] text-white flex items-center justify-center">
          {icon}
        </span>
      ) : null}
      <p className="text-[16px] md:text-[17px] font-medium leading-tight">{title}</p>
      {description ? (
        <p className="mt-3 text-[13px] md:text-[14px] text-[var(--muted)] leading-relaxed max-w-[420px] mx-auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-8 flex justify-center">{action}</div> : null}
    </motion.div>
  );
}

/** Bulleted feature line with the accent dot from TherapySession. */
export function BulletItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={`flex items-start gap-4 ${className}`}>
      <span
        aria-hidden
        className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)] shrink-0"
      />
      <span className="text-[13px] md:text-[14px] text-[var(--muted)] leading-relaxed">
        {children}
      </span>
    </li>
  );
}

/** Check-marked list item, matching the Pricing tier bullets. */
export function CheckItem({
  children,
  onDark = false,
  className = "",
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <li className={`flex items-start gap-3 ${className}`}>
      <span
        aria-hidden
        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
          onDark
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--background)] text-[var(--accent)]"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span className={`text-[13px] md:text-[14px] leading-relaxed ${onDark ? "text-white/90" : ""}`}>
        {children}
      </span>
    </li>
  );
}

/**
 * Inline alert. `tone="crisis"` is reserved for the safety pathway and is
 * deliberately the loudest thing on any screen it appears on.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: "info" | "warning" | "crisis" | "success";
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-black/[.03] border-[var(--border)]",
    warning: "bg-amber-500/10 border-amber-500/30",
    crisis: "bg-[var(--accent)] text-white border-[var(--accent)]",
    success: "bg-emerald-600/10 border-emerald-600/25",
  } as const;

  return (
    <div
      role={tone === "crisis" ? "alert" : "status"}
      className={`rounded-2xl border px-5 py-4 ${tones[tone]} ${className}`}
    >
      {title ? (
        <p className="text-[13px] font-medium leading-snug">{title}</p>
      ) : null}
      <div
        className={`text-[13px] leading-relaxed ${title ? "mt-1.5" : ""} ${
          tone === "crisis" ? "text-white/90" : "text-[var(--muted)]"
        }`}
      >
        {children}
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
