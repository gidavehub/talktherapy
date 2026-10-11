import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import PricingPlans from "@/components/home/PricingPlans";

export const metadata: Metadata = {
  title: "Plans & pricing",
  description:
    "Free wellbeing resources, AI consultations from D200, and human sessions from D700. Pricing in Gambian Dalasi.",
};

const FAQS = [
  {
    q: "Why is the AI more expensive per minute than a human?",
    a: "Deliberately. The companion is designed as a bridge, not a destination — a way to start when talking to a person feels like too much. Pricing it this way keeps a human provider the more sensible choice for anyone who needs real support, which is the outcome we want.",
  },
  {
    q: "How do I pay?",
    a: "Payments are processed in Gambian Dalasi through Modem Pay, which supports mobile money and card payments. You pay per session; there is no subscription and nothing recurring.",
  },
  {
    q: "What if I cannot afford a session?",
    a: "The resource centre, mood tracking and journal are free and always will be. We are also working with institutions — universities, employers and NGOs — to fund sessions for their members, which is how we intend to reach people for whom cost is the barrier.",
  },
  {
    q: "Can I get a refund?",
    a: "If a provider does not attend a booked session, you are refunded in full. If you need to cancel, do so at least 24 hours ahead and you will not be charged. Cancellations inside 24 hours are at the provider's discretion.",
  },
  {
    q: "Do providers set their own rates?",
    a: "Yes, within the D700–D3,000 range, based on their qualifications, specialisation and experience. The rate is shown on every profile before you book. Talk takes a service fee from each completed session.",
  },
];

export default function PlansPage() {
  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        lines={["Pay for", "what you use."]}
        lede="No plans, no subscription. Pay with mobile money or a card. Everything preventative is free — and seeing a qualified person costs less than talking to a machine, on purpose."
      />

      <PricingPlans heading={false} />

      <Section padding="pb-12 md:pb-16 pt-0">
        <Alert tone="info" className="mx-auto max-w-[820px]">
          All prices are in Gambian Dalasi (D). Sessions are charged individually — Talk has no subscription and stores
          no card on file. The resource centre, mood check-ins and your journal are free.
        </Alert>
      </Section>

      <Section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          <SectionHeading
            eyebrow="For organisations"
            lines={["Wellbeing packages", "for your people."]}
            lede="Companies, universities, schools, NGOs and youth organisations can buy blocks of sessions for employees, students or beneficiaries. Aggregate reporting is anonymised — you see whether your programme is working, never who used it."
          />
          <div className="flex flex-col sm:flex-row md:flex-col gap-3">
            <Button href="/for-institutions" variant="secondary">
              Institutional packages
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
        lines={["Start with the", "free tier."]}
        body="Resources, mood tracking and journalling cost nothing. Upgrade only when you want to talk to someone."
        secondary={{ label: "See how it works", href: "/how-it-works" }}
      />
    </>
  );
}
