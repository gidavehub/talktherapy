"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * Tabs.
 *
 * The active indicator is a shared `layoutId`, so motion animates it between
 * tabs for free rather than us hand-rolling a transform. Two flavours:
 * `Tabs` for local state, `NavTabs` for route-driven sub-navigation (settings,
 * admin sections), which reads `usePathname` instead.
 */

const BASE =
  "relative h-10 px-4 rounded-full text-[12px] uppercase tracking-[0.14em] font-medium transition-colors whitespace-nowrap";

export type TabItem<T extends string = string> = {
  id: T;
  label: string;
  /** Optional count shown after the label, e.g. a pending queue size. */
  badge?: number;
};

export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    // no-scrollbar keeps the horizontal overflow usable on a phone without a
    // visible bar cutting into the pill height.
    <div
      role="tablist"
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`${BASE} ${active ? "text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            {active ? (
              <motion.span
                layoutId="tab-indicator"
                transition={SPRING_SNAP}
                className="absolute inset-0 rounded-full bg-[var(--dark)]"
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-2">
              {item.label}
              {item.badge ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${
                    active ? "bg-white/20" : "bg-[var(--accent)] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NavTabs({
  items,
  className = "",
}: {
  items: { href: string; label: string; badge?: number }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`}
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${BASE} inline-flex items-center ${
              active ? "text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="nav-tab-indicator"
                transition={SPRING_SNAP}
                className="absolute inset-0 rounded-full bg-[var(--dark)]"
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-2">
              {item.label}
              {item.badge ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${
                    active ? "bg-white/20" : "bg-[var(--accent)] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
