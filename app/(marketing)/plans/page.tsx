import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import PricingPlans from "@/components/home/PricingPlans";
import { AI_TIERS, HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR } from "@/lib/models";
import { formatDalasi, formatDalasiRange } from "@/lib/money";

// Every price on this page comes from the constants the checkout charges.
const FIRST_PRICE = formatDalasi(AI_TIERS.initial.amountMinor);
const PROVIDER_FROM = formatDalasi(HUMAN_RATE_MIN_MINOR);

export const metadata: Metadata = {
  title: "Pricing",
  description: `No plans, no subscription — pay per conversation. Free wellbeing resources, conversations with TALK from ${FIRST_PRICE}, and sessions with a provider from ${PROVIDER_FROM}. Prices in Gambian Dalasi.`,
};

const FAQS = [
  {
    q: "Why can a provider cost less per minute than TALK?",
    a: `Deliberately. At ${PROVIDER_FROM} for 45 minutes, a provider costs less per minute than TALK. TALK is designed as a bridge, not a destination — a way to start when talking to a person feels like too much. Pricing it this way keeps a provider the more sensible choice for anyone who needs real support, which is the outcome we want.`,
  },
  {
    q: "How do I pay?",
    a: "Payments are processed in Gambian Dalasi through Modem Pay, which supports mobile money and card payments. You pay per conversation and per session; there is no subscription and nothing recurring.",
  },
  {
    q: "What if I cannot afford a session?",
    a: "The resource centre, mood check-ins and your journal are free and always will be. We also want to work with institutions — universities, employers and NGOs — to fund sessions for the people they support, which is how we intend to reach people for whom cost is the barrier.",
  },
  {
    q: "Can I get a refund?",
    a: "If a session did not happen, tell us from Sessions within a day of it. A person checks, and if the provider did not come you get your money back in full. You can cancel any session before it starts; if you had already paid, write to us about a refund.",
  },
  {
    q: "Do providers set their own rates?",
    a: `Yes, within the ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)} range, based on their qualifications, specialisation and experience. The fee is shown on every profile before you book. TALK takes a service fee from each completed session.`,
  },
];

export default function PlansPage() {
  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        lines={["Pay for", "what you use."]}
        lede="No plans, no subscription — you pay for each conversation and each session, with mobile money or a card. Resources, mood check-ins and your journal are free. Minute for minute, a qualified person can cost less than TALK — on purpose."
      />

      <PricingPlans heading={false} />

      <Section padding="pb-12 md:pb-16 pt-0">
        <Alert tone="info" className="mx-auto max-w-[820px]">
          All prices are in Gambian Dalasi (D). Each conversation and each session is paid for on its own — TALK has no
          subscription and stores no card on file. The resource centre, mood check-ins and your journal are free.
        </Alert>
      </Section>

      <Section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          <SectionHeading
            eyebrow="For organisations"
            lines={["Funding sessions", "for your people."]}
            lede="Companies, universities, schools, NGOs and youth organisations can pay for sessions for the people they support. Tell us who you need to support and we will work it out with you."
          />
          <div className="flex flex-col sm:flex-row md:flex-col gap-3">
            <Button href="/for-institutions" variant="secondary">
              For institutions
            </Button>
            <Button href="/support" variant="ghost" withArrow={false}>
              Talk to us
            </Button>
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow="Questions" lines={["Pricing, plainly."]} />
        <div className="mt-12">
          <FAQ items={FAQS} />
        </div>
      </Section>

      <CTABlock
        lines={["Start with", "what is free."]}
        body={`Resources, mood check-ins and your journal cost nothing. When you want to talk, pay for that conversation — ${FIRST_PRICE} for your first with TALK.`}
        secondary={{ label: "See how it works", href: "/how-it-works" }}
      />
    </>
  );
}
