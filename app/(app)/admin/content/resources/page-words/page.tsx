import type { Metadata } from "next";
import SectionEditor from "@/components/admin/content/SectionEditor";

/**
 * Staff: the resource centre's own page — its heading, the note under the
 * library, the closing panel. The "resources" section of the site content,
 * edited here because /admin/content/resources is the resource centre.
 */
export const metadata: Metadata = {
  title: "The page around the library · Resource centre",
};

export default function AdminContentResourcesPageWords() {
  return (
    <SectionEditor
      id="resources"
      parent={{ label: "Resource centre", href: "/admin/content/resources", here: "The page around the library" }}
    />
  );
}
