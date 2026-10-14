import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import SectionEditor from "@/components/admin/content/SectionEditor";
import { SECTIONS, isSectionId } from "@/lib/content/schema";

/** Staff: one part of the public site, edited. Next 16 — `params` is a Promise. */
export async function generateMetadata(props: PageProps<"/admin/content/[section]">): Promise<Metadata> {
  const { section } = await props.params;
  return { title: isSectionId(section) ? `${SECTIONS[section].label} · Site content` : "Site content" };
}

export default async function AdminContentSectionPage(props: PageProps<"/admin/content/[section]">) {
  const { section } = await props.params;
  if (!isSectionId(section)) notFound();
  // The colours have an editor of their own.
  if (section === "theme") redirect("/admin/content/theme");
  // Keyed, so moving from one section to another starts a fresh editor.
  return <SectionEditor key={section} id={section} />;
}
