"use client";

import { useState } from "react";
import Button from "../../ui/Button";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { Textarea } from "../../ui/Input";
import { useToast } from "../../ui/Toast";
import { resolveReview, type ReviewInput } from "@/lib/adminOps-client";
import type { ReviewRecord } from "@/lib/adminOps";
import { banjulDateTime } from "./format";
import { PersonLink } from "./parts";

/**
 * The decisions on something the payment code held for a person — a
 * payment, a payout, a disputed session — as buttons, each behind a
 * confirmation that says what it will do and takes a note for the record.
 *
 * Every one goes through the existing resolveReview function, which checks
 * the caller is staff and writes the decision, with their name, onto the
 * item. None can be undone from here, so none happens on a single tap.
 */

export type ReviewKind = ReviewInput["kind"];
export type ReviewDecision = ReviewInput["decision"];

/** resolveReview keeps this much of a note. */
const NOTE_MAX = 500;

export const REVIEW_DECISIONS: Record<
  ReviewDecision,
  {
    label: string;
    title: string;
    body: string;
    confirm: string;
    /** The toast once it is recorded. */
    done: string;
    /** How the decision reads on the item afterwards. */
    recorded: string;
    danger?: boolean;
  }
> = {
  grant: {
    label: "Grant it",
    title: "Deliver what this paid for?",
    body: "The person gets what they paid for — the conversation with TALK, or the session — exactly as if the payment had gone through on its own.",
    confirm: "Grant it",
    done: "Granted. They have what they paid for.",
    recorded: "Granted",
  },
  refunded: {
    label: "Refunded",
    title: "Record this as refunded?",
    body: "Nothing is delivered. This only records the refund — make it in the Modem Pay dashboard first.",
    confirm: "Record the refund",
    done: "Recorded as refunded.",
    recorded: "Refunded in Modem Pay",
    danger: true,
  },
  acknowledged: {
    label: "Dealt with",
    title: "Mark this payout as dealt with?",
    body: "Check Modem Pay and put it right there first. This records that you did, and takes it off the review list.",
    confirm: "Mark as dealt with",
    done: "Marked as dealt with.",
    recorded: "Dealt with",
  },
  "pay-provider": {
    label: "It happened — pay the provider",
    title: "Pay the provider for this session?",
    body: "The session counts as having happened, and the provider's fee is released to their earnings.",
    confirm: "Pay the provider",
    done: "The provider's fee is released.",
    recorded: "It happened — the provider is paid",
  },
  "refund-patient": {
    label: "It did not — refund the patient",
    title: "Refund the patient?",
    body: "The provider is not paid for this session and the patient is owed their fee back. Make the refund in the Modem Pay dashboard.",
    confirm: "Refund the patient",
    done: "Recorded. The patient is owed a refund.",
    recorded: "It did not happen — the patient is owed a refund",
    danger: true,
  },
};

const DECISIONS_FOR: Record<ReviewKind, ReviewDecision[]> = {
  payment: ["grant", "refunded"],
  payout: ["acknowledged"],
  session: ["pay-provider", "refund-patient"],
};

export default function ReviewActions({
  kind,
  id,
  summary,
  onDecided,
  fullWidth = false,
}: {
  kind: ReviewKind;
  id: string;
  /** One line naming the item, repeated in the confirmation: "D1,500 from Awa". */
  summary: string;
  onDecided?: (decision: ReviewDecision) => void;
  /** One button under another, full width — for a drawer. */
  fullWidth?: boolean;
}) {
  const toast = useToast();
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decisions = DECISIONS_FOR[kind];
  const spec = decision ? REVIEW_DECISIONS[decision] : null;

  function open(next: ReviewDecision) {
    setDecision(next);
    setNote("");
    setError(null);
  }

  async function confirm() {
    if (!decision) return;
    setError(null);
    const result = await resolveReview({ kind, id, decision, note: note.trim() });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(REVIEW_DECISIONS[decision].done);
    setDecision(null);
    onDecided?.(decision);
  }

  return (
    <>
      <div className={fullWidth ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
        {decisions.map((d, i) => (
          <Button
            key={d}
            variant={REVIEW_DECISIONS[d].danger ? "secondary" : i === 0 ? "primary" : "secondary"}
            fullWidth={fullWidth}
            onClick={() => open(d)}
          >
            {REVIEW_DECISIONS[d].label}
          </Button>
        ))}
      </div>

      <ConfirmDialog
        open={spec !== null}
        title={spec?.title ?? ""}
        confirmLabel={spec?.confirm ?? "Confirm"}
        danger={spec?.danger ?? false}
        onClose={() => setDecision(null)}
        onConfirm={confirm}
        body={
          spec ? (
            <div className="space-y-4">
              <p>{spec.body}</p>
              <p className="rounded-2xl bg-[var(--background)] px-4 py-3 text-[13px] text-[var(--foreground)]">{summary}</p>
              <Textarea
                label="A note for the record"
                hint="What you did, and why. Other staff read this."
                rows={3}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                error={error}
              />
              <p className="text-[12px]">Recorded with your name. It cannot be undone from here.</p>
            </div>
          ) : null
        }
      />
    </>
  );
}

/** A decision already made, as it reads on the item: what, when, who, and their note. */
export function ReviewRecordNote({ review }: { review: ReviewRecord }) {
  const spec = review.decision in REVIEW_DECISIONS ? REVIEW_DECISIONS[review.decision as ReviewDecision] : null;
  return (
    <div className="rounded-2xl border border-[var(--border)] px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-[var(--sage)]">Decided</p>
      <p className="mt-1.5 text-[14px] font-medium">{spec?.recorded ?? review.decision}</p>
      <p className="mt-1 text-[12.5px] text-[var(--muted)]">
        {review.at ? `${banjulDateTime(review.at)} · ` : ""}
        by {review.by ? <PersonLink uid={review.by} name="a member of staff" /> : "a member of staff"}
      </p>
      {review.note ? <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">{review.note}</p> : null}
    </div>
  );
}
