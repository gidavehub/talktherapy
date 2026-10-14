"use client";

import { Skeleton } from "@/components/ui/Feedback";
import type { Category, Cell, LiveStats } from "@/lib/adminStats";
import { cellText, clockText, isQuiet } from "./format";
import { useLiveStats } from "./useAdminStats";

/**
 * Who is here now: people on the public site, people signed in to the app,
 * and conversations with TALK under way. Asked for again every 30 seconds
 * while the page is in view; the dot breathes while the figures are current
 * and stops when an update fails.
 *
 * Counts only, and any group under five is "<5" here as everywhere: at three
 * in the morning, "1 person on the provider directory" is one person.
 */

function Breakdown({ list, label }: { list: Category[]; label: string }) {
  const parts = list.filter((c) => c.suppressed || (c.value ?? 0) > 0).slice(0, 4);
  if (parts.length === 0) return null;
  return (
    <ul aria-label={label} className="mt-3 flex flex-wrap gap-1.5">
      {parts.map((c) => (
        <li
          key={c.key}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 text-[12px] text-[var(--cream)]/85"
        >
          {c.label}
          <span className="font-medium tabular-nums text-[var(--cream)]">{cellText(c)}</span>
        </li>
      ))}
    </ul>
  );
}

function Figure({
  label,
  cell,
  caption,
  breakdown,
}: {
  label: string;
  cell: Cell;
  caption: string;
  breakdown?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-white/10 pt-4 first:border-t-0 first:pt-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-[12.5px] text-[var(--on-dark-muted)]">{label}</dt>
      <dd className="mt-1.5">
        <span className="font-display block text-[34px] font-medium leading-none text-[var(--cream)] md:text-[40px]">
          {cellText(cell)}
        </span>
        <span className="mt-2 block text-[12px] leading-snug text-[var(--on-dark-muted)]">{caption}</span>
        {breakdown}
      </dd>
    </div>
  );
}

export default function LiveStrip({ seed }: { seed: LiveStats | null }) {
  const { live, failed } = useLiveStats(seed);
  const windowMin = live ? Math.round(live.windowSec / 60) : 2;
  const quiet = live ? isQuiet([live.visitorsNow, live.signedInNow, live.talkingNow]) : false;

  return (
    <section
      aria-labelledby="live-title"
      className="rounded-[28px] bg-[var(--dark)] p-5 text-[var(--cream)] shadow-[var(--shadow-floating)] md:p-7"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden className="relative flex h-2.5 w-2.5">
          {live && !failed ? (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--sage-pale)] opacity-50 motion-safe:animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
          ) : null}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live && !failed ? "bg-[var(--sage-pale)]" : "bg-white/30"}`}
          />
        </span>
        <h2 id="live-title" className="font-display text-[20px] font-medium md:text-[22px]">
          Right now
        </h2>
        <p className="text-[12.5px] text-[var(--on-dark-muted)]">
          {live
            ? `Seen in the last ${windowMin} minutes. ${failed ? `Could not update — as of ${clockText(live.at)}.` : `Updated ${clockText(live.at)}.`}`
            : failed
              ? "Who is here now could not be loaded. It will try again in a moment."
              : "Looking…"}
        </p>
      </div>

      {live ? (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            <Figure
              label="On the site"
              cell={live.visitorsNow}
              caption="Open tabs on the public pages"
              breakdown={<Breakdown list={live.visitorsByPage} label="Pages open now" />}
            />
            <Figure
              label="Signed in"
              cell={live.signedInNow}
              caption="People using the app"
              breakdown={<Breakdown list={live.signedInByArea} label="Where in the app" />}
            />
            <Figure label="With TALK" cell={live.talkingNow} caption="Conversations under way" />
          </dl>
          {quiet ? (
            <p className="mt-5 text-[13px] text-[var(--on-dark-muted)]">Quiet for the moment. Nobody is here right now.</p>
          ) : null}
        </>
      ) : (
        <div role="status" aria-label="Loading who is here now" className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-20 !bg-white/10" rounded="rounded-full" />
              <Skeleton className="mt-3 h-9 w-16 !bg-white/10" rounded="rounded-xl" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
