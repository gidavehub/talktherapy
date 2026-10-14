import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, BulletItem } from "@/components/ui/Feedback";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("community");
}

export default async function CommunityPage() {
  const { intro, planning, groundRules, meantime, cta } = await getContent("community");
  return (
    <>
      <PageIntro {...intro} stamp="TOGETHER" />

      <Section tone="surface">
        <SectionHeading eyebrow={planning.eyebrow} lines={planning.lines} lede={planning.lede} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={planning.items} columns={4} />
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <SectionHeading eyebrow={groundRules.eyebrow} lines={groundRules.lines} lede={groundRules.lede} />
          <ul className="space-y-5">
            {groundRules.items.map((rule, i) => (
              <BulletItem key={i}>{rule}</BulletItem>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="surface">
        <div className="max-w-[820px]">
          <SectionHeading eyebrow={meantime.eyebrow} lines={meantime.lines} />
          <div className="mt-8 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            {meantime.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          <Alert tone="info" className="mt-10">
            {meantime.note}
          </Alert>
        </div>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
