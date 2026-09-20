import type { Metadata } from "next";
import Link from "next/link";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Safety & ethics",
  description:
    "How Talk protects the people who use it — professional verification, crisis escalation, AI boundaries and human oversight.",
};

const COMMITMENTS = [
  {
    title: "Professional verification",
    body: "Counsellors submit identity documents and qualification evidence before their profile can go live. An administrator reviews every application. An unverified profile is invisible to patients — not merely flagged.",
  },
  {
    title: "Human oversight of AI",
    body: "The AI companion supports; it does not treat. Its scope is explicit, its limits are stated on screen, and escalation to a human is built into the end of every conversation.",
  },
  {
    title: "Crisis escalation",
    body: "Where a conversation indicates possible immediate risk, emergency contacts are shown immediately and synchronously. We do not rely on a queue being watched to keep someone safe.",
  },
  {
    title: "Confidentiality by default",
    body: "Journal entries and mood check-ins are visible only to you. Counsellors see what you choose to share in a session, and nothing else.",
  },
  {
    title: "Reporting",
    body: "Any session, professional or interaction can be reported. Reports are reviewed, and a counsellor can be suspended from the directory pending investigation.",
  },
  {
    title: "Ongoing review",
    body: "AI responses are audited for safety, bias and cultural relevance. Safeguarding protocols are developed with clinical input rather than written by engineers alone.",
  },
];

export default function SafetyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Safety & ethics"
        lines={["Trust is", "the product."]}
        lede="Talk handles some of the most sensitive information a person can share. Safety is treated as a foundational design requirement rather than something added once the features work."
        stamp="SAFE"
      />

      <Section tone="surface">
        <SectionHeading
          eyebrow="Our commitments"
          lines={["Six things we hold", "ourselves to."]}
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={COMMITMENTS} columns={3} />
        </div>
      </Section>

      <Section>
        <div className="max-w-[820px]">
          <SectionHeading
            eyebrow="Limits"
            lines={["What Talk", "cannot do."]}
            lede="Being clear about this is part of being safe. A platform that overstates its reach puts people at risk."
          />

          <div className="mt-10 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            <p>
              <strong className="font-medium text-[var(--foreground)]">
                Talk is not an emergency service.
              </strong>{" "}
              Nobody is monitoring the platform around the clock waiting to
              intervene. If you are in danger, the fastest route to help is a
              phone call to the emergency services, not a message here.
            </p>
            <p>
              <strong className="font-medium text-[var(--foreground)]">
                The AI cannot assess risk reliably.
              </strong>{" "}
              Automated detection misses things and over-triggers on others. It
              is a prompt to surface help, never a clinical judgement.
            </p>
            <p>
              <strong className="font-medium text-[var(--foreground)]">
                Verification is not a guarantee of outcome.
              </strong>{" "}
              We check that a counsellor is who they say they are and holds the
              qualifications they claim. We cannot guarantee that any particular
              professional is the right fit for you — and you are free to change.
            </p>
          </div>

          <Alert tone="crisis" title="In immediate danger?" className="mt-10">
            Call 117 for police or 116 for an ambulance.{" "}
            <Link href="/crisis" className="underline underline-offset-4">
              See all crisis contacts
            </Link>
            .
          </Alert>
        </div>
      </Section>

      <Section tone="dark">
        <div className="max-w-[820px]">
          <SectionHeading
            eyebrow="Escalation"
            lines={["What happens if", "you are at risk."]}
            onDark
          />
          <ol className="mt-10 space-y-6">
            {[
              "The conversation stops. The companion does not continue a wellbeing exercise over a disclosure of immediate danger.",
              "Emergency contacts appear on screen immediately, with tap-to-call numbers.",
              "You are encouraged to contact someone you trust, and offered help finding a professional.",
              "Where appropriate and legally permitted, the case enters a review queue so a human can follow up.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-5">
                <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px] font-medium">
                  {i + 1}
                </span>
                <p className="pt-1.5 text-[14px] md:text-[15px] leading-relaxed text-white/75">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <CTABlock
        eyebrow="Related"
        lines={["How your data", "is handled."]}
        body="Data minimisation, encryption, retention and your rights — written to be read."
        primary={{ label: "Privacy policy", href: "/privacy" }}
        secondary={{ label: "Report a concern", href: "/support" }}
      />
    </>
  );
}
