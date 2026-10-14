"use client";

import type { DataColumn } from "../../ui/DataTable";
import MinorFlag from "../../ui/MinorFlag";
import {
  PAYMENT_PURPOSE_LABELS,
  type AdminBookingRow,
  type AdminPaymentRow,
  type AdminPayoutRow,
  type PaymentPurpose,
} from "@/lib/adminOps";
import { PAYOUT_NETWORK_LABELS } from "@/lib/payouts";
import { formatDalasi } from "@/lib/money";
import { BookingChip, BookingPaymentChip, PaymentChip, PayoutChip } from "./chips";
import { banjulDateTime, banjulSlot, relativeTime } from "./format";

/**
 * The columns of the sessions, payments and payouts tables — shared by their
 * own pages and by a person's page, so a session reads the same in both.
 *
 * Times are Banjul time (the page says so once, above the table), and every
 * amount goes through formatDalasi.
 */

/** What a payment was for, in words; an unknown purpose is shown as it was written. */
export function purposeLabel(purpose: string | null): string {
  if (!purpose) return "Unknown";
  return Object.hasOwn(PAYMENT_PURPOSE_LABELS, purpose) ? PAYMENT_PURPOSE_LABELS[purpose as PaymentPurpose] : purpose;
}

export function networkLabel(network: string | null): string {
  if (!network) return "";
  return Object.hasOwn(PAYOUT_NETWORK_LABELS, network) ? PAYOUT_NETWORK_LABELS[network as keyof typeof PAYOUT_NETWORK_LABELS] : network;
}

const muted = (text: string) => <span className="text-[var(--muted)]">{text}</span>;

export function bookingColumns(now: number, options: { hide?: "patient" | "provider" } = {}): DataColumn<AdminBookingRow>[] {
  const columns: DataColumn<AdminBookingRow>[] = [
    {
      key: "time",
      header: "Banjul time",
      csvValue: (b) => banjulDateTime(b.startsAt),
      render: (b) => (
        <span className="block">
          <span className="block font-medium">{banjulSlot(b.startsAt, b.endsAt)}</span>
          <span className="block text-[12px] text-[var(--muted)]">{relativeTime(b.startsAt, now)}</span>
        </span>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      csvValue: (b) => b.patient.name ?? "",
      render: (b) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 md:justify-start">
          <span>{b.patient.name ?? muted("No name")}</span>
          {b.patientMinor ? <MinorFlag size="row" className="text-[12px]" /> : null}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      csvValue: (b) => b.provider.name ?? "",
      render: (b) => b.provider.name ?? muted("Unknown"),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <BookingChip booking={b} />,
    },
    {
      key: "payment",
      header: "Payment",
      hideBelow: "lg",
      render: (b) => <BookingPaymentChip status={b.paymentStatus} refundDue={b.refundDue} />,
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      csvValue: (b) => b.amountMinor / 100,
      render: (b) => formatDalasi(b.amountMinor),
    },
  ];
  return columns.filter((c) => c.key !== options.hide);
}

export function paymentColumns(now: number, options: { payer?: boolean } = {}): DataColumn<AdminPaymentRow>[] {
  const columns: DataColumn<AdminPaymentRow>[] = [
    {
      key: "when",
      header: "Received",
      csvValue: (p) => banjulDateTime(p.createdAt),
      render: (p) => (
        <span className="block">
          <span className="block">{banjulDateTime(p.createdAt, now)}</span>
          <span className="block text-[12px] text-[var(--muted)]">{relativeTime(p.createdAt, now)}</span>
        </span>
      ),
    },
    {
      key: "purpose",
      header: "For",
      csvValue: (p) => purposeLabel(p.purpose),
      render: (p) => purposeLabel(p.purpose),
    },
  ];
  if (options.payer !== false) {
    columns.push({
      key: "payer",
      header: "Payer",
      // A name, never the email: the export leaves the building.
      csvValue: (p) => p.payer?.name ?? "",
      render: (p) =>
        p.payer ? (
          <span className="block min-w-0">
            <span className="block truncate">{p.payer.name ?? "No name"}</span>
            {p.customerEmail ? (
              <span className="hidden truncate text-[12px] text-[var(--muted)] md:block">{p.customerEmail}</span>
            ) : null}
          </span>
        ) : (
          <span className="block min-w-0">
            <span className="block text-[var(--muted)]">Not matched</span>
            {p.customerEmail ? (
              <span className="hidden truncate text-[12px] text-[var(--muted)] md:block">{p.customerEmail}</span>
            ) : null}
          </span>
        ),
    });
  }
  columns.push(
    {
      key: "status",
      header: "Status",
      csvValue: (p) => (p.needsReview ? "Held for review" : p.refunded ? "Refunded" : p.status),
      render: (p) => <PaymentChip payment={p} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvValue: (p) => p.amountMinor / 100,
      render: (p) => <span className="font-medium">{formatDalasi(p.amountMinor)}</span>,
    },
  );
  return columns;
}

export function payoutColumns(now: number): DataColumn<AdminPayoutRow>[] {
  return [
    {
      key: "when",
      header: "Sent",
      csvValue: (p) => banjulDateTime(p.createdAt),
      render: (p) => (
        <span className="block">
          <span className="block">{banjulDateTime(p.createdAt, now)}</span>
          <span className="block text-[12px] text-[var(--muted)]">{relativeTime(p.createdAt, now)}</span>
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      csvValue: (p) => p.provider.name ?? "",
      render: (p) => p.provider.name ?? muted("Unknown"),
    },
    {
      key: "to",
      header: "Paid to",
      hideBelow: "lg",
      csvValue: (p) => `${networkLabel(p.network)} ${p.accountHint ?? ""}`.trim(),
      render: (p) => (p.network ? `${networkLabel(p.network)} ${p.accountHint ?? ""}`.trim() : muted("—")),
    },
    {
      key: "sessions",
      header: "Sessions",
      align: "right",
      csvValue: (p) => p.sessionCount,
      render: (p) => p.sessionCount,
    },
    {
      key: "status",
      header: "Status",
      csvValue: (p) => (p.needsReview ? "Held for review" : p.status),
      render: (p) => <PayoutChip payout={p} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvValue: (p) => p.amountMinor / 100,
      render: (p) => <span className="font-medium">{formatDalasi(p.amountMinor)}</span>,
    },
  ];
}
