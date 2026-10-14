import type { Metadata } from "next";
import MediaManager from "@/components/admin/content/MediaManager";

/** Staff: the pictures the public site can use. */
export const metadata: Metadata = {
  title: "Media · Site content",
};

export default function AdminContentMediaPage() {
  return <MediaManager />;
}
