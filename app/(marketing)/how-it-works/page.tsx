import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, StepList, FeatureGrid, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import {
  IconCalendar,
  IconChat,
  IconHeart,
  IconJournal,
  IconLock,
  IconMood,
  IconOrb,
  IconPeople,
  IconResources,
  IconShield,
} from "@/components/ui/icons";
import type { IconName } from "@/lib/content/schema";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("how-it-works");
}

/** The icon each "way in" card can carry, by the name the content stores. */
const ICONS: Record<IconName, ReactNode> = {
  orb: <IconOrb />,
  people: <IconPeople />,
  resources: <IconResources />,
  mood: <IconMood />,
  journal: <IconJournal />,
  chat: <IconChat />,
  calendar: <IconCalendar />,
  shield: <IconShield />,
  heart: <IconHeart />,
  lock: <IconLock />,
};

/**
 * Set in code, never content, and always last: the emergency numbers must not
 * be one edit away from being wrong.
 */
const CRISIS_QUESTION = {
  q: "What if I am in crisis?",
  a: "TALK is not an emergency service, and nobody is watching the app. If you or someone else is in immediate danger, call 117 for police or 116 for an ambulance — both are free to call. Our emergency contacts page lists every number.",
};

export default async function HowItWorksPage() {
  const { intro, journey, ways, faq, cta } = await getContent("how-it-works");
  return (
    <>
      <PageIntro {...intro} stamp="LISTEN" />

      <Section tone="surface">
        <SectionHeading eyebrow={journey.eyebrow} lines={journey.lines} lede={journey.lede} />
        <StepList steps={journey.steps} />
      </Section>

      <Section>
        <SectionHeading eyebrow={ways.eyebrow} lines={ways.lines} lede={ways.lede} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={ways.items.map((item) => ({ ...item, icon: ICONS[item.icon] }))} columns={4} />
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow={faq.eyebrow} lines={faq.lines} />
        <div className="mt-12">
          <FAQ items={[...faq.items, CRISIS_QUESTION]} />
        </div>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
