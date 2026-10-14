import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import PaymentsPage from "@/components/admin/ops/PaymentsPage";

/** Staff: money in, money back, money out. */
export const metadata: Metadata = {
  title: "Payments",
};

export default function AdminPaymentsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        lines={["Money in,", "and money out."]}
        lede="What people paid, what went back to them, and what reached providers. Anything held for a person can be decided from here."
      />
      <PaymentsPage />
    </div>
  );
}
