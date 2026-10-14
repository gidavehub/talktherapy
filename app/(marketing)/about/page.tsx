import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { BulletItem } from "@/components/ui/Feedback";
import { RichInlineText } from "@/lib/content/richText";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("about");
}

export default async function AboutPage() {
  const { intro, whyNow, vision, mission, objectives, longView, cta } = await getContent("about");
  return (
    <>
      <PageIntro {...intro} stamp="TALK" />

      <Section tone="surface">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <SectionHeading eyebrow={whyNow.eyebrow} lines={whyNow.lines} lede={whyNow.lede} />
          <div className="space-y-6">
            {whyNow.paragraphs.map((paragraph, i) => (
              <p key={i} className="text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-14 md:mt-20">
          <FeatureGrid items={whyNow.barriers} columns={3} />
        </div>
      </Section>

      <Section tone="dark">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          {[vision, mission].map((block, i) => (
            <div key={i}>
              <SectionHeading eyebrow={block.eyebrow} lines={block.lines} onDark size="panel" />
              <p className="mt-5 text-[14px] md:text-[16px] leading-relaxed text-white/70">{block.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={objectives.eyebrow} lines={objectives.lines} />
        <ul className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-5 max-w-[1100px]">
          {objectives.items.map((objective, i) => (
            <BulletItem key={i}>{objective}</BulletItem>
          ))}
        </ul>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow={longView.eyebrow} lines={longView.lines} lede={longView.lede} />
        {/* Bold words in the closing line are set in terracotta: "I need to talk". */}
        <p className="mt-10 text-[24px] md:text-[34px] leading-[1.15] font-display font-medium max-w-[760px]">
          <RichInlineText source={longView.ambition} classes={{ strong: "stamp text-[var(--accent)]" }} />
        </p>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
