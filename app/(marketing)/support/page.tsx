import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ } from "@/components/marketing/Sections";
import SupportForm from "@/components/marketing/SupportForm";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get in touch with the Talk team — questions about your account, bookings, joining as a counsellor, or institutional packages.",
};

const FAQS = [
  {
    q: "How quickly will you reply?",
    a: "We aim to reply within two working days. This inbox is not monitored around the clock, so please do not use it for anything urgent.",
  },
  {
    q: "I want to report a counsellor or a session.",
    a: "Choose 'Reporting a concern' above and tell us what happened. Reports are reviewed by an administrator, and a counsellor can be suspended from the directory while we investigate.",
  },
  {
    q: "I need to delete my account and my data.",
    a: "You can do this yourself from Settings once signed in — it removes your profile, journal entries and mood history. If you are having trouble, write to us and we will handle it.",
  },
  {
    q: "Can I get support in Wolof?",
    a: "Yes. Write to us in Wolof and we will reply in Wolof. You can also filter the counsellor directory by language to find professionals who work in Wolof, Mandinka or Pulaar.",
  },
];

export default function SupportPage() {
  return (
    <>
      <PageIntro
        eyebrow="Support"
        lines={["Ask us anything."]}
        lede="Questions about your account, a booking, joining as a counsellor, or bringing Talk to your organisation — this reaches a person."
        stamp="HELP"
      />

      <Section tone="surface">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 lg:gap-20 items-start">
          <div>
            <SectionHeading eyebrow="Get in touch" lines={["Send us a message."]} />
            <div className="mt-10">
              <Suspense
                fallback={
                  <div className="flex items-center gap-3 text-[var(--muted)] py-10">
                    <Spinner />
                    <span className="text-[13px]">Loading form…</span>
                  </div>
                }
              >
                <SupportForm />
              </Suspense>
            </div>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <Alert tone="crisis" title="Not for emergencies">
              This form is not monitored continuously and cannot summon help. If
              you or someone else is in immediate danger, call 117 for police or
              116 for an ambulance.{" "}
              <Link href="/crisis" className="underline underline-offset-4">
                All crisis contacts
              </Link>
              .
            </Alert>

            <div className="rounded-[28px] bg-[var(--background)] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                You might also want
              </p>
              <ul className="mt-5 space-y-3 text-[14px]">
                <li>
                  <Link href="/how-it-works" className="underline underline-offset-4 hover:text-[var(--accent)] transition-colors">
                    How Talk works
                  </Link>
                </li>
                <li>
                  <Link href="/plans" className="underline underline-offset-4 hover:text-[var(--accent)] transition-colors">
                    Plans and pricing
                  </Link>
                </li>
                <li>
                  <Link href="/for-counsellors" className="underline underline-offset-4 hover:text-[var(--accent)] transition-colors">
                    Joining as a counsellor
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="underline underline-offset-4 hover:text-[var(--accent)] transition-colors">
                    How we handle your data
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Before you write" lines={["Quick answers."]} />
        <div className="mt-12">
          <FAQ items={FAQS} />
        </div>
      </Section>
    </>
  );
}
