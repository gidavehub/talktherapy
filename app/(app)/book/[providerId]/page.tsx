import type { Metadata } from "next";
import SlotPicker from "@/components/booking/SlotPicker";

export const metadata: Metadata = {
  title: "Pick a time",
};

/**
 * Book a session with one provider.
 *
 * Next 16: `params` is a Promise, and `PageProps<'/book/[providerId]'>` comes
 * from the generated route tree — so renaming the segment breaks the build
 * here rather than at runtime.
 *
 * Inside `(app)` because booking needs a signed-in person; the provider's
 * public profile, which links here, does not.
 */
export default async function BookPage(props: PageProps<"/book/[providerId]">) {
  const { providerId } = await props.params;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Book a session
        </p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          Pick a time
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[520px]">
          These are the hours they are free. Tap the speaker on any day to hear
          the times read out.
        </p>
      </div>

      <SlotPicker providerId={providerId} />
    </div>
  );
}
