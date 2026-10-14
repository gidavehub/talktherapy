import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, Prose, CTABlock } from "@/components/marketing/Sections";
import { Alert } from "@/components/ui/Feedback";
import RichText, { type RichTextClasses } from "@/lib/content/richText";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("privacy");
}

/** Formatted text inside an alert: the alert's own size and colour, links underlined as they always were. */
const NOTE_CLASSES: RichTextClasses = {
  paragraph: "",
  list: "list-disc space-y-1 pl-5",
  orderedList: "list-decimal space-y-1 pl-5",
  link: "underline underline-offset-4",
};

export default async function PrivacyPage() {
  const { intro, body, note, cta } = await getContent("privacy");
  return (
    <>
      <PageIntro {...intro} stamp="PRIVATE" />

      <Section tone="surface">
        <Prose source={body} />

        <Alert tone="info" className="mt-16 max-w-[760px]">
          <RichText source={note} className="space-y-2" classes={NOTE_CLASSES} />
        </Alert>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
