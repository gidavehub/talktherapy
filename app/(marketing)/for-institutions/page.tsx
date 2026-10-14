import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, StepList, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, BulletItem } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("for-institutions");
}

export default async function ForInstitutionsPage() {
  const { intro, audiences, confidentiality, gettingStarted, beyond, faq, note, cta } =
    await getContent("for-institutions");
  return (
    <>
      <PageIntro eyebrow={intro.eyebrow} lines={intro.lines} lede={intro.lede} stamp="TOGETHER">
        <Button href={intro.button.href} size="lg">
          {intro.button.label}
        </Button>
      </PageIntro>

      <Section tone="surface">
        <SectionHeading eyebrow={audiences.eyebrow} lines={audiences.lines} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={audiences.items} columns={4} />
        </div>
      </Section>

      <Section tone="dark">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
          <SectionHeading
            eyebrow={confidentiality.eyebrow}
            lines={confidentiality.lines}
            lede={confidentiality.lede}
            onDark
          />
          <ul className="space-y-5">
            {confidentiality.points.map((point, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)] shrink-0"
                />
                <span className="text-[14px] md:text-[15px] leading-relaxed text-white/75">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={gettingStarted.eyebrow} lines={gettingStarted.lines} />
        <StepList steps={gettingStarted.steps} />
      </Section>

      <Section tone="surface">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <div>
            <SectionHeading eyebrow={beyond.eyebrow} lines={beyond.lines} />
            <ul className="mt-8 space-y-5">
              {beyond.items.map((item, i) => (
                <BulletItem key={i}>{item}</BulletItem>
              ))}
            </ul>
          </div>

          <div>
            <SectionHeading eyebrow={faq.eyebrow} lines={faq.lines} />
            <div className="mt-8">
              <FAQ items={faq.items} />
            </div>
          </div>
        </div>
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
