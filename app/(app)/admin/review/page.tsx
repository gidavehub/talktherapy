import type { Metadata } from "next";
import ReviewQueue from "@/components/admin/ReviewQueue";

/** Staff: what is waiting for a person. Inside `(app)`, so AppGate has already run. */
export const metadata: Metadata = {
  title: "Review",
};

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Staff</p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          Waiting for a person
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[560px]">
          Everything the payment code refused to guess about. Each decision is recorded with your name.
        </p>
      </div>

      <ReviewQueue />
    </div>
  );
}
