import type { Metadata } from "next";
import OverviewDashboard from "@/components/admin/insights/OverviewDashboard";

/** Staff: the service at a glance — who is here now, the headline figures, and what is waiting. */
export const metadata: Metadata = {
  title: "Overview",
};

export default function AdminOverviewPage() {
  return <OverviewDashboard />;
}
