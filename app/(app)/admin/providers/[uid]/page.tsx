import type { Metadata } from "next";
import ApplicationReview from "@/components/admin/providers/ApplicationReview";

/** Staff: one provider's application. Next 16 — `params` is a Promise. */
export const metadata: Metadata = {
  title: "Application",
};

export default async function AdminProviderPage(props: PageProps<"/admin/providers/[uid]">) {
  const { uid } = await props.params;
  return <ApplicationReview uid={uid} />;
}
