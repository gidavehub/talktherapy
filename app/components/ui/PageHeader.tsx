"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import Breadcrumbs, { type BreadcrumbItem } from "./Breadcrumbs";
import { Eyebrow, Lede, RevealHeading } from "./Typography";

/**
 * The top of every admin and provider screen: the way back, the eyebrow,
 * the serif heading with its last line in italic sage, a line of lede, and
 * the screen's actions.
 *
 * The actions sit to the right on a computer and wrap underneath on a phone,
 * where there is no right to sit on. `children` goes below everything —
 * tabs, filters, a search — so it belongs to the header rather than floating
 * between it and the content.
 */

export default function PageHeader({
  eyebrow,
  lines,
  lede,
  actions,
  breadcrumbs,
  children,
  className = "",
}: {
  eyebrow?: string;
  /** One string per line. With two or more, the last is the italic sage. */
  lines: string[];
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-8 md:mb-10 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} className="mb-5" /> : null}

      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0">
          {eyebrow ? (
            <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
              <Eyebrow>{eyebrow}</Eyebrow>
            </motion.div>
          ) : null}
          <RevealHeading lines={lines} as="h1" size="panel" className={eyebrow ? "mt-3" : ""} />
          {lede ? <Lede className="mt-3 max-w-[560px]">{lede}</Lede> : null}
        </div>

        {actions ? (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.2 }}
            className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end"
          >
            {actions}
          </motion.div>
        ) : null}
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}
