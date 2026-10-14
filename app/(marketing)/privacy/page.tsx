import type { Metadata } from "next";
import Link from "next/link";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, Prose, CTABlock } from "@/components/marketing/Sections";
import { Alert } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How TALK collects, uses, stores and deletes your information — written to be read, not to be skipped.",
};

const LAST_UPDATED = "14 October 2026";

const SECTIONS = [
  {
    heading: "What we collect, and why",
    body: [
      "We collect only what we need to run the service. That means your account details (name, email, and a profile photo if you add one), anything you choose to record in the platform (mood check-ins, journal entries, messages to your provider), what TALK learns about you to find you the right provider, booking and payment records, and basic technical information such as the device and browser you use.",
      "We use this to provide the service, to connect you with providers, to process payments, and to keep the platform safe. We do not use it for anything else.",
      "We do not sell your information. We do not share it with advertisers. Sensitive details you share with the AI companion or with a provider are never repurposed for marketing.",
    ],
  },
  {
    heading: "Who can see what",
    body: [
      "Your journal entries and mood check-ins are visible only to you. Providers cannot read them. Administrators cannot read them. They are stored under your account and the access rules enforce that at the database level, not merely in the interface.",
      "A provider sees what you share during a session, the messages you send them, and any note you attach to a booking.",
      "When institutional funding launches and an organisation pays for your sessions, it will never see who booked a session, when, or with whom. Any reporting to organisations will be aggregate, and suppressed entirely for small groups so that individuals cannot be identified.",
    ],
  },
  {
    heading: "How your information is protected",
    body: [
      "Your data is encrypted in transit and at rest. Access to sensitive records is restricted on a need-to-know basis and protected by secure authentication.",
      "To be precise about what this does not mean: your data is not end-to-end encrypted. Our infrastructure provider holds the encryption keys, which means that — in principle — data could be accessed by us or by them under legal compulsion. We would rather state that plainly than imply a stronger guarantee than we can deliver.",
    ],
  },
  {
    heading: "AI processing",
    body: [
      "Conversations with TALK are processed by a third-party AI provider so she can hear you and reply. The words themselves are not saved. What she learns to match you — the name you go by, your language, age range, area and gender, what you are going through, and the help you are looking for — is saved to your account, and deleted with it.",
      "The AI companion is always labelled as AI. It does not diagnose, prescribe or claim to be human.",
      "Where a conversation suggests possible immediate risk, TALK gives you the emergency numbers straight away. Nothing about it is sent to anyone.",
    ],
  },
  {
    heading: "Payments",
    body: [
      "Payments are processed by Modem Pay, a payment provider licensed by the Central Bank of The Gambia. We do not receive or store your full card details.",
      "We keep a record of what you paid for and when, because we are obliged to and because you need to be able to see your own history.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You can see what we hold about you, correct it, export it, or delete it. Account deletion and data export are available from your settings — you do not need to ask us.",
      "Where a feature relies on optional processing, such as personal wellbeing insights, participation is separately consented to and you can withdraw that consent without losing the rest of the service.",
      "Where we are legally required to retain certain records — payment records, for example — those are kept for the required period and then deleted.",
    ],
  },
  {
    heading: "How long we keep things",
    body: [
      "We keep your account data for as long as your account is open. When you delete your account, your profile, what TALK learned about you, journal entries and mood history are deleted.",
      "Records we are obliged to retain, such as transaction records, are kept for the statutory period. Anonymised, aggregated statistics that cannot be linked back to you may be retained.",
    ],
  },
  {
    heading: "Third parties",
    body: [
      "We use a small number of providers to deliver the service: cloud infrastructure and database hosting, an AI provider for the companion, and a payment processor. Each is bound by an agreement that limits how they may use, store or share your data.",
      "We do not permit any of them to use your information for their own purposes.",
    ],
  },
  {
    heading: "If something goes wrong",
    body: [
      "We maintain an incident response plan. If we suspect a data breach, we investigate promptly, contain it, and notify affected users and — where required — regulators, in a timely and transparent way.",
    ],
  },
  {
    heading: "Legal basis and jurisdiction",
    body: [
      "TALK is designed to comply with The Gambia's Data Protection and Privacy Act, drawing on internationally recognised data protection standards where local guidance is still developing.",
      "If you have a concern about how your data is handled, contact us and we will respond.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Privacy"
        lines={["If you cannot trust", "us with it, you", "will not share it."]}
        lede={`How we collect, use, protect and delete your information. Last updated ${LAST_UPDATED}.`}
        stamp="PRIVATE"
      />

      <Section tone="surface">
        <Prose sections={SECTIONS} />

        <Alert tone="info" className="mt-16 max-w-[760px]">
          This policy is written to be read rather than to satisfy a lawyer. If
          anything here is unclear, or you want the detail behind a specific
          point,{" "}
          <Link href="/support" className="underline underline-offset-4">
            ask us
          </Link>{" "}
          and we will explain it.
        </Alert>
      </Section>

      <CTABlock
        eyebrow="Related"
        lines={["Our safety", "commitments."]}
        body="Professional verification, what happens in a crisis, AI boundaries and human oversight."
        primary={{ label: "Safety & ethics", href: "/safety" }}
        secondary={{ label: "Terms of service", href: "/terms" }}
      />
    </>
  );
}
