import type { Metadata } from "next";
import ApplyHeader from "@/components/apply/ApplyHeader";

/**
 * The provider application: its own space, between the public site and the
 * app. Cream like the sign-in screens, with the TALK mark at the top and
 * nothing else to wander off to.
 */
export const metadata: Metadata = {
  title: { default: "Apply to join", template: "%s · Apply · TALK" },
  // An applicant's own screens; nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <ApplyHeader />
      <main className="relative">{children}</main>
    </div>
  );
}
