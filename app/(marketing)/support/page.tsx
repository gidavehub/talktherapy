import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FAQ } from "@/components/marketing/Sections";
import SupportForm from "@/components/marketing/SupportForm";
import { SectionHeading } from "@/components/ui/Typography";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("support");
}

// The form and the emergency notice beside it stay in code; the words around
// them are the site content.
export default async function SupportPage() {
  const { intro, form, also, faq } = await getContent("support");
  return (
    <>
      <PageIntro {...intro} stamp="HELP" />

      <Section tone="surface">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 lg:gap-20 items-start">
          <div>
            <SectionHeading eyebrow={form.eyebrow} lines={form.lines} />
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
                All emergency contacts
              </Link>
              .
            </Alert>

            {also.links.length > 0 ? (
              <div className="rounded-[28px] bg-[var(--background)] p-6">
                <p className="eyebrow">
                  {also.eyebrow}
                </p>
                <ul className="mt-5 space-y-3 text-[14px]">
                  {also.links.map((link, i) => (
                    <li key={i}>
                      <Link href={link.href} className="underline underline-offset-4 hover:text-[var(--accent)] transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={faq.eyebrow} lines={faq.lines} />
        <div className="mt-12">
          <FAQ items={faq.items} />
        </div>
      </Section>
    </>
  );
}
