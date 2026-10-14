import type { Metadata } from "next";
import Link from "next/link";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, Prose, CTABlock } from "@/components/marketing/Sections";
import { Alert } from "@/components/ui/Feedback";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("terms");
}

export default async function TermsPage() {
  const { intro, body, cta } = await getContent("terms");
  return (
    <>
      <PageIntro {...intro} stamp="TERMS" />

      <Section tone="surface">
        {/* Safety wording, kept in code: never one edit away from being wrong. */}
        <Alert tone="warning" title="The most important line on this page" className="mb-14 max-w-[760px]">
          TALK is not an emergency service. If you or someone else is in
          immediate danger, call 117 for police or 116 for an ambulance — see{" "}
          <Link href="/crisis" className="underline underline-offset-4">
            emergency contacts
          </Link>
          .
        </Alert>

        <Prose source={body} />
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
