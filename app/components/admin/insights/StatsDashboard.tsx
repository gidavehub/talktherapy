"use client";

import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import type { AdminStats } from "@/lib/adminStats";
import RangeFilter, { MonthFilter } from "./RangeFilter";
import { StatsError } from "./cards";
import { clockText, rangeText } from "./format";
import { useAdminStats, type StatsScope } from "./useAdminStats";

/**
 * The frame of a staff dashboard: the heading, the date filter, the line
 * saying which days the figures are for and when they were worked out, and
 * the three states — a skeleton in the page's own shape on the first load,
 * the error with a way to try again, and the figures.
 *
 * When the dates change, the figures on screen stay, dimmed, until the new
 * ones arrive, so the page never flashes back to its skeleton.
 *
 * `scope` "month" is the wellbeing page: one whole month at a time, chosen
 * from a list, in place of free dates.
 */
export default function StatsDashboard({
  scope = "range",
  eyebrow,
  lines,
  lede,
  barTitle,
  actions,
  lead,
  skeleton,
  children,
}: {
  scope?: StatsScope;
  eyebrow: string;
  lines: string[];
  lede: string;
  /** The short name for the phone's top bar. */
  barTitle: string;
  /** Header actions, given the figures once they are here. */
  actions?: (stats: AdminStats | null) => React.ReactNode;
  /** Shown above the figures in every state, loading and failed included. */
  lead?: (stats: AdminStats | null) => React.ReactNode;
  /** The page's layout with every card loading. */
  skeleton: React.ReactNode;
  children: (stats: AdminStats) => React.ReactNode;
}) {
  const { range, setRange, month, setMonth, data, error, loading, refreshing, retry } = useAdminStats(scope);

  return (
    <div>
      <PageHeader eyebrow={eyebrow} lines={lines} lede={lede} actions={actions?.(data)}>
        {scope === "month" ? (
          <MonthFilter value={month} onChange={setMonth} title={barTitle} />
        ) : (
          <RangeFilter value={range} onChange={setRange} title={barTitle} />
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)] md:mt-4" aria-live="polite">
          {data
            ? `${rangeText(data.range)}, in UTC days. Worked out at ${clockText(data.generatedAt)}${refreshing ? " — newer figures on their way." : "."}`
            : loading
              ? "Working out the figures…"
              : null}
        </p>
      </PageHeader>

      {data && error ? (
        <Alert
          tone="warning"
          title="These figures could not be brought up to date"
          className="mb-6"
          action={
            <Button size="sm" variant="secondary" onClick={retry}>
              Try again
            </Button>
          }
        >
          {error} What you see is from {clockText(data.generatedAt)}.
        </Alert>
      ) : null}

      {lead ? <div className="mb-10 md:mb-12">{lead(data)}</div> : null}

      {data ? (
        <div
          aria-busy={refreshing || undefined}
          className={`space-y-10 transition-opacity duration-300 md:space-y-12 ${refreshing ? "opacity-50" : "opacity-100"}`}
        >
          {children(data)}
        </div>
      ) : error ? (
        <StatsError message={error} onRetry={retry} />
      ) : (
        skeleton
      )}
    </div>
  );
}
