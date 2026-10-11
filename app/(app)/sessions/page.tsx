import type { Metadata } from "next";
import SessionList from "@/components/booking/SessionList";

/** Sessions, from whichever side you are on. */
export const metadata: Metadata = {
  title: "Sessions",
};

export default function SessionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">
          Sessions
        </p>
        <h1 className="mt-2 font-display text-[30px] md:text-[40px] leading-[1.08] font-medium">
          Your sessions
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[520px]">
          Everything booked, and everything that has already happened. Tap the
          speaker on any of them to hear it read out.
        </p>
      </div>

      <SessionList />
    </div>
  );
}
