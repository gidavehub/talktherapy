import type { Metadata } from "next";
import AppGate from "@/components/app/AppGate";
import PresenceHeartbeat from "@/lib/analytics/PresenceHeartbeat";

/**
 * Authenticated patient area.
 *
 * The guard is mounted here rather than per-page: one mount point covers every
 * screen in the group, and a page added later is protected by default instead
 * of by remembering to wrap it.
 */
export const metadata: Metadata = {
  // Nothing behind sign-in should ever appear in a search index.
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppGate>
      {/* "In the app now", for the staff numbers. See usePresence. */}
      <PresenceHeartbeat />
      {children}
    </AppGate>
  );
}
