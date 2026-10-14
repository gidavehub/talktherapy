import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ApplicationReview from "@/components/admin/providers/ApplicationReview";

/** Staff: one provider's application. Next 16 — `params` is a Promise. */
export const metadata: Metadata = {
  title: "Application",
};

export default async function AdminProviderPage(props: PageProps<"/admin/providers/[uid]">) {
  const { uid } = await props.params;
  // A sign-in id is letters, digits, "_" and "-". Anything else (a "/" above
  // all) is not an application, and would only make a broken database path.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) notFound();
  return <ApplicationReview uid={uid} />;
}
