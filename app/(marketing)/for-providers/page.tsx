import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, StepList, FeatureGrid, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("for-providers");
}

/**
 * Where every join button goes: the application, where a provider's account
 * is made beside everything they need to know. Code's, not content's — only
 * the buttons' words are editable.
 */
const APPLY_HREF = "/apply";

export default async function ForProvidersPage() {
  const { intro, why, applying, faq, cta } = await getContent("for-providers");
  return (
    <>
      <PageIntro eyebrow={intro.eyebrow} lines={intro.lines} lede={intro.lede} stamp="PRACTISE">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button href={APPLY_HREF} size="lg">
            {intro.joinLabel}
          </Button>
          <Button href="#how" variant="secondary" withArrow={false}>
            {intro.howLabel}
          </Button>
        </div>
      </PageIntro>

      <Section tone="surface">
        <SectionHeading eyebrow={why.eyebrow} lines={why.lines} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={why.benefits} columns={3} />
        </div>
      </Section>

      <Section className="scroll-mt-24">
        <div id="how">
          <SectionHeading eyebrow={applying.eyebrow} lines={applying.lines} lede={applying.lede} />
          <StepList steps={applying.steps} />
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow={faq.eyebrow} lines={faq.lines} />
        <div className="mt-12">
          <FAQ items={faq.items} />
        </div>
      </Section>

      <CTABlock
        eyebrow={cta.eyebrow}
        lines={cta.lines}
        body={cta.body}
        primary={{ label: cta.joinLabel, href: APPLY_HREF }}
        secondary={cta.secondary}
      />
    </>
  );
}
