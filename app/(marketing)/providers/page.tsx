import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, CTABlock } from "@/components/marketing/Sections";
import ProviderDirectory from "@/components/marketing/ProviderDirectory";

export const metadata: Metadata = {
  title: "Find a provider",
  description:
    "Browse credential-verified providers and psychosocial support professionals in The Gambia. Filter by specialisation, language and rate.",
};

export default function ProvidersPage() {
  return (
    <>
      <PageIntro
        eyebrow="Providers"
        lines={["Find someone", "who fits."]}
        lede="Every professional here has had their identity and qualifications checked before their profile went live. Filter by what matters to you — what you want to talk about, and the language you want to talk about it in."
        stamp="SUPPORT"
      />

      <Section tone="surface">
        <ProviderDirectory />
      </Section>

      <CTABlock
        eyebrow="Not sure where to start?"
        lines={["You do not have to", "pick perfectly."]}
        body="If choosing feels like one decision too many, start a conversation with the companion and it will help you work out what kind of support would help."
        primary={{ label: "How it works", href: "/how-it-works" }}
        secondary={{ label: "See pricing", href: "/plans" }}
      />
    </>
  );
}
