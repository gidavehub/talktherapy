"use client";

import Drawer from "../../ui/Drawer";
import DescriptionList from "../../ui/DescriptionList";
import { Alert } from "../../ui/Feedback";
import { PAYOUT_STATUS_LABELS, type AdminPaymentRow, type AdminPayoutRow } from "@/lib/adminOps";
import { formatDalasi } from "@/lib/money";
import { PaymentChip, PayoutChip } from "./chips";
import { networkLabel, purposeLabel } from "./columns";
import { banjulDateTime, plural } from "./format";
import { Chip, PersonLink, Reference, useHeld } from "./parts";
import ReviewActions, { ReviewRecordNote } from "./ReviewActions";

/**
 * A payment and a payout, opened from a list. Each shows what the gateway
 * said, who it belongs to, and — while it is held for a person — the
 * decisions resolveReview offers for it.
 */

const GATEWAY_STATUS: Record<AdminPaymentRow["status"], string> = {
  pending: "Not finished",
  succeeded: "Went through",
  failed: "Failed",
};

export function PaymentDrawer({
  payment,
  onClose,
  onReviewed,
}: {
  payment: AdminPaymentRow | null;
  onClose: () => void;
  onReviewed?: () => void;
}) {
  const p = useHeld(payment);
  return (
    <Drawer
      open={payment !== null}
      onClose={onClose}
      eyebrow={p ? purposeLabel(p.purpose) : "Payment"}
      title={p ? formatDalasi(p.amountMinor) : ""}
      footer={
        p && p.needsReview ? (
          <ReviewActions
            kind="payment"
            id={p.id}
            fullWidth
            summary={`${formatDalasi(p.amountMinor)} · ${purposeLabel(p.purpose)} · ${p.payer?.name ?? p.customerEmail ?? "payer unknown"}`}
            onDecided={() => {
              onClose();
              onReviewed?.();
            }}
          />
        ) : undefined
      }
    >
      {p ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <PaymentChip payment={p} />
            {p.fulfilled ? <Chip tone="positive">Delivered</Chip> : null}
          </div>

          {p.needsReview ? (
            <Alert tone="warning" title="Held for a person">
              <span className="block">{p.reviewReason ?? "The payment code would not guess what to do with this one."}</span>
              <span className="mt-1.5 block">
                Grant delivers what it paid for. Refunded records a refund you made in the Modem Pay dashboard.
              </span>
            </Alert>
          ) : null}

          <DescriptionList
            columns={2}
            items={[
              { label: "For", value: purposeLabel(p.purpose) },
              { label: "Amount", value: formatDalasi(p.amountMinor) },
              { label: "Gateway says", value: GATEWAY_STATUS[p.status] },
              { label: "Delivered", value: p.fulfilled ? "Yes" : "Not yet" },
              {
                label: "Payer",
                value: p.payer ? <PersonLink uid={p.payer.uid} name={p.payer.name} fallback="No name" /> : "Not matched to anyone",
              },
              { label: "Email given at checkout", value: p.customerEmail ?? "" },
              { label: "Paid with", value: p.paymentMethods.join(", ") },
              { label: "Last gateway event", value: p.event ?? "" },
              { label: "Received (Banjul time)", value: banjulDateTime(p.createdAt) },
              { label: "Last change", value: banjulDateTime(p.updatedAt) },
              { label: "Session", value: p.bookingId ? <Reference>{p.bookingId}</Reference> : "", wide: true },
              { label: "Payment reference", value: <Reference>{p.id}</Reference>, wide: true },
            ]}
          />

          {p.review ? <ReviewRecordNote review={p.review} /> : null}
        </div>
      ) : null}
    </Drawer>
  );
}

export function PayoutDrawer({
  payout,
  onClose,
  onReviewed,
}: {
  payout: AdminPayoutRow | null;
  onClose: () => void;
  onReviewed?: () => void;
}) {
  const p = useHeld(payout);
  return (
    <Drawer
      open={payout !== null}
      onClose={onClose}
      eyebrow="Payout"
      title={p ? `${formatDalasi(p.amountMinor)} to ${p.provider.name ?? "a provider"}` : ""}
      footer={
        p && p.needsReview ? (
          <ReviewActions
            kind="payout"
            id={p.id}
            fullWidth
            summary={`${formatDalasi(p.amountMinor)} to ${p.beneficiaryName ?? p.provider.name ?? "a provider"} · ${PAYOUT_STATUS_LABELS[p.status]}`}
            onDecided={() => {
              onClose();
              onReviewed?.();
            }}
          />
        ) : undefined
      }
    >
      {p ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <PayoutChip payout={p} />
          </div>

          {p.needsReview ? (
            <Alert tone="warning" title="Held for a person">
              <span className="block">{p.reviewReason ?? "Flagged for a check."}</span>
              <span className="mt-1.5 block">Check Modem Pay and put it right there, then mark it as dealt with.</span>
            </Alert>
          ) : null}

          <DescriptionList
            columns={2}
            items={[
              {
                label: "Provider",
                value: p.provider.uid ? <PersonLink uid={p.provider.uid} name={p.provider.name} /> : "",
              },
              { label: "Amount", value: formatDalasi(p.amountMinor) },
              { label: "Status", value: PAYOUT_STATUS_LABELS[p.status] },
              { label: "For", value: plural(p.sessionCount, "session") },
              {
                label: "Paid to",
                value: p.network ? `${networkLabel(p.network)} ${p.accountHint ?? ""}`.trim() : "",
              },
              { label: "Name on the wallet", value: p.beneficiaryName ?? "" },
              { label: "Why it failed", value: p.failureReason ?? "", wide: true },
              { label: "Sent (Banjul time)", value: banjulDateTime(p.createdAt) },
              { label: "Last change", value: banjulDateTime(p.updatedAt) },
              { label: "Transfer reference", value: p.transferReference ? <Reference>{p.transferReference}</Reference> : "" },
              { label: "Payout reference", value: <Reference>{p.id}</Reference> },
              {
                label: "Sessions in it",
                value: p.bookingIds.length ? (
                  <span className="flex flex-col gap-1">
                    {p.bookingIds.map((id) => (
                      <Reference key={id}>{id}</Reference>
                    ))}
                  </span>
                ) : (
                  ""
                ),
                wide: true,
              },
            ]}
          />

          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            Only the end of the wallet number is shown. The full number stays on the server.
          </p>

          {p.review ? <ReviewRecordNote review={p.review} /> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
