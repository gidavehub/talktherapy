import type { Metadata } from "next";
import Earnings from "@/components/pro/Earnings";

/** A provider's earnings and payouts. Inside `(app)`, so AppGate has already run. */
export const metadata: Metadata = {
  title: "Your earnings",
};

export default function EarningsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Your earnings</p>
        <h1 className="mt-2 font-display text-[30px] md:text-[40px] leading-[1.08] font-medium">
          What you have earned
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[520px]">
          Paid sessions, and sending the money to your wallet.
        </p>
      </div>

      <Earnings />
    </div>
  );
}
