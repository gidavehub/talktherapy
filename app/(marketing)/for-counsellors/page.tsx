import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, StepList, FeatureGrid, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import { formatDalasiRange } from "@/lib/money";
import { HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR } from "@/lib/models";
import { PLATFORM_FEE_RATE } from "@/lib/money";

export const metadata: Metadata = {
  title: "For counsellors",
  description:
    "Join Talk as a verified counsellor or psychosocial support professional. Set your own rate, manage your availability, and reach people who would not otherwise walk through a door.",
};

const BENEFITS = [
  {
    title: "Set your own rate",
    body: `Choose a session fee between ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)} based on your qualifications, specialisation and experience.`,
  },
  {
    title: "Control your calendar",
    body: "Publish only the hours you want to work. Set session length, buffer time and how far ahead people can book.",
  },
  {
    title: "Reach people who would not come to you",
    body: "Many of the people on Talk would never book an in-person appointment. Distance, cost and stigma stop them long before your waiting room does.",
  },
  {
    title: "Practise, not paperwork",
    body: "Booking, reminders, payment and session notes are handled in one place, so your admin time goes down rather than up.",
  },
  {
    title: "A secure consultation room",
    body: "Private video sessions run inside the platform. No third-party meeting links, no personal phone numbers exchanged.",
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
    a: "We work with qualified counsellors, psychologists, psychosocial support practitioners, social workers and other appropriately qualified professionals. You will need to evidence your qualification and identity. If you are unsure whether your background qualifies, apply and ask — we would rather have the conversation.",
  },
  {
    q: "How much does Talk take?",
    a: `Talk retains a ${Math.round(PLATFORM_FEE_RATE * 100)}% service fee on each completed session, which covers payment processing, the platform, verification and support. The remainder is yours.`,
  },
  {
    q: "How and when am I paid?",
    a: "Session fees are collected at the time of booking and held until the session is completed. Payouts are made to your nominated account on a regular cycle, and your earnings dashboard shows what is pending and what is available.",
  },
  {
    q: "Am I employed by Talk?",
    a: "No. You practise independently, set your own rate and hours, and remain responsible for your own professional registration, insurance and clinical judgement. Talk is the platform connecting you to clients, not your employer.",
  },
  {
    q: "What happens if a client is at risk?",
    a: "Talk surfaces crisis resources to users automatically, and you have an escalation route from inside a session. Our safeguarding protocols are developed with clinical input, and we expect you to follow your own professional obligations alongside them.",
  },
  {
    q: "Can I practise in Wolof or another local language?",
    a: "Yes, and we actively want you to. Language is listed on your profile and is one of the filters people use most, because support in a second language is rarely the same thing as support.",
  },
];

export default function ForCounsellorsPage() {
  return (
    <>
      <PageIntro
        eyebrow="For counsellors"
        lines={["Your practice,", "further reach."]}
        lede="Talk connects qualified counsellors and psychosocial support professionals with people across The Gambia who need support and cannot easily get to it."
        stamp="PRACTISE"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <Button href="/sign-up?role=counsellor" size="lg">
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
        primary={{ label: "Start your application", href: "/sign-up?role=counsellor" }}
        secondary={{ label: "Ask a question", href: "/support" }}
      />
    </>
  );
}
