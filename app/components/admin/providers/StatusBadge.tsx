import { STATUS_LABELS, type ApplicationStatus } from "@/lib/providerApplication";

/** An application's status as a chip. The word carries it; the colour only helps. */
const TONES: Record<ApplicationStatus, string> = {
  draft: "bg-[var(--sand)] text-[var(--muted)]",
  submitted: "bg-[var(--accent)] text-white",
  in_review: "bg-[var(--info-soft)] text-[var(--info)]",
  changes_requested: "bg-[var(--warning-soft)] text-[var(--warning)]",
  approved: "bg-[var(--sage)] text-white",
  rejected: "bg-[var(--danger-soft)] text-[var(--danger)]",
  suspended: "bg-[var(--dark)] text-[var(--cream)]",
};

export default function StatusBadge({ status, className = "" }: { status: ApplicationStatus; className?: string }) {
  return (
    <span className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[11.5px] font-medium ${TONES[status]} ${className}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
