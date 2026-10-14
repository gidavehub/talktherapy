"use client";

import { BarChart, ChartCard } from "@/components/ui/charts";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import { IconRetry } from "@/components/ui/icons";
import { SUPPRESSED_TEXT, type Category, type Metric, type ResolvedRange, type SeriesPoint } from "@/lib/adminStats";
import { categoryTable, isQuiet, periodText, seriesBars, seriesTable, sparkValues, toBars } from "./format";

/**
 * The pieces every staff dashboard is built from: a breakdown, a series, a
 * headline figure, a section heading, and the error and loading states.
 *
 * Each chart sits in a ChartCard with its takeaway as the subtitle, its
 * table twin one tap away, and an empty message in place of a chart that
 * would only draw zeros. Bars are one colour — the first in the chart
 * palette — because one series needs no other.
 */

const ROW = 34;

export function DashboardSection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="font-display mt-2 text-[24px] font-medium leading-tight md:text-[28px]">
          {title}
        </h2>
        {lede ? <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-[var(--muted)]">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A breakdown as bars, in the order given (largest first for a ranking, the
 * natural order for age bands and durations).
 *
 * `shareOf` is what each share is of, and the tooltip and the table say the
 * same: the real total and its noun where the function gives one, null where
 * a share means nothing, or left out when the bars are the whole.
 */
export function CategoryCard({
  eyebrow,
  title,
  takeaway,
  list,
  labelHeading,
  valueHeading,
  shareOf,
  valueFormat,
  empty,
  note,
  className,
}: {
  eyebrow?: string;
  title: string;
  takeaway?: string;
  list: Category[];
  labelHeading: string;
  valueHeading: string;
  shareOf?: { total: number; label: string } | null;
  valueFormat?: (value: number) => string;
  empty: string;
  note?: string;
  className?: string;
}) {
  const quiet = isQuiet(list);
  return (
    <ChartCard
      eyebrow={eyebrow}
      title={title}
      subtitle={quiet ? undefined : takeaway}
      table={categoryTable(list, { label: labelHeading, value: valueHeading, shareOf, format: valueFormat })}
      empty={quiet ? empty : undefined}
      note={note}
      minHeight={Math.max(120, Math.min(list.length, 8) * ROW)}
      className={className}
    >
      <BarChart data={toBars(list)} label={title} shareOf={shareOf} valueFormat={valueFormat} />
    </ChartCard>
  );
}

/**
 * A count per day, week or month as columns. Columns rather than a line
 * because a withheld bucket has to be drawn as withheld — the hatched "<5"
 * column — and a line could only join across it as if it were known.
 */
export function SeriesCard({
  eyebrow,
  title,
  takeaway,
  points,
  bucket,
  valueHeading,
  valueFormat,
  empty,
  note,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  takeaway?: string;
  points: SeriesPoint[];
  bucket: ResolvedRange["bucket"];
  valueHeading: string;
  valueFormat?: (value: number) => string;
  empty: string;
  note?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const quiet = isQuiet(points);
  return (
    <ChartCard
      eyebrow={eyebrow}
      title={title}
      subtitle={quiet ? undefined : takeaway}
      table={seriesTable(points, bucket, { value: valueHeading, format: valueFormat })}
      empty={quiet ? empty : undefined}
      note={note}
      actions={actions}
      minHeight={220}
      className={className}
    >
      <BarChart
        orientation="vertical"
        data={seriesBars(points, bucket)}
        height={220}
        label={title}
        shareOf={null}
        valueFormat={valueFormat}
      />
    </ChartCard>
  );
}

/**
 * A headline figure for the range, against the same number of days just
 * before. The arrow and percentage come from the function's own delta; a
 * withheld figure has neither, and says so.
 */
export function MetricCard({
  label,
  metric,
  range,
  format = (v) => v.toLocaleString("en-GB"),
  caption,
}: {
  label: string;
  metric: Metric;
  range: ResolvedRange;
  format?: (value: number) => React.ReactNode;
  caption?: string;
}) {
  const value = metric.suppressed ? SUPPRESSED_TEXT : metric.value === null ? "—" : format(metric.value);
  const before = periodText(range);
  const comparison = metric.suppressed
    ? "Fewer than 5, so the number is withheld."
    : metric.value === null
      ? "Nothing to measure in these dates."
      : metric.previous === 0 && metric.value
        ? `None in the ${before} before.`
        : metric.previous === null
          ? `Too few in the ${before} before to compare.`
          : null;
  return (
    <StatCard
      label={label}
      value={value}
      delta={metric.deltaRate ?? undefined}
      deltaLabel={`vs the ${before} before`}
      caption={[caption, comparison].filter(Boolean).join(" ") || undefined}
      spark={sparkValues(metric.spark)}
    />
  );
}

/**
 * A length of time as a figure: "4 min 35 s" with the units small, so the
 * number reads first and the figure fits a half-width card on a phone.
 */
export function Duration({ seconds }: { seconds: number }) {
  const s = Math.round(seconds);
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  const unit = (text: string) => <span className="text-[0.55em] font-normal"> {text}</span>;
  return (
    <>
      {minutes ? (
        <>
          {minutes}
          {unit("min")}
        </>
      ) : null}
      {rest || !minutes ? (
        <>
          {minutes ? " " : ""}
          {rest}
          {unit("s")}
        </>
      ) : null}
    </>
  );
}

/** A loading card in the shape of the chart that will replace it. */
export function ChartPlaceholder({ title, height = 220, className }: { title: string; height?: number; className?: string }) {
  return (
    <ChartCard title={title} table={{ columns: [], rows: [] }} loading minHeight={height} className={className}>
      {null}
    </ChartCard>
  );
}

/** The figures did not arrive: what went wrong, and a way to ask again. */
export function StatsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[28px] border border-dashed border-[var(--dark)]/20 bg-[var(--surface)]/70 px-6 py-12 text-center md:py-16"
    >
      <span className="arch mx-auto mb-5 flex h-14 w-12 items-center justify-center rounded-b-xl bg-[var(--sage)] text-white">
        <IconRetry />
      </span>
      <p className="font-display text-[22px] font-medium leading-tight">The figures did not load</p>
      <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-[var(--muted)]">{message}</p>
      <div className="mt-7 flex justify-center">
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}
