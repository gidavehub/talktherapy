import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, StepList, FeatureGrid, FAQ, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import {
  IconOrb,
  IconPeople,
  IconResources,
  IconMood,
} from "@/components/ui/icons";
import { AI_TIERS, HUMAN_RATE_MIN_MINOR } from "@/lib/models";
import { formatDalasi } from "@/lib/money";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "From a difficult day to a session with a qualified provider — how TALK brings together an AI companion, human providers and free wellbeing resources.",
};

// Prices come from the same constants the checkout charges, so this page can
// never quote a number the payment does not take.
const FIRST = AI_TIERS.initial;
const LONGER = AI_TIERS.extended;

const STEPS = [
  {
    title: "Start wherever you are",
    body: "You do not need a reason, a diagnosis, or the right words. Open TALK because today was hard, because something has been sitting with you for months, or because you simply want to check in with yourself.",
  },
  {
    title: "Talk it through with the companion",
    body: "The AI companion is there for an initial, private conversation — a check-in, a reflection, a grounding exercise. It is clearly labelled as AI, it does not diagnose, and it does not pretend to be a therapist.",
  },
  {
    title: "Get pointed towards the right support",
    body: "Every companion conversation ends the same way: by helping you decide what would actually help next. Often that is booking time with a qualified human provider.",
  },
  {
    title: "Choose a provider and book",
    body: "Browse verified providers by language, specialty and who you would feel most comfortable with. See their qualifications and fee before you commit to anything.",
  },
  {
    title: "Meet securely",
    body: "Sessions happen through a private consultation room in the platform. No travelling, no waiting room, no one seeing you walk in.",
  },
  {
    title: "Keep going",
    body: "Book follow-ups, track how you are doing over time with mood check-ins and a private journal, and use the resource library between sessions.",
  },
];

const PILLARS = [
  {
    title: "AI companion",
    body: "A private space to talk things through — by voice or by typing, in English, Wolof, Mandinka or Pulaar. Check-ins, reflection, and simple grounding when it helps.",
    icon: <IconOrb />,
  },
  {
    title: "Human providers",
    body: "Qualified providers and psychosocial support professionals, credential-verified before they appear in the directory.",
    icon: <IconPeople />,
  },
  {
    title: "Resource centre",
    body: "Free articles and exercises on stress, grief, sleep, study pressure and more.",
    icon: <IconResources />,
  },
  {
    title: "Personal wellbeing tools",
    body: "Mood check-ins and a confidential journal, so you can see patterns over time rather than relying on memory.",
    icon: <IconMood />,
  },
];

const FAQS = [
  {
    q: "Is the AI companion a replacement for a therapist?",
    a: "No, and it is not designed to be. The companion is a bridge — a low-pressure way to start, reflect, and work out what support would help. It will not diagnose you, prescribe treatment, or claim to be human. Every conversation ends by guiding you toward a qualified professional.",
  },
  {
    q: "Who can see what I share?",
    a: "Your journal entries and mood check-ins are private to you. Providers do not have access to them unless you deliberately share something in a session. The words of your conversation with TALK are not saved — only what she learns to match you. Messages with your provider are encrypted in transit and at rest, and nothing you share is ever sold or used for advertising.",
  },
  {
    q: "How do I know a provider is qualified?",
    a: "Every provider submits their credentials before their profile can appear publicly. An administrator reviews the documents and only then is the profile visible in the directory. You can see qualifications, specialisations and years of experience on each profile.",
  },
  {
    q: "What does it cost?",
    a: `No plans, no subscription — you pay per conversation. The resource centre, mood check-ins and your journal are free. A first conversation with TALK is ${formatDalasi(FIRST.amountMinor)} for up to ${FIRST.durationSec / 60} minutes; a longer talk is ${formatDalasi(LONGER.amountMinor)} for up to ${LONGER.durationSec / 60} minutes. A 45-minute session with a provider costs what they set, from ${formatDalasi(HUMAN_RATE_MIN_MINOR)}. Minute for minute, a provider can cost less than TALK — on purpose.`,
  },
  {
    q: "What if I am in crisis?",
    a: "TALK is not an emergency service, and nobody is watching the app. If you or someone else is in immediate danger, call 117 for police or 116 for an ambulance — both are free to call. Our emergency contacts page lists every number.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        lines={["From a hard day", "to real support."]}
        lede="TALK is built around one idea: the distance between needing help and getting it should be as short as possible. Here is what that looks like in practice."
        stamp="LISTEN"
      />

      <Section tone="surface">
        <SectionHeading
          eyebrow="The journey"
          lines={["Six steps, and you", "can stop at any of them."]}
          lede="Nobody is pushed through a funnel. Plenty of people will read one article, check in once, and close it again. That is a valid use of this platform."
        />
        <StepList steps={STEPS} />
      </Section>

      <Section>
        <SectionHeading
          eyebrow="What you get"
          lines={["Four ways in."]}
          lede="Different days need different things. TALK is built so you can use only the part you need."
        />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={PILLARS} columns={4} />
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow="Questions" lines={["The things people", "ask us first."]} />
        <div className="mt-12">
          <FAQ items={FAQS} />
        </div>
      </Section>

      <CTABlock
        lines={["You do not need", "the right words."]}
        body="Create an account and start whenever you are ready. Nothing is shared without your say-so."
        secondary={{ label: "Browse providers", href: "/providers" }}
      />
    </>
  );
}
