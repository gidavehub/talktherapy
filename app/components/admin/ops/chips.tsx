import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  ROLE_LABELS,
  SUPPORT_STATUS_LABELS,
  type AdminBookingRow,
  type AdminPaymentRow,
  type AdminPayoutRow,
  type SupportStatus,
} from "@/lib/adminOps";
import type { AppRole, BookingStatus, PaymentStatus } from "@/lib/models";
import type { PayoutStatus } from "@/lib/payouts";
import { Chip, type ChipTone } from "./parts";

/**
 * Every status the operations pages show, as one chip each. A status always
 * gets the same colour wherever it appears — a list, a drawer, a person's
 * page — so the colour can be learned once.
 */

const ROLE_TONES: Record<AppRole, ChipTone> = {
  patient: "neutral",
  provider: "info",
  admin: "dark",
  org_admin: "accent",
};

export function RoleChip({ role }: { role: AppRole | null }) {
  if (!role) return <Chip tone="muted">No profile</Chip>;
  return <Chip tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Chip>;
}

const BOOKING_TONES: Record<BookingStatus, ChipTone> = {
  pending: "muted",
  confirmed: "info",
  completed: "positive",
  cancelled: "neutral",
  no_show: "warning",
};

/**
 * A session's own status, with a dispute taking precedence: it is what needs
 * doing. `disputed` alone says so — every decision clears it, and a patient
 * can raise it again after one, so an earlier decision does not mean settled.
 */
export function BookingChip({ booking }: { booking: Pick<AdminBookingRow, "status" | "disputed"> }) {
  if (booking.disputed) return <Chip tone="danger">Disputed</Chip>;
  return <Chip tone={BOOKING_TONES[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Chip>;
}

const BOOKING_PAYMENT_TONES: Record<PaymentStatus, ChipTone> = {
  unpaid: "muted",
  processing: "info",
  paid: "positive",
  refunded: "neutral",
  failed: "danger",
};

export function BookingPaymentChip({ status, refundDue }: { status: PaymentStatus; refundDue: boolean }) {
  if (refundDue && status !== "refunded") return <Chip tone="warning">Refund owed</Chip>;
  return <Chip tone={BOOKING_PAYMENT_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Chip>;
}

/** A payment as staff think of it: held and refunded are what matter, then the gateway's word. */
export function PaymentChip({ payment }: { payment: Pick<AdminPaymentRow, "status" | "needsReview" | "refunded"> }) {
  if (payment.needsReview) return <Chip tone="warning">Held for review</Chip>;
  if (payment.refunded) return <Chip tone="neutral">Refunded</Chip>;
  switch (payment.status) {
    case "succeeded":
      return <Chip tone="positive">Paid</Chip>;
    case "failed":
      return <Chip tone="danger">Failed</Chip>;
    default:
      return <Chip tone="muted">Not finished</Chip>;
  }
}

const PAYOUT_TONES: Record<PayoutStatus, ChipTone> = {
  initiating: "info",
  pending: "info",
  uncertain: "warning",
  completed: "positive",
  failed: "danger",
  reversed: "danger",
};

export function PayoutChip({ payout }: { payout: Pick<AdminPayoutRow, "status" | "needsReview"> }) {
  if (payout.needsReview) return <Chip tone="warning">Held for review</Chip>;
  return <Chip tone={PAYOUT_TONES[payout.status]}>{PAYOUT_STATUS_LABELS[payout.status]}</Chip>;
}

const SUPPORT_TONES: Record<SupportStatus, ChipTone> = {
  new: "accent",
  open: "info",
  in_progress: "warning",
  resolved: "positive",
};

export function SupportChip({ status }: { status: SupportStatus }) {
  return <Chip tone={SUPPORT_TONES[status]}>{SUPPORT_STATUS_LABELS[status]}</Chip>;
}
