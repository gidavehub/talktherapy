import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import PricingPlans from "@/components/home/PricingPlans";
import { getContent, pageMetadata } from "@/lib/content/server";

// Every price on this page, and in its description, is a placeholder in the
// content, filled on the server from the constants the checkout charges.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("plans");
}

export default async function PlansPage() {
  const { intro, first, provider, longer, note, organisations, faq, cta } = await getContent("plans");
  return (
    <>
      <PageIntro {...intro} />

      <PricingPlans cards={{ first, provider, longer }} />

      <Section padding="pb-12 md:pb-16 pt-0">
        <Alert tone="info" className="mx-auto max-w-[820px]">
          {note}
        </Alert>
      </Section>

      <Section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          <SectionHeading eyebrow={organisations.eyebrow} lines={organisations.lines} lede={organisations.lede} />
          <div className="flex flex-col sm:flex-row md:flex-col gap-3">
            <Button href={organisations.primary.href} variant="secondary">
              {organisations.primary.label}
            </Button>
            <Button href={organisations.secondary.href} variant="ghost" withArrow={false}>
              {organisations.secondary.label}
            </Button>
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow={faq.eyebrow} lines={faq.lines} />
        <div className="mt-12">
          <FAQ items={faq.items} />
        </div>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
