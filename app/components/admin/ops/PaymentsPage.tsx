"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Button from "../../ui/Button";
import DateRangePicker, { type DateRangeValue } from "../../ui/DateRangePicker";
import { Dropdown } from "../../ui/Dropdown";
import { Alert } from "../../ui/Feedback";
import SegmentedControl from "../../ui/SegmentedControl";
import StatCard from "../../ui/StatCard";
import { useNow } from "@/lib/useNow";
import {
  adminListPayments,
  adminListPayouts,
  adminPaymentTotals,
  type OpsResult,
} from "@/lib/adminOps-client";
import {
  PAYMENT_FILTERS,
  PAYMENT_FILTER_LABELS,
  PAYMENT_PURPOSES,
  PAYMENT_PURPOSE_LABELS,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  type AdminPaymentRow,
  type AdminPayoutRow,
  type DateRange,
  type PaymentFilter,
  type PaymentPurpose,
  type PaymentTotalsResult,
  type PayoutFilter,
} from "@/lib/adminOps";
import { formatDalasi } from "@/lib/money";
import { paymentColumns, payoutColumns } from "./columns";
import { banjulRange, plural, rangeKey } from "./format";
import { PaymentDrawer, PayoutDrawer } from "./MoneyDrawers";
import { BanjulNote, FilterRow, LoadError, PagedTable } from "./parts";
import { usePagedList } from "./usePagedList";

/**
 * The money: what came in, what went back, what went out to providers, and
 * TALK's share — for a stretch of time — then every payment or payout in it.
 *
 * Anything the payment code held for a person opens with the same decisions
 * the review page offers, through the same resolveReview function.
 */

type View = "payments" | "payouts";

const PERIOD_LABELS: Partial<Record<DateRangeValue["preset"], string>> = {
  "7d": "vs the 7 days before",
  "30d": "vs the 30 days before",
  "90d": "vs the 90 days before",
  "12m": "vs the 12 months before",
  custom: "vs the same length before",
};

/** The change from one figure to the next, as a fraction; none when there is nothing to compare with. */
function change(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous <= 0) return undefined;
  return (current - previous) / previous;
}

function MoneyFigures({ range, period }: { range: DateRange; period: DateRangeValue }) {
  const key = rangeKey(range);
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<{ key: string; result: OpsResult<PaymentTotalsResult> } | null>(null);
  const requestKey = `${attempt}|${key}`;

  // The range is a new object every render; its key says when it changed.
  const fetchTotals = useEffectEvent(() => adminPaymentTotals({ range }));

  useEffect(() => {
    let live = true;
    void fetchTotals().then((result) => {
      if (live) setHeld({ key: requestKey, result });
    });
    return () => {
      live = false;
    };
  }, [requestKey]);

  const loading = held?.key !== requestKey;
  if (!loading && held && !held.result.ok) {
    return <LoadError title="The totals did not load" message={held.result.error} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  const totals = !loading && held?.result.ok ? held.result.data : null;
  const figures = totals?.current;
  const before = totals?.previous ?? undefined;
  const against = before ? PERIOD_LABELS[period.preset] : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          loading={!figures}
          label="Collected"
          value={figures ? formatDalasi(figures.collectedMinor) : "—"}
          delta={figures ? change(figures.collectedMinor, before?.collectedMinor) : undefined}
          deltaLabel={against}
          caption={figures ? `${plural(figures.payments, "payment")} · ${formatDalasi(figures.sessionFeesMinor)} for sessions` : undefined}
        />
        <StatCard
          loading={!figures}
          label="Refunded"
          invert
          value={figures ? formatDalasi(figures.refundedMinor) : "—"}
          delta={figures ? change(figures.refundedMinor, before?.refundedMinor) : undefined}
          deltaLabel={against}
          caption={figures ? plural(figures.refunds, "refund") : undefined}
        />
        <StatCard
          loading={!figures}
          label="Paid out to providers"
          value={figures ? formatDalasi(figures.paidOutMinor) : "—"}
          delta={figures ? change(figures.paidOutMinor, before?.paidOutMinor) : undefined}
          deltaLabel={against}
          caption={figures ? plural(figures.payouts, "payout") : undefined}
        />
        <StatCard
          loading={!figures}
          label="TALK's share"
          value={figures ? formatDalasi(figures.platformFeeMinor) : "—"}
          delta={figures ? change(figures.platformFeeMinor, before?.platformFeeMinor) : undefined}
          deltaLabel={against}
          caption="Of the session fees collected"
        />
      </div>
      {totals?.truncated ? (
        <Alert tone="info" title="At least this much">
          There were more payments in this time than one look adds up, so these figures are a floor. A shorter range gives
          exact ones.
        </Alert>
      ) : null}
    </div>
  );
}

type PaymentStatusFilter = PaymentFilter | "any";
type PurposeFilter = PaymentPurpose | "any";
type PayoutStatusFilter = PayoutFilter | "any";

