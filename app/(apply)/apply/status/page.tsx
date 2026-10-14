import type { Metadata } from "next";
import ApplicationStatus from "@/components/apply/ApplicationStatus";

export const metadata: Metadata = {
  title: "Application status",
};

export default function ApplicationStatusPage() {
  return <ApplicationStatus />;
}
