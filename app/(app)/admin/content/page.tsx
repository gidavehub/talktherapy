import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ContentIndex from "@/components/admin/content/ContentIndex";

/** Staff: the public site's words, pictures and colours, by page. */
export const metadata: Metadata = {
  title: "Site content",
};

export default function AdminContentPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Site content"
        lines={["The public site,", "in your words."]}
        lede="Change the words, pictures and colours of TALK's public pages. Drafts save as you type; nothing changes for visitors until you publish."
      />
      <ContentIndex />
    </div>
  );
}
