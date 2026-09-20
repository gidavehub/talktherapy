import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, BulletItem } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Moderated peer support is on the Talk roadmap. Here is what we are planning, and why we are taking our time over it.",
};

const PLANS = [
  {
    title: "Anonymous by default",
    body: "No real names, no profile photos, no connection to your counselling history. Peer support only works if people can be honest without being identifiable.",
  },
  {
    title: "Professionally moderated",
    body: "Moderated by qualified practitioners, not volunteers. An unmoderated mental health forum does real harm, and we would rather not launch than launch that.",
  },
  {
    title: "Topic-based, not open-ended",
    body: "Spaces organised around specific experiences — grief, academic pressure, workplace stress — rather than one general feed where everything competes.",
  },
  {
    title: "Escalation built in",
    body: "The same crisis pathway as the rest of the platform. A post indicating risk surfaces emergency resources immediately and reaches a moderator.",
  },
];

const PRINCIPLES = [
  "Nobody's counselling history is ever visible in a community space.",
  "Moderators are qualified practitioners, and are identified as such.",
  "No advice-giving between peers on medication or treatment.",
  "Reporting a post is one tap, and reports are read by a person.",
  "Spaces stay small enough to be genuinely moderated.",
];

export default function CommunityPage() {
  return (
    <>
      <PageIntro
        eyebrow="Community"
        lines={["Not yet — and", "that is deliberate."]}
        lede="Moderated peer support is on the Talk roadmap. It is not live, because an unmoderated mental health community causes more harm than it prevents, and we would rather build it properly than quickly."
        stamp="TOGETHER"
      />

      <Section tone="surface">
        <SectionHeading
          eyebrow="What we are planning"
          lines={["Four commitments", "we are designing", "around."]}
          lede="Peer support is genuinely valuable — hearing from someone who has been where you are does something a professional cannot. But the format has to earn that."
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={PLANS} columns={4} />
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <SectionHeading
            eyebrow="Ground rules"
            lines={["Decided before", "we build it."]}
            lede="Writing the rules after a community exists means writing them in response to something that already went wrong."
          />
          <ul className="space-y-5">
            {PRINCIPLES.map((principle) => (
              <BulletItem key={principle}>{principle}</BulletItem>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="surface">
        <div className="max-w-[820px]">
          <SectionHeading
            eyebrow="In the meantime"
            lines={["What is available", "today."]}
          />
          <div className="mt-8 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            <p>
              The wellbeing resource centre is free and open to everyone, with
              no account required. Mood check-ins and the private journal are
              also free once you have an account.
            </p>
            <p>
              If you want to talk to someone, the counsellor directory is
              browsable without signing up, so you can see who is available and
              what they charge before committing to anything.
            </p>
          </div>

          <Alert tone="info" className="mt-10">
            Want to be told when community spaces open? Send us a message
            through support and we will let you know.
          </Alert>
        </div>
      </Section>

      <CTABlock
        eyebrow="Today"
        lines={["Start with what", "is already here."]}
        body="Free resources, private wellbeing tools, and verified counsellors."
        primary={{ label: "Browse resources", href: "/resources" }}
        secondary={{ label: "Tell me when it launches", href: "/support" }}
      />
    </>
  );
}
