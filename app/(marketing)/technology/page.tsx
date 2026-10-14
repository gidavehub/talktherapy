import type { Metadata } from "next";
import PageIntro from "@/components/marketing/PageIntro";
import { Section, FeatureGrid, CTABlock } from "@/components/marketing/Sections";
import { SectionHeading } from "@/components/ui/Typography";
import { CheckItem, Alert } from "@/components/ui/Feedback";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("technology");
}

export default async function TechnologyPage() {
  const { intro, scope, principles, honesty, cta } = await getContent("technology");
  return (
    <>
      <PageIntro {...intro} stamp="AI" />

      <Section tone="surface">
        <SectionHeading eyebrow={scope.eyebrow} lines={scope.lines} lede={scope.lede} />

        <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="rounded-[28px] bg-[var(--background)] p-6 md:p-8">
            <p className="eyebrow">
              {scope.canLabel}
            </p>
            <ul className="mt-6 space-y-3">
              {scope.can.map((item, i) => (
                <CheckItem key={i}>{item}</CheckItem>
              ))}
            </ul>
          </div>

          <div className="rounded-[28px] bg-[var(--sage)] text-[var(--cream)] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">
              {scope.cannotLabel}
            </p>
            <ul className="mt-6 space-y-3">
              {scope.cannot.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
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
        <SectionHeading eyebrow={principles.eyebrow} lines={principles.lines} lede={principles.lede} />
        <div className="mt-12 md:mt-16">
          <FeatureGrid items={principles.items} columns={3} />
        </div>
      </Section>

      <Section tone="surface">
        <div className="max-w-[820px]">
          <SectionHeading eyebrow={honesty.eyebrow} lines={honesty.lines} />
          <div className="mt-8 space-y-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
            {honesty.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {/* Safety wording, kept in code: never one edit away from being wrong. */}
          <Alert tone="warning" title="TALK is not an emergency service" className="mt-10">
            The companion cannot summon help. If you or someone else is in
            immediate danger, call 117 for police or 116 for an ambulance.
          </Alert>
        </div>
      </Section>

      <CTABlock {...cta} />
    </>
  );
}
