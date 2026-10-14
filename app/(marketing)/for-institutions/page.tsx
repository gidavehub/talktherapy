import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, StepList, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, BulletItem } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "For institutions",
  description:
    "Fund sessions for the people you support — companies, universities, schools, NGOs and youth organisations in The Gambia. Agreed with you, and never at the cost of anyone's privacy.",
};

const AUDIENCES = [
  {
    title: "Companies",
    body: "Give employees confidential support for workplace stress, burnout and life outside work, without routing it through HR.",
  },
  {
    title: "Universities & schools",
    body: "Extend student wellbeing provision beyond a single overstretched provider, with support available outside office hours.",
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
    title: "Agree what to fund",
    body: "Pay for sessions for the people you support — we will work out the details with you.",
  },
  {
    title: "Tell your people",
    body: "They join with their own private account — their data belongs to them, not to you.",
  },
  {
    title: "See whether it is working",
    body: "We can share anonymised, aggregate numbers once enough people take part — never who used it.",
  },
];

const PRIVACY_POINTS = [
  "You never see who booked a session, when, or with whom.",
  "You never see mood scores, journal entries or session content.",
  "Any reporting is aggregate only, and is held back entirely below a minimum group size.",
  "Members can leave your programme and keep their account and their data.",
];

const FAQS = [
  {
    q: "Will we be able to see which employees used it?",
    a: "No — and this is not a setting that can be turned on. If people believed their employer could see that they booked a session, they would not book one, and the programme would fail. Aggregate numbers are held back below a minimum group size so that small teams cannot be worked out.",
  },
  {
    q: "What does it cost?",
    a: "It depends on how many people you want to support and how many sessions you want to fund. Talk to us with a rough headcount and we will put a proposal together.",
  },
  {
    q: "Can we fund a pool of sessions rather than everyone?",
    a: "Yes. A pool of sessions that anyone you support can draw on works well when you expect a minority to use it but want it there for everyone. We will agree the details with you.",
  },
  {
    q: "Do you work with organisations outside The Gambia?",
    a: "Our provider network is currently Gambian, so the service is most useful for people in-country. Talk to us about regional needs and we will be straight with you about what we can cover today.",
  },
];

export default function ForInstitutionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="For institutions"
        lines={["Support your people", "without surveilling", "them."]}
        lede="Funded sessions for companies, universities, schools, NGOs and youth organisations — built so that the people you are supporting can actually trust it."
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
                Access to the full verified provider directory, filterable by
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
                A named contact at TALK for onboarding and ongoing questions.
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
          Funding through institutions is how we intend to reach people for whom
          cost is the barrier. If you are a funder or development partner
          interested in paying for access for many people at once, we would like
          to hear from you.
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
