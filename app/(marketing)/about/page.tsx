import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { BulletItem } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "About Talk",
  description:
    "Talk is a mental wellbeing, counselling and psychosocial support platform for The Gambia — built so that asking for help becomes easier.",
};

const OBJECTIVES = [
  "Improve access to mental wellbeing and psychosocial support.",
  "Provide a safe digital space for emotional reflection and early support.",
  "Connect people with qualified counsellors and psychosocial professionals.",
  "Reduce the barriers and stigma around seeking support.",
  "Make credible wellbeing information freely available.",
  "Use AI responsibly, to complement rather than replace human expertise.",
  "Encourage help-seeking before challenges become severe.",
  "Build wider awareness of mental wellbeing and self-care.",
];

const BARRIERS = [
  {
    title: "Stigma",
    body: "Seeking mental health support still carries a social cost. Many people would rather carry something alone than be seen asking.",
  },
  {
    title: "Cost and distance",
    body: "Professional counselling is expensive and concentrated in a few places. For most people it is simply not within reach.",
  },
  {
    title: "Not knowing where to start",
    body: "Even people who want support often have no idea who to approach, what it would involve, or whether their situation 'counts'.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        lines={["Somewhere safe", "to begin."]}
        lede="Talk is a mental wellbeing, counselling and psychosocial support platform for The Gambia. It exists to shorten the distance between the moment someone realises they need support and the moment they actually receive it."
        stamp="TALK"
      />

      <Section tone="surface">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
          <SectionHeading
            eyebrow="Why now"
            lines={["The gap is not", "only about supply."]}
            lede="Academic pressure, unemployment, workplace stress, grief, relationship difficulties, loneliness and uncertainty are widely felt. Support for them is not widely reached."
          />
          <div className="space-y-6">
            <p className="text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
              There is a real and growing need for mental health and
              psychosocial support, particularly among young people. But the
              distance between needing help and receiving it is not explained by
              a shortage of professionals alone.
            </p>
            <p className="text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
              It is also cost, stigma, awareness, geography, and the very
              ordinary fear of being judged. Technology cannot fix all of that.
              It can make the first step considerably smaller.
            </p>
          </div>
        </div>

        <div className="mt-14 md:mt-20">
          <FeatureGrid items={BARRIERS} columns={3} />
        </div>
      </Section>

      <Section tone="dark">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          <div>
            <SectionHeading
              eyebrow="Vision"
              lines={["An ecosystem", "people trust."]}
              onDark
              size="panel"
            />
            <p className="mt-5 text-[14px] md:text-[16px] leading-relaxed text-white/70">
              To build an accessible and trusted digital ecosystem where anyone
              can find a safe space to talk, receive support, and connect with
              appropriate professional care when they need it — and in doing so,
              to become the central mental health and psychosocial support
              provider for The Gambia.
            </p>
          </div>
          <div>
            <SectionHeading
              eyebrow="Mission"
              lines={["Responsible tech,", "human expertise."]}
              onDark
              size="panel"
            />
            <p className="mt-5 text-[14px] md:text-[16px] leading-relaxed text-white/70">
              To use responsible technology and human expertise to make mental
              wellbeing, counselling and psychosocial support more accessible,
              affordable, confidential and responsive to the realities of
              everyday life.
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Objectives"
          lines={["What we are", "trying to do."]}
        />
        <ul className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-5 max-w-[1100px]">
          {OBJECTIVES.map((objective) => (
            <BulletItem key={objective}>{objective}</BulletItem>
          ))}
        </ul>
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="The long view"
          lines={["Not another", "technology platform."]}
          lede="Over time Talk could grow into a wider digital wellbeing ecosystem — multilingual support, locally relevant content, moderated peer communities, corporate and university programmes, and research partnerships. Expansion into other African markets could follow once the model has been responsibly validated at home."
        />
        <p className="mt-10 text-[24px] md:text-[34px] leading-[1.15] tracking-tight font-medium max-w-[760px]">
          The ambition is to build an environment where asking for help becomes
          easier — and where saying{" "}
          <span className="stamp text-[var(--accent)]">“I need to talk”</span>{" "}
          is met with somewhere safe to begin.
        </p>
      </Section>

      <CTABlock
        eyebrow="Join us"
        lines={["Listen. Support.", "Heal. Grow."]}
        body="Whether you need support, provide it, or want to bring it to your organisation."
        secondary={{ label: "Partner with us", href: "/support" }}
      />
    </>
  );
}
