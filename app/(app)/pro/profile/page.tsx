import type { Metadata } from "next";
import ProviderProfileForm from "@/components/pro/ProviderProfileForm";

/**
 * A provider's own listing.
 *
 * Inside the `(app)` group, so AppGate has already established that someone is
 * signed in — and, for a provider, has skipped the patient onboarding they do
 * not have. The form itself handles a patient who reaches this URL.
 */
export const metadata: Metadata = {
  title: "Your profile",
};

export default function ProviderProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Your profile
        </p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          How people find you
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[560px]">
          Talk suggests providers by matching what you offer against what
          someone has said they need — the language they speak, what they are
          going through, where they are. Everything below is part of that match,
          not decoration.
        </p>
      </div>

      <ProviderProfileForm />
    </div>
  );
}
