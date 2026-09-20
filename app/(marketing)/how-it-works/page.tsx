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

export const metadata: Metadata = {
  title: "How Talk works",
  description:
    "From a difficult day to a booked session with a qualified counsellor — how Talk combines an AI companion, human professionals, and wellbeing resources.",
};

const STEPS = [
  {
    title: "Start wherever you are",
    body: "You do not need a reason, a diagnosis, or the right words. Open Talk because today was hard, because something has been sitting with you for months, or because you simply want to check in with yourself.",
  },
  {
    title: "Talk it through with the companion",
    body: "The AI companion is there for an initial, private conversation — a check-in, a reflection, a grounding exercise. It is clearly labelled as AI, it does not diagnose, and it does not pretend to be a therapist.",
  },
  {
    title: "Get pointed towards the right support",
    body: "Every companion conversation ends the same way: by helping you decide what would actually help next. Often that is booking time with a qualified human counsellor.",
  },
  {
    title: "Choose a counsellor and book",
    body: "Browse verified professionals by specialisation, language and availability. See their qualifications and rates before you commit to anything.",
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
    body: "A private space for emotional check-ins, guided reflection and grounding exercises — available in English, with Wolof and other local languages planned.",
    icon: <IconOrb />,
  },
  {
    title: "Human counsellors",
    body: "Qualified counsellors and psychosocial support professionals, credential-verified before they appear in the directory.",
    icon: <IconPeople />,
  },
  {
    title: "Resource centre",
    body: "Free articles, audio exercises and guided reflections on stress, grief, relationships, work and study pressure.",
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
    a: "Your journal entries and mood check-ins are private to you. Counsellors do not have access to them unless you deliberately share something in a session. Conversations are encrypted in transit and at rest, and are never sold or used for advertising.",
  },
  {
    q: "How do I know a counsellor is qualified?",
    a: "Every counsellor submits their credentials before their profile can appear publicly. An administrator reviews the documents and only then is the profile visible in the directory. You can see qualifications, specialisations and years of experience on each profile.",
  },
  {
    q: "What does it cost?",
    a: "The resource centre is free. An initial AI consultation is D250 for roughly 5–7 minutes; a longer AI session is D500 for around 20 minutes. Human counselling sessions range from D700 to D3,000 depending on the professional. Pricing is set deliberately so that seeing a human is the more cost-effective path.",
  },
  {
    q: "What if I am in crisis?",
    a: "Talk is not an emergency service. If you or someone else is in immediate danger, call 117 for police or 116 for an ambulance. Our crisis page lists the services that can help right now.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        lines={["From a hard day", "to real support."]}
        lede="Talk is built around one idea: the distance between needing help and getting it should be as short as possible. Here is what that looks like in practice."
        stamp="LISTEN"
      />

      <Section tone="surface">
        <SectionHeading
          eyebrow="The journey"
          lines={["Six steps, and you", "can stop at any of them."]}
          lede="Nobody is pushed through a funnel. Plenty of people will open Talk, breathe for five minutes, and close it again. That is a valid use of this platform."
        />
        <StepList steps={STEPS} />
      </Section>

      <Section>
        <SectionHeading
          eyebrow="What you get"
          lines={["Four ways in."]}
          lede="Different days need different things. Talk is built so you can use only the part you need."
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
        secondary={{ label: "Browse counsellors", href: "/therapists" }}
      />
    </>
  );
}
