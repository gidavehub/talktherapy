import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ReviewQueue from "@/components/admin/ReviewQueue";

/** Staff: what is waiting for a person. Inside `(app)`, so AppGate has already run. */
export const metadata: Metadata = {
  title: "Review",
};

export default function ReviewPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Review"
        lines={["Waiting", "for a person."]}
        lede="Everything the payment code refused to guess about. Each decision is recorded with your name."
      />
      <ReviewQueue />
    </div>
  );
}
