import type { Metadata } from "next";
import Link from "next/link";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert } from "@/components/ui/Feedback";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("safety");
}

// "Not an emergency service", the emergency notice and what happens if
// someone is at risk stay in code on this page: they are safety wording, not
// copy, and must never be one edit away from being wrong.
export default async function SafetyPage() {
  const { intro, commitments, limits, cta } = await getContent("safety");
  return (
    <>
      <PageIntro {...intro} stamp="SAFE" />

      <Section tone="surface">
        <SectionHeading eyebrow={commitments.eyebrow} lines={commitments.lines} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={commitments.items} columns={3} />
        </div>
      </Section>

      <Section>
        <div className="max-w-[820px]">
          <SectionHeading eyebrow={limits.eyebrow} lines={limits.lines} lede={limits.lede} />

          <div className="mt-10 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            <p>
              <strong className="font-medium text-[var(--foreground)]">
                TALK is not an emergency service.
              </strong>{" "}
              Nobody is monitoring the platform around the clock waiting to
              intervene. If you are in danger, the fastest route to help is a
              phone call to the emergency services, not a message here.
            </p>
            {limits.items.map((limit, i) => (
              <p key={i}>
                <strong className="font-medium text-[var(--foreground)]">{limit.lead}</strong>{" "}
                {limit.body}
              </p>
            ))}
          </div>

          <Alert tone="crisis" title="In immediate danger?" className="mt-10">
            Call 117 for police or 116 for an ambulance.{" "}
            <Link href="/crisis" className="underline underline-offset-4">
              See all emergency contacts
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
              "TALK stops what she was doing, says the emergency numbers out loud in your language, and asks whether you are safe right now.",
              "Emergency contacts appear on screen immediately, with tap-to-call numbers, and stay there for the rest of the conversation.",
              "You are encouraged to contact someone you trust, and offered help finding a professional.",
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

      <CTABlock {...cta} />
    </>
  );
}
