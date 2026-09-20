import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { CheckItem, Badge, Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { AI_TIERS, HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR } from "@/lib/models";
import { formatDalasi, formatDalasiRange } from "@/lib/money";

export const metadata: Metadata = {
  title: "Plans & pricing",
  description:
    "Free wellbeing resources, AI consultations from D250, and human counselling sessions from D700. Pricing in Gambian Dalasi.",
};

const TIERS = [
  {
    name: "Resource centre",
    price: "Free",
    cadence: "always",
    blurb:
      "Articles, audio exercises and guided reflections on stress, grief, relationships, study and work pressure.",
    features: [
      "Full wellbeing resource library",
      "Mood check-ins and private journal",
      "Breathing and grounding exercises",
      "No card required",
    ],
    cta: { label: "Create a free account", href: "/sign-up" },
    featured: false,
  },
  {
    name: "Human counselling",
    price: formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR),
    cadence: "per session",
    blurb:
      "A confidential consultation with a credential-verified counsellor or psychosocial support professional.",
    features: [
      "45–60 minute private video session",
      "Choose your counsellor by specialisation and language",
      "Every professional credential-verified",
      "Book follow-ups with the same person",
      "Rate set by the individual professional",
    ],
    cta: { label: "Browse counsellors", href: "/therapists" },
    featured: true,
  },
  {
    name: "AI companion",
    price: formatDalasi(AI_TIERS.initial.amountMinor),
    cadence: "first consultation",
    blurb:
      "An initial 5–7 minute conversation with the AI companion, ending with a referral to a human professional.",
    features: [
      "Private, judgement-free first conversation",
      "Guided reflection and grounding",
      `Longer ${Math.round(AI_TIERS.extended.durationSec / 60)}-minute sessions at ${formatDalasi(AI_TIERS.extended.amountMinor)}`,
      "Always clearly labelled as AI",
    ],
    cta: { label: "Learn about the companion", href: "/technology" },
    featured: false,
  },
];

const FAQS = [
  {
    q: "Why is the AI more expensive per minute than a human?",
    a: "Deliberately. The companion is designed as a bridge, not a destination — a way to start when talking to a person feels like too much. Pricing it this way keeps a human counsellor the more sensible choice for anyone who needs real support, which is the outcome we want.",
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
    a: "If a counsellor does not attend a booked session, you are refunded in full. If you need to cancel, do so at least 24 hours ahead and you will not be charged. Cancellations inside 24 hours are at the counsellor's discretion.",
  },
  {
    q: "Do counsellors set their own rates?",
    a: "Yes, within the D700–D3,000 range, based on their qualifications, specialisation and experience. The rate is shown on every profile before you book. Talk takes a service fee from each completed session.",
  },
];

export default function PlansPage() {
  return (
    <>
      <PageIntro
        eyebrow="Plans"
        lines={["Priced so the right", "choice is affordable."]}
        lede="Everything preventative is free. Where support costs money, it costs less to see a qualified human than to keep talking to a machine — and that is on purpose."
        stamp="PLANS"
      />

      <Section tone="surface">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-[28px] p-6 md:p-8 flex flex-col ${
                tier.featured
                  ? "bg-[var(--dark)] text-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.5)] md:-mt-4 md:mb-4"
                  : "bg-[var(--background)] shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)]"
              }`}
            >
              {tier.featured ? (
                <span className="absolute -top-3 left-6">
                  <Badge tone="accent">Most chosen</Badge>
                </span>
              ) : null}

              <p
                className={`text-[12px] uppercase tracking-[0.18em] ${
                  tier.featured ? "opacity-70" : "text-[var(--muted)]"
                }`}
              >
                {tier.name}
              </p>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-[34px] md:text-[42px] leading-none font-medium tracking-tight">
                  {tier.price}
                </span>
                <span className="text-[12px] opacity-60">{tier.cadence}</span>
              </div>

              <p
                className={`mt-4 text-[13px] leading-relaxed ${
                  tier.featured ? "text-white/75" : "text-[var(--muted)]"
                }`}
              >
                {tier.blurb}
              </p>

              <ul className="mt-6 space-y-3 flex-1">
                {tier.features.map((feature) => (
                  <CheckItem key={feature} onDark={tier.featured}>
                    {feature}
                  </CheckItem>
                ))}
              </ul>

              <div className="mt-8">
                <Button
                  href={tier.cta.href}
                  variant={tier.featured ? "primary" : "secondary"}
                  fullWidth
                  withArrow={false}
                >
                  {tier.cta.label}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Alert tone="info" className="mt-10 max-w-[820px]">
          All prices are in Gambian Dalasi (D). Sessions are charged individually
          — Talk has no subscription and stores no card on file.
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
