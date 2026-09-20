import type { Metadata } from "next";
import Link from "next/link";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, Prose, CTABlock } from "@/components/marketing/Sections";
import { Alert } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms on which Talk is provided — what the service is, what it is not, and the responsibilities on both sides.",
};

const LAST_UPDATED = "20 September 2026";

const SECTIONS = [
  {
    heading: "What Talk is",
    body: [
      "Talk is a digital platform that provides wellbeing resources, an AI-assisted support companion, and access to independent counsellors and psychosocial support professionals.",
      "Talk is a platform. Counsellors on Talk practise independently — they are not employees or agents of Talk, and the professional relationship in a session is between you and them.",
    ],
  },
  {
    heading: "What Talk is not",
    body: [
      "Talk is not an emergency service. Nobody monitors the platform continuously, and submitting anything here will not summon help. If you or someone else is in immediate danger, contact the emergency services directly.",
      "The AI companion is not a therapist and does not provide medical advice, diagnosis or treatment. It is a supportive tool, clearly labelled as AI throughout.",
      "Resources published on Talk are general information. They are not a substitute for professional assessment of your own situation.",
    ],
  },
  {
    heading: "Using the platform",
    body: [
      "You must be able to enter into a binding agreement to use Talk. Where you are under the age of majority, you should have the involvement of a parent or guardian.",
      "You agree to provide accurate account information, to keep your login credentials secure, and not to share your account with anyone else.",
      "You agree not to misuse the platform — including harassing counsellors or other users, misrepresenting your identity, attempting to access data that is not yours, or using the service for any unlawful purpose.",
    ],
  },
  {
    heading: "Counsellors",
    body: [
      "Counsellors are verified before appearing in the directory: we check identity and evidence of qualifications. Verification confirms credentials; it is not a guarantee of any particular outcome, and it does not make Talk responsible for the clinical judgement of an independent professional.",
      "Counsellors remain responsible for their own professional registration, insurance, record-keeping and adherence to their professional obligations.",
      "If you have a concern about a professional on Talk, report it. We review reports and may suspend a counsellor from the directory while we investigate.",
    ],
  },
  {
    heading: "Bookings, payments and cancellations",
    body: [
      "Session fees are set by each counsellor within the platform's published range and are shown before you book. Talk retains a service fee from each completed session.",
      "Payment is taken at the time of booking. If a counsellor does not attend, you are refunded in full.",
      "You may cancel without charge up to 24 hours before a session. Cancellations inside 24 hours are at the counsellor's discretion.",
      "AI companion sessions are charged per session at the rates published on the plans page.",
    ],
  },
  {
    heading: "Confidentiality and its limits",
    body: [
      "What you share in a session is confidential between you and your counsellor, and your private wellbeing data is visible only to you.",
      "There are limits, which any professional will explain: where there is a serious and imminent risk to your life or someone else's, or where disclosure is required by law, a professional may have an obligation to act.",
    ],
  },
  {
    heading: "Your content",
    body: [
      "Anything you write in the platform — journal entries, messages, session notes you add — remains yours. You grant Talk only the permission needed to store it and show it back to you and, where you choose, to your counsellor.",
      "You can export or delete your content at any time from your settings.",
    ],
  },
  {
    heading: "Availability",
    body: [
      "We work to keep Talk available but cannot guarantee uninterrupted service. Sessions depend on your internet connection and device as well as ours.",
      "We may change, suspend or discontinue parts of the service. Where a change materially affects you, we will give reasonable notice.",
    ],
  },
  {
    heading: "Liability",
    body: [
      "To the extent permitted by law, Talk is not liable for the clinical judgement, conduct or outcomes of independent professionals practising through the platform, nor for decisions you take based on general wellbeing information published here.",
      "Nothing in these terms limits liability that cannot lawfully be limited.",
    ],
  },
  {
    heading: "Ending your use",
    body: [
      "You can close your account at any time from your settings.",
      "We may suspend or close an account that breaches these terms, that puts other users or professionals at risk, or where we are required to do so by law.",
    ],
  },
  {
    heading: "Governing law",
    body: [
      "These terms are governed by the laws of The Gambia.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Terms"
        lines={["The agreement,", "in plain words."]}
        lede={`What the service is, what it is not, and what is expected on both sides. Last updated ${LAST_UPDATED}.`}
        stamp="TERMS"
      />

      <Section tone="surface">
        <Alert tone="warning" title="The most important line on this page" className="mb-14 max-w-[760px]">
          Talk is not an emergency service. If you or someone else is in
          immediate danger, call 117 for police or 116 for an ambulance — see{" "}
          <Link href="/crisis" className="underline underline-offset-4">
            crisis contacts
          </Link>
          .
        </Alert>

        <Prose sections={SECTIONS} />
      </Section>

      <CTABlock
        eyebrow="Related"
        lines={["How your data", "is handled."]}
        primary={{ label: "Privacy policy", href: "/privacy" }}
        secondary={{ label: "Ask a question", href: "/support" }}
      />
    </>
  );
}