const PAYMENT_STATUS_OPTIONS = [
  { value: "any" as const, label: "Any status" },
  ...PAYMENT_FILTERS.map((f) => ({ value: f, label: PAYMENT_FILTER_LABELS[f] })),
];
const PURPOSE_OPTIONS = [
  { value: "any" as const, label: "Anything" },
  ...PAYMENT_PURPOSES.map((p) => ({ value: p, label: PAYMENT_PURPOSE_LABELS[p] })),
];
const PAYOUT_STATUS_OPTIONS = [
  { value: "any" as const, label: "Any status" },
  { value: "needs_review" as const, label: "Held for review" },
  ...PAYOUT_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s] })),
];

function PaymentsList({ range, now }: { range: DateRange; now: number }) {
  const [status, setStatus] = useState<PaymentStatusFilter>("any");
  const [purpose, setPurpose] = useState<PurposeFilter>("any");
  const [open, setOpen] = useState<AdminPaymentRow | null>(null);
  const list = usePagedList<AdminPaymentRow>(`${status}|${purpose}|${rangeKey(range)}`, (cursor) =>
    adminListPayments({
      status: status === "any" ? undefined : status,
      purpose: purpose === "any" ? undefined : purpose,
      range,
      cursor,
    }),
  );
  const filtered = status !== "any" || purpose !== "any";

  return (
    <div className="space-y-4">
      <FilterRow label="Filter payments">
        <Dropdown<PaymentStatusFilter>
          variant="pill"
          label="Status"
          options={PAYMENT_STATUS_OPTIONS}
          value={status === "any" ? null : status}
          onChange={setStatus}
        />
        <Dropdown<PurposeFilter>
          variant="pill"
          label="For"
          options={PURPOSE_OPTIONS}
          value={purpose === "any" ? null : purpose}
          onChange={setPurpose}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatus("any");
              setPurpose("any");
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </FilterRow>

      <PagedTable
        list={list}
        noun="payment"
        columns={paymentColumns(now)}
        rowKey={(p) => p.id}
        onRowClick={setOpen}
        caption="Payments, newest first"
        csv={{ filename: "payments.csv" }}
        empty={
          filtered
            ? { title: "None match", description: "No payment in this time matches those filters." }
            : { title: "No payments", description: "Nothing was paid in this time." }
        }
      />

      <PaymentDrawer payment={open} onClose={() => setOpen(null)} onReviewed={list.reload} />
    </div>
  );
}

function PayoutsList({ range, now }: { range: DateRange; now: number }) {
  const [status, setStatus] = useState<PayoutStatusFilter>("any");
  const [open, setOpen] = useState<AdminPayoutRow | null>(null);
  const list = usePagedList<AdminPayoutRow>(`${status}|${rangeKey(range)}`, (cursor) =>
    adminListPayouts({ status: status === "any" ? undefined : status, range, cursor }),
  );

  return (
    <div className="space-y-4">
      <FilterRow label="Filter payouts">
        <Dropdown<PayoutStatusFilter>
          variant="pill"
          label="Status"
          options={PAYOUT_STATUS_OPTIONS}
          value={status === "any" ? null : status}
          onChange={setStatus}
        />
        {status !== "any" ? (
          <Button variant="ghost" size="sm" onClick={() => setStatus("any")}>
            Clear filter
          </Button>
        ) : null}
      </FilterRow>

      <PagedTable
        list={list}
        noun="payout"
        columns={payoutColumns(now)}
        rowKey={(p) => p.id}
        onRowClick={setOpen}
        caption="Payouts, newest first"
        csv={{ filename: "payouts.csv" }}
        empty={
          status !== "any"
            ? { title: "None match", description: "No payout in this time has that status." }
            : { title: "No payouts", description: "Nothing was sent to providers in this time." }
        }
      />

      <PayoutDrawer payout={open} onClose={() => setOpen(null)} onReviewed={list.reload} />
    </div>
  );
}

export default function PaymentsPage() {
  const now = useNow(60_000);
  const [view, setView] = useState<View>("payments");
  const [period, setPeriod] = useState<DateRangeValue>({ preset: "30d" });
  // Whole Banjul days: the range only moves at midnight, not every tick.
  const range = banjulRange(period, now);

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
        <DateRangePicker label="Show money from" value={period} onChange={setPeriod} />
        <BanjulNote />
      </div>

      <MoneyFigures range={range} period={period} />

      <SegmentedControl<View>
        ariaLabel="Show payments or payouts"
        value={view}
        onChange={setView}
        options={[
          { value: "payments", label: "Payments in" },
          { value: "payouts", label: "Payouts out" },
        ]}
      />

      {view === "payments" ? <PaymentsList range={range} now={now} /> : <PayoutsList range={range} now={now} />}
    </div>
  );
}
