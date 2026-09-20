import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResourceBody from "@/components/marketing/ResourceBody";
import { Badge, Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { RESOURCE_TOPIC_LABELS } from "@/lib/models";
import { SEED_RESOURCES, findSeedResource } from "@/lib/resources-seed";

/**
 * Static generation: the seed set is known at build time, so every resource
 * prerenders. Once Firestore-backed resources exist this gains a
 * `dynamicParams` fallback rather than losing the static path.
 */
export function generateStaticParams() {
  return SEED_RESOURCES.map((r) => ({ slug: r.slug }));
}

// Next 16: params is a Promise in generateMetadata too.
export async function generateMetadata(
  props: PageProps<"/resources/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const resource = findSeedResource(slug);

  if (!resource) return { title: "Resource not found" };

  return {
    title: resource.title,
    description: resource.summary,
  };
}

export default async function ResourcePage(props: PageProps<"/resources/[slug]">) {
  const { slug } = await props.params;
  const resource = findSeedResource(slug);

  if (!resource) notFound();

  return (
    <article className="bg-[var(--background)]">
      <div className="px-4 sm:px-6 md:px-10 pt-[110px] md:pt-[150px] pb-20 md:pb-28 max-w-[1400px] mx-auto">
        <Link
          href="/resources"
          className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Resource centre
        </Link>

        <header className="mt-10 max-w-[760px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={resource.format === "exercise" ? "accent" : "neutral"}>
              {resource.format}
            </Badge>
            <span className="text-[12px] text-[var(--muted)]">
              {resource.readingMinutes} min read
            </span>
          </div>

          <h1 className="mt-5 text-[32px] sm:text-[40px] md:text-[52px] leading-[1.03] tracking-[-0.025em] font-medium">
            {resource.title}
          </h1>

          <p className="mt-5 text-[15px] md:text-[17px] leading-relaxed text-[var(--muted)]">
            {resource.summary}
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {resource.topics.map((t) => (
              <span
                key={t}
                className="inline-flex h-7 items-center rounded-full border border-[var(--border)] px-3 text-[11px] text-[var(--muted)]"
              >
                {RESOURCE_TOPIC_LABELS[t]}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-14 md:mt-16">
          <ResourceBody body={resource.body} />
        </div>

        <div className="mt-16 max-w-[680px] space-y-6">
          <Alert tone="info">
            This is general information, not medical advice. If something here
            resonates and you would like to talk it through, you can{" "}
            <Link href="/therapists" className="underline underline-offset-4">
              book a session with a verified counsellor
            </Link>
            .
          </Alert>

          <Alert tone="warning" title="If you need help right now">
            Talk is not an emergency service. Call 117 for police or 116 for an
            ambulance, or see the{" "}
            <Link href="/crisis" className="underline underline-offset-4">
              crisis contacts page
            </Link>
            .
          </Alert>
        </div>

        <div className="mt-14 flex flex-col sm:flex-row gap-3">
          <Button href="/resources" variant="secondary">
            More resources
          </Button>
          <Button href="/therapists" variant="ghost" withArrow={false}>
            Find a counsellor
          </Button>
        </div>
      </div>
    </article>
  );
}
