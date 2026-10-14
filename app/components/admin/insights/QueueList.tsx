"use client";

import Link from "next/link";
import { IconArrowRight } from "@/components/ui/icons";
import type { QueueItem } from "@/lib/adminStats";

/**
 * What is waiting on a person right now, each linking to the screen where it
 * is done. Exact counts, never withheld: these are pieces of work, and staff
 * see every one of them by name on the screen the link opens.
 */
export default function QueueList({ queues }: { queues: QueueItem[] }) {
  const waiting = queues.reduce((sum, q) => sum + q.count, 0);
  return (
    <section
      aria-labelledby="queues-title"
      className="rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="queues-title" className="font-display text-[20px] font-medium md:text-[22px]">
          Waiting for a person
        </h2>
        <p className="text-[13px] text-[var(--muted)]">
          {waiting === 0 ? "Nothing is waiting. All clear." : `${waiting.toLocaleString("en-GB")} waiting, as of now.`}
        </p>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {queues.map((q) => (
          <li key={q.key}>
            <Link
              href={q.href}
              className="group flex h-full min-h-[64px] items-center gap-3 rounded-[18px] bg-[var(--surface-2)] px-4 py-3 outline-none transition-colors hover:bg-[var(--sand)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span
                className={`font-display min-w-10 shrink-0 text-[26px] font-medium leading-none ${
                  q.count ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"
                }`}
              >
                {q.count.toLocaleString("en-GB")}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--foreground)]">{q.label}</span>
              <span
                aria-hidden
                className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5"
              >
                <IconArrowRight />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
