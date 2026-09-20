import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/Sections";
import CounsellorProfileView from "@/components/marketing/CounsellorProfileView";

export const metadata: Metadata = {
  title: "Counsellor profile",
  description:
    "View a verified counsellor's qualifications, specialisations, languages and session fee before you book.",
};

/**
 * Next 16: `params` is a Promise and must be awaited. `PageProps<'/route'>` is
 * a global helper — no import needed — and is generated from the route tree, so
 * renaming the segment surfaces as a type error here rather than at runtime.
 */
export default async function CounsellorPage(
  props: PageProps<"/therapists/[counsellorId]">,
) {
  const { counsellorId } = await props.params;

  return (
    <div className="bg-[var(--background)] pt-[110px] md:pt-[150px]">
      <div className="px-4 sm:px-6 md:px-10 max-w-[1400px] mx-auto">
        <Link
          href="/therapists"
          className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          All counsellors
        </Link>
      </div>

      <Section tone="light" padding="pt-10 pb-20 md:pb-28">
        <CounsellorProfileView counsellorId={counsellorId} />
      </Section>
    </div>
  );
}
