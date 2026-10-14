import type { Metadata } from "next";
import WellbeingDashboard from "@/components/admin/insights/WellbeingDashboard";

/** Staff: what people bring to TALK, in groups of five or more. */
export const metadata: Metadata = {
  title: "Wellbeing",
};

export default function AdminWellbeingPage() {
  return <WellbeingDashboard />;
}
