import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, StepList, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, BulletItem } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "For institutions",
  description:
    "Wellbeing packages for companies, universities, schools, NGOs and youth organisations in The Gambia — with anonymised reporting that never identifies individuals.",
};

const AUDIENCES = [
  {
    title: "Companies",
    body: "Give employees confidential support for workplace stress, burnout and life outside work, without routing it through HR.",
  },
  {
    title: "Universities & schools",
    body: "Extend student wellbeing provision beyond a single overstretched counsellor, with support available outside office hours.",
  },
  {
    title: "NGOs & development partners",
    body: "Provide psychosocial support to beneficiaries and to the staff delivering difficult frontline work.",
  },
  {
    title: "Youth organisations",
    body: "Reach young people in the format they already use, on the device already in their hand.",
  },
];

const STEPS = [
  {
    title: "Tell us who you need to support",
    body: "How many people, what kind of pressures they face, and what you already have in place. We would rather complement existing provision than duplicate it.",
  },
  {
    title: "Choose a package",
    body: "Buy a block of seats or a pool of sessions. Members redeem against it without ever seeing a bill.",
  },
  {
    title: "Invite your members",
    body: "Send invite links or codes. People join with their own private account — their data belongs to them, not to you.",
  },
  {
    title: "See whether it is working",
    body: "Aggregate, anonymised reporting shows uptake and broad wellbeing trends across the cohort, with small groups suppressed so no one can be identified.",
  },
];

const PRIVACY_POINTS = [
  "You never see who booked a session, when, or with whom.",
  "You never see mood scores, journal entries or session content.",
  "Reporting is aggregate only, and is suppressed entirely below a minimum cohort size.",
  "Members can leave your programme and keep their account and their data.",
];

const FAQS = [
  {
    q: "Will we be able to see which employees used it?",
    a: "No — and this is not a setting that can be turned on. If people believed their employer could see that they booked a counselling session, they would not book one, and the programme would fail. Aggregate reporting is suppressed below a minimum cohort size so that small teams cannot be reverse-engineered.",
  },
  {
    q: "What does it cost?",
    a: "Pricing depends on the number of seats and how many sessions are included. Talk to us with a rough headcount and we will put a proposal together.",
  },
  {
    q: "Can we fund sessions without buying seats for everyone?",
    a: "Yes. Some organisations buy a pool of sessions that any member can draw on, which works well when you expect a minority to use it but want it available to everyone.",
  },
  {
    q: "Do you work with organisations outside The Gambia?",
    a: "Our counsellor network is currently Gambian, so the service is most useful for people in-country. Talk to us about regional needs and we will be straight with you about what we can cover today.",
  },
];

export default function ForInstitutionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="For institutions"
        lines={["Support your people", "without surveilling", "them."]}
        lede="Wellbeing packages for companies, universities, schools, NGOs and youth organisations — built so that the people you are supporting can actually trust it."
        stamp="TOGETHER"
      >
        <Button href="/support?intent=organisation" size="lg">
          Request a proposal
        </Button>
      </PageIntro>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Who it is for"
          lines={["Four kinds of", "organisation."]}
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={AUDIENCES} columns={4} />
        </div>
      </Section>

      <Section tone="dark">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
          <SectionHeading
            eyebrow="The hard part"
            lines={["Confidentiality is", "not negotiable."]}
            lede="The single fastest way to kill a workplace wellbeing programme is for staff to suspect their manager can see who used it. So we made that structurally impossible rather than promising not to."
            onDark
          />
          <ul className="space-y-5">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-4">
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
        <SectionHeading
          eyebrow="Getting started"
          lines={["Four steps to", "a live programme."]}
        />
        <StepList steps={STEPS} />
      </Section>

      <Section tone="surface">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <div>
            <SectionHeading
              eyebrow="What you get"
              lines={["Beyond the", "sessions."]}
            />
            <ul className="mt-8 space-y-5">
              <BulletItem>
                Access to the full verified counsellor directory, filterable by
                language and specialisation.
              </BulletItem>
              <BulletItem>
                The free wellbeing resource centre for every member, whether or
                not they ever book a session.
              </BulletItem>
              <BulletItem>
                Awareness material you can use internally to let people know the
                programme exists.
              </BulletItem>
              <BulletItem>
                A named contact at Talk for onboarding and ongoing questions.
              </BulletItem>
            </ul>
          </div>

          <div>
            <SectionHeading eyebrow="Questions" lines={["Common ones."]} />
            <div className="mt-8">
              <FAQ items={FAQS} />
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <Alert tone="info" className="max-w-[820px]">
          Institutional packages are how we intend to reach people for whom cost
          is the barrier. If you are a funder or development partner interested
          in underwriting access rather than buying seats, we would like to hear
          from you.
        </Alert>
      </Section>

      <CTABlock
        eyebrow="Get in touch"
        lines={["Tell us who you", "need to support."]}
        body="Send a rough headcount and what you already have in place, and we will come back with a proposal."
        primary={{ label: "Request a proposal", href: "/support?intent=organisation" }}
        secondary={{ label: "See pricing", href: "/plans" }}
      />
    </>
  );
}
