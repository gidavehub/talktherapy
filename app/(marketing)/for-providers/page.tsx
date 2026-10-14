import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, StepList, FeatureGrid, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import { formatDalasiRange } from "@/lib/money";
import { HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR } from "@/lib/models";
import { PLATFORM_FEE_RATE } from "@/lib/money";

export const metadata: Metadata = {
  title: "For providers",
  description:
    "Join TALK as a verified provider or psychosocial support professional. Set your own rate, manage your availability, and reach people who would not otherwise walk through a door.",
};

const BENEFITS = [
  {
    title: "Set your own rate",
    body: `Choose a session fee between ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)} based on your qualifications, specialisation and experience.`,
  },
  {
    title: "Control your calendar",
    body: "Publish only the hours you want to work, up to two weeks ahead. Each session is 45 minutes.",
  },
  {
    title: "Reach people who would not come to you",
    body: "Many of the people on TALK would never book an in-person appointment. Distance, cost and stigma stop them long before your waiting room does.",
  },
  {
    title: "Practise, not paperwork",
    body: "Booking, payment, messages and calls are handled in one place, so your admin time goes down rather than up.",
  },
  {
    title: "A secure consultation room",
    body: "Private video and voice calls run inside TALK — no personal phone numbers exchanged. If a call will not connect, you can add a Google Meet link as a fallback.",
  },
  {
    title: "Verified means something",
    body: "Because every professional is credential-checked before going live, the badge on your profile carries actual weight with clients.",
  },
];

const STEPS = [
  {
    title: "Apply",
    body: "Create an account and tell us about your practice — qualifications, specialisations, languages you work in, and the kind of support you offer.",
  },
  {
    title: "Submit your credentials",
    body: "Upload evidence of your qualifications and a form of identification. These documents are visible only to you and to the administrator reviewing them.",
  },
  {
    title: "Review",
    body: "An administrator checks your identity and qualifications. We will come back to you if anything needs clarifying rather than rejecting an application silently.",
  },
  {
    title: "Build your profile",
    body: "Write your bio, set your rate, and publish the hours you are available. You control how you are presented.",
  },
  {
    title: "Start seeing clients",
    body: "Once approved, your profile appears in the public directory and people can book you directly.",
  },
];

const FAQS = [
  {
    q: "What qualifications do I need?",
    a: "We work with qualified providers, psychologists, psychosocial support practitioners, social workers and other appropriately qualified professionals. You will need to evidence your qualification and identity. If you are unsure whether your background qualifies, apply and ask — we would rather have the conversation.",
  },
  {
    q: "How much does TALK take?",
    a: `TALK retains a ${Math.round(PLATFORM_FEE_RATE * 100)}% service fee on each completed session, which covers payment processing, the platform, verification and support. The remainder is yours.`,
  },
  {
    q: "How and when am I paid?",
    a: "People pay for a session before it happens. Twenty-four hours after it ends, your share is ready — send it from Earnings to your Wave, Afrimoney, QMoney or APS wallet whenever you like.",
  },
  {
    q: "Am I employed by TALK?",
    a: "No. You practise independently, set your own rate and hours, and remain responsible for your own professional registration, insurance and clinical judgement. TALK is the platform connecting you to clients, not your employer.",
  },
  {
    q: "What happens if a client is at risk?",
    a: "TALK gives people the emergency numbers automatically when they may be in danger. In your own sessions, follow your professional obligations — and if you are worried about someone, contact us through support.",
  },
  {
    q: "Can I work in Wolof, Mandinka or Pulaar?",
    a: "Yes — and we want you to. Choose the languages you work in on your profile: English, Wolof, Mandinka, Pulaar. TALK matches people with providers who speak their language, and the directory can be filtered by it.",
  },
];

export default function ForProvidersPage() {
  return (
    <>
      <PageIntro
        eyebrow="For providers"
        lines={["Your practice,", "further reach."]}
        lede="TALK connects qualified providers and psychosocial support professionals with people across The Gambia who need support and cannot easily get to it."
        stamp="PRACTISE"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <Button href="/sign-up?role=provider" size="lg">
            Apply to join
          </Button>
          <Button href="#how" variant="secondary" withArrow={false}>
            How it works
          </Button>
        </div>
      </PageIntro>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Why join"
          lines={["Built around how", "you actually work."]}
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={BENEFITS} columns={3} />
        </div>
      </Section>

      <Section className="scroll-mt-24" >
        <div id="how">
          <SectionHeading
            eyebrow="Applying"
            lines={["Five steps to", "your first client."]}
            lede="Verification is thorough because it is the thing that makes the directory worth trusting — for clients and for you."
          />
          <StepList steps={STEPS} />
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow="Questions" lines={["What professionals", "ask us."]} />
        <div className="mt-12">
          <FAQ items={FAQS} />
        </div>
      </Section>

      <CTABlock
        eyebrow="Apply"
        lines={["Bring your practice", "to more people."]}
        body="Applications are reviewed by a person, not a form filter."
        primary={{ label: "Start your application", href: "/sign-up?role=provider" }}
        secondary={{ label: "Ask a question", href: "/support" }}
      />
    </>
  );
}
