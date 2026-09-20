import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { CheckItem, Alert } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Technology",
  description:
    "How Talk uses AI — what it does, what it deliberately does not do, and the boundaries it operates within.",
};

const CAN_DO = [
  "Emotional check-ins and guided reflection",
  "Journalling prompts",
  "Stress-management, breathing and grounding exercises",
  "General psychoeducation about wellbeing",
  "Helping you identify what kind of support might help",
  "Guiding you toward booking a human counsellor",
];

const WILL_NOT_DO = [
  "Diagnose a mental health condition",
  "Prescribe or recommend treatment or medication",
  "Represent itself as a human therapist",
  "Replace a qualified professional",
  "Respond to an emergency",
  "Use what you share to train advertising models",
];

const PRINCIPLES = [
  {
    title: "Human oversight",
    body: "AI complements professional support; it does not stand in for a practitioner. Qualified humans remain central to counselling and to any higher-risk situation.",
  },
  {
    title: "Clear disclosure",
    body: "You always know when you are talking to AI. It is labelled on screen throughout the conversation, not buried in terms you agreed to once.",
  },
  {
    title: "Crisis escalation",
    body: "Where a conversation suggests possible immediate danger, the platform surfaces emergency and crisis resources straight away rather than continuing the conversation.",
  },
  {
    title: "Defined boundaries",
    body: "The companion operates inside an explicit scope. When a question falls outside it, it says so and points toward a professional.",
  },
  {
    title: "Responsible governance",
    body: "AI outputs are reviewed for safety, bias, cultural relevance and potentially harmful responses — an ongoing process, not a launch checklist.",
  },
  {
    title: "Language and context",
    body: "Support should not require speaking English. Wolof and other local Gambian languages are a design goal, introduced only where quality can be assured.",
  },
];

export default function TechnologyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Technology"
        lines={["AI that knows", "what it is not."]}
        lede="Talk uses AI as an accessibility layer — a way to make the first step smaller. It is not a therapist, it does not pretend to be, and the whole design is built around that distinction."
        stamp="AI"
      />

      <Section tone="surface">
        <SectionHeading
          eyebrow="Scope"
          lines={["Drawn deliberately", "narrow."]}
          lede="The most important thing about a mental health AI is the list of things it refuses to do."
        />

        <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="rounded-[28px] bg-[var(--background)] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
              What the companion does
            </p>
            <ul className="mt-6 space-y-3">
              {CAN_DO.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
          </div>

          <div className="rounded-[28px] bg-[var(--dark)] text-white p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">
              What it will never do
            </p>
            <ul className="mt-6 space-y-3">
              {WILL_NOT_DO.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 h-5 w-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                  <span className="text-[13px] md:text-[14px] leading-relaxed text-white/90">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Principles"
          lines={["Safety is a design", "requirement, not", "a feature."]}
          lede="Because Talk operates in the mental wellbeing space, these are foundational rather than secondary."
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={PRINCIPLES} columns={3} />
        </div>
      </Section>

      <Section tone="surface">
        <div className="max-w-[820px]">
          <SectionHeading
            eyebrow="Honesty"
            lines={["What we are still", "working on."]}
          />
          <div className="mt-8 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            <p>
              Voice AI in Wolof, Mandinka and Pulaar is not yet reliable enough
              to carry an emotionally sensitive conversation. We are designing
              for those languages from the start, but we would rather ship
              English well than ship four languages badly.
            </p>
            <p>
              AI safety detection is imperfect. It can miss genuine distress and
              it can flag ordinary turns of phrase. That is why the crisis
              pathway always surfaces real emergency contacts rather than
              relying on a model&rsquo;s judgement, and why human review sits behind
              it.
            </p>
            <p>
              Conversations are encrypted in transit and at rest. They are not
              end-to-end encrypted — our infrastructure provider holds the keys.
              We would rather state that plainly than imply a stronger guarantee
              than we can deliver.
            </p>
          </div>

          <Alert tone="warning" title="Talk is not an emergency service" className="mt-10">
            The companion cannot summon help. If you or someone else is in
            immediate danger, call 117 for police or 116 for an ambulance.
          </Alert>
        </div>
      </Section>

      <CTABlock
        eyebrow="Read more"
        lines={["How we handle", "what you share."]}
        body="Our safety and privacy commitments, in plain language."
        primary={{ label: "Safety & ethics", href: "/safety" }}
        secondary={{ label: "Privacy policy", href: "/privacy" }}
      />
    </>
  );
}
