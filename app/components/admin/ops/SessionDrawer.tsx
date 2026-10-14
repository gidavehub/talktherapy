"use client";

import Link from "next/link";
import Drawer from "../../ui/Drawer";
import DescriptionList from "../../ui/DescriptionList";
import { Alert } from "../../ui/Feedback";
import MinorFlag from "../../ui/MinorFlag";
import { BOOKING_STATUS_LABELS, type AdminBookingRow } from "@/lib/adminOps";
import { formatDalasi, platformFeeMinor, providerPayoutMinor } from "@/lib/money";
import { BookingChip, BookingPaymentChip } from "./chips";
import { banjulDateTime, banjulSlot, duration } from "./format";
import { PersonLink, Reference, useHeld } from "./parts";
import ReviewActions, { ReviewRecordNote } from "./ReviewActions";

/**
 * One session, opened from a list: when, who, the money, and what staff
 * decided about it.
 *
 * Never what was said. The booking's note from the patient and anything from
 * the session itself are not sent to staff pages at all (the server reads
 * bookings through a field mask), and this says so, so nobody goes looking.
 */

const CANCELLED_BY = { patient: "The patient", provider: "The provider", staff: "Staff" } as const;

export default function SessionDrawer({
  booking,
  onClose,
  onReviewed,
}: {
  booking: AdminBookingRow | null;
  onClose: () => void;
  /** A decision on a disputed session was recorded: the list should show it. */
  onReviewed?: () => void;
}) {
  const b = useHeld(booking);
  return (
    <Drawer
      open={booking !== null}
      onClose={onClose}
      eyebrow="Session"
      title={b ? banjulSlot(b.startsAt, b.endsAt) : ""}
      footer={
        // Disputed is what needs a decision, even with an earlier one on
        // record: a patient can report a session again after it was paid.
        b && b.disputed ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              The patient says this did not happen. The provider&apos;s fee is held until you decide.
            </p>
            <ReviewActions
              kind="session"
              id={b.id}
              fullWidth
              summary={`${formatDalasi(b.amountMinor)} · ${banjulDateTime(b.startsAt)} · ${b.patient.name ?? "Patient"} with ${b.provider.name ?? "their provider"}`}
              onDecided={() => {
                onClose();
                onReviewed?.();
              }}
            />
          </div>
        ) : undefined
      }
    >
      {b ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <BookingChip booking={b} />
            <BookingPaymentChip status={b.paymentStatus} refundDue={b.refundDue} />
            {b.patientMinor ? <MinorFlag /> : null}
          </div>

          {b.refundDue && b.paymentStatus !== "refunded" ? (
            <Alert tone="info" title="The patient is owed their fee back">
              Make the refund in the Modem Pay dashboard. The provider is not paid for this session.
            </Alert>
          ) : null}

          <DescriptionList
            columns={2}
            items={[
              { label: "When (Banjul time)", value: banjulSlot(b.startsAt, b.endsAt), wide: true },
              { label: "Length", value: duration(b.startsAt, b.endsAt) },
              { label: "Status", value: BOOKING_STATUS_LABELS[b.status] },
              {
                label: "Patient",
                value: (
                  <span>
                    <PersonLink uid={b.patient.uid} name={b.patient.name} fallback="No name" />
                    <span className="text-[var(--muted)]"> · first name only</span>
                  </span>
                ),
              },
              {
                label: "Provider",
                value: b.provider.uid ? (
                  <span className="flex flex-col gap-1">
                    <PersonLink uid={b.provider.uid} name={b.provider.name} />
                    <Link
                      href={`/admin/providers/${b.provider.uid}`}
                      className="text-[12.5px] text-[var(--muted)] underline-offset-4 hover:underline"
                    >
                      Their application
                    </Link>
                  </span>
                ) : (
                  ""
                ),
              },
              { label: "Fee", value: formatDalasi(b.amountMinor) },
              {
                label: "Split",
                value: `${formatDalasi(providerPayoutMinor(b.amountMinor))} to the provider · ${formatDalasi(platformFeeMinor(b.amountMinor))} to TALK`,
              },
              { label: "Cancelled by", value: b.cancelledBy ? CANCELLED_BY[b.cancelledBy] : "" },
              { label: "Paid out", value: b.payoutId ? <Reference>{b.payoutId}</Reference> : "Not yet" },
              { label: "Booked", value: banjulDateTime(b.createdAt) },
              { label: "Last change", value: banjulDateTime(b.updatedAt) },
              { label: "Booking reference", value: <Reference>{b.id}</Reference>, wide: true },
            ]}
          />

          {b.review ? <ReviewRecordNote review={b.review} /> : null}

          <p className="rounded-2xl bg-[var(--background)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            What the patient wrote when booking, and anything said in the session, stay between them and their provider.
            None of it is shown to staff.
          </p>
        </div>
      ) : null}
    </Drawer>
  );
}
