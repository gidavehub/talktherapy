import type { Metadata } from "next";
import AvailabilityEditor from "@/components/pro/AvailabilityEditor";

/** The hours a provider offers. Inside `(app)`, so AppGate has already run. */
export const metadata: Metadata = {
  title: "Your hours",
};

export default function AvailabilityPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">
          Your hours
        </p>
        <h1 className="mt-2 font-display text-[30px] md:text-[40px] leading-[1.08] font-medium">
          When you are free
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[520px]">
          Tap the hours you can meet. People you match with see only these, and
          only until somebody takes one.
        </p>
      </div>

      <AvailabilityEditor />
    </div>
  );
}
