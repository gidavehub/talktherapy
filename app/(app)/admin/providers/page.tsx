import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ApplicationsList from "@/components/admin/providers/ApplicationsList";

/** Staff: provider applications, by where they stand. */
export const metadata: Metadata = {
  title: "Providers",
};

export default function AdminProvidersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Providers"
        lines={["Applications,", "and who is live."]}
        lede="Every provider who has applied, and where each application stands. Open one to check it and decide."
      />
      <ApplicationsList />
    </div>
  );
}
