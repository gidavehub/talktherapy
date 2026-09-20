import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, CTABlock } from "@/components/marketing/Sections";
import ResourceLibrary from "@/components/marketing/ResourceLibrary";
import { Alert } from "@/components/ui/Feedback";
import { SEED_RESOURCES } from "@/lib/resources-seed";

export const metadata: Metadata = {
  title: "Wellbeing resources",
  description:
    "Free articles and exercises on stress, grief, sleep, academic pressure and emotional regulation. No account needed.",
};

export default function ResourcesPage() {
  const resources = SEED_RESOURCES.filter((r) => r.status === "published").map(
    ({ id, slug, title, summary, format, topics, readingMinutes }) => ({
      id,
      slug,
      title,
      summary,
      format,
      topics,
      readingMinutes,
    }),
  );

  return (
    <>
      <PageIntro
        eyebrow="Resource centre"
        lines={["Free, and", "free to browse."]}
        lede="Practical material on the things people actually carry — stress, grief, sleep, study pressure, and the ordinary difficulty of managing your own head. No account required."
        stamp="GROW"
      />

      <Section tone="surface">
        <ResourceLibrary resources={resources} />
      </Section>

      <Section>
        <Alert tone="info" className="max-w-[820px]">
          These resources are general information, not medical advice or
          treatment. They are not a substitute for speaking with a qualified
          professional about your own situation.
        </Alert>
      </Section>

      <CTABlock
        eyebrow="Beyond reading"
        lines={["Some things need", "a conversation."]}
        body="When an article is not enough, you can book a session with a verified counsellor."
        primary={{ label: "Find a counsellor", href: "/therapists" }}
        secondary={{ label: "See pricing", href: "/plans" }}
      />
    </>
  );
}
