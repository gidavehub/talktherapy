import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ResourceEditor from "@/components/admin/content/resources/ResourceEditor";
import { isResourceId } from "@/lib/content/resources";

/** Staff: one article, edited — a starter article, one written here, or a new one. */
export const metadata: Metadata = {
  title: "Article · Resource centre",
};

// Next 16: params is a Promise.
export default async function AdminContentResourcePage(props: PageProps<"/admin/content/resources/[id]">) {
  const { id } = await props.params;
  if (!isResourceId(id)) notFound();
  // Keyed, so moving from one article to another starts a fresh editor.
  return <ResourceEditor key={id} id={id} />;
}
