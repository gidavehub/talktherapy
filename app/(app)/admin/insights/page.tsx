import type { Metadata } from "next";
import InsightsDashboard from "@/components/admin/insights/InsightsDashboard";

/** Staff: how TALK is used over time — anonymous counts only. */
export const metadata: Metadata = {
  title: "Insights",
};

export default function AdminInsightsPage() {
  return <InsightsDashboard />;
}
