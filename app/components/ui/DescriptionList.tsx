/**
 * Label over value, for the facts about one thing: a payment's amount and
 * reference, a provider's licence and languages, a session's time and fee.
 *
 * The labels are the sage caps of the table headers, so a drawer opened from
 * a DataTable row reads as the same record turned on its side.
 */

export type DescriptionItem = {
  label: string;
  /** Empty (null, undefined or "") shows a dash rather than a blank. */
  value: React.ReactNode;
  /** Spans both columns: for an address, a note, a reason. */
  wide?: boolean;
};

const LABEL = "text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--sage)]";

export default function DescriptionList({
  items,
  columns = 1,
  className = "",
}: {
  items: DescriptionItem[];
  /** Two columns from sm up; a phone always gets one. */
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl className={`grid gap-x-8 gap-y-5 ${columns === 2 ? "sm:grid-cols-2" : ""} ${className}`}>
      {items.map((item, i) => {
        const blank = item.value === null || item.value === undefined || item.value === "";
        return (
          <div key={`${item.label}-${i}`} className={`min-w-0 ${item.wide && columns === 2 ? "sm:col-span-2" : ""}`}>
            <dt className={LABEL}>{item.label}</dt>
            <dd className="mt-1.5 text-[14px] leading-relaxed text-[var(--foreground)] [overflow-wrap:anywhere]">
              {blank ? <span className="text-[var(--muted)]">—</span> : item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
