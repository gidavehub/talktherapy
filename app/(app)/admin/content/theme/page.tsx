import type { Metadata } from "next";
import ThemeEditor from "@/components/admin/content/ThemeEditor";

/** Staff: the public site's colours. */
export const metadata: Metadata = {
  title: "Colours · Site content",
};

export default function AdminContentThemePage() {
  return <ThemeEditor />;
}
