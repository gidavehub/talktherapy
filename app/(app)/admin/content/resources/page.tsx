import type { Metadata } from "next";
import ResourceList from "@/components/admin/content/resources/ResourceList";

/** Staff: the resource centre's articles, and the page around them. */
export const metadata: Metadata = {
  title: "Resource centre · Site content",
};

export default function AdminContentResourcesPage() {
  return <ResourceList />;
}
