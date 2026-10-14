import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, CTABlock } from "@/components/marketing/Sections";
import ResourceLibrary from "@/components/marketing/ResourceLibrary";
import { Alert } from "@/components/ui/Feedback";
import { getContent, getResources, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("resources");
}

export default async function ResourcesPage() {
  const [{ intro, note, cta }, articles] = await Promise.all([getContent("resources"), getResources()]);
  const resources = articles.map(({ id, slug, title, summary, format, topics, readingMinutes, cover }) => ({
    id,
    slug,
    title,
    summary,
    format,
    topics,
    readingMinutes,
    cover,
  }));

  return (
    <>
      <PageIntro {...intro} stamp="GROW" />

      <Section tone="surface">
        <ResourceLibrary resources={resources} />
      </Section>

      <Section>
        <Alert tone="info" className="max-w-[820px]">
          {note}
        </Alert>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
