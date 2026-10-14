import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResourceBody from "@/components/marketing/ResourceBody";
import { ArchPortrait } from "@/components/ui/Arch";
import { Badge, Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import { RESOURCE_TOPIC_LABELS } from "@/lib/models";
import { getResource, getResources } from "@/lib/content/server";

/**
 * One article from the resource centre.
 *
 * Every article published when the site is built is drawn then. One
 * published since is drawn the first time somebody opens it (dynamicParams),
 * and every one is drawn again when staff change the resource centre — the
 * article editor refreshes the "content:resources" tag through
 * /api/revalidate — or within five minutes. An address no article has is a
 * 404.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getResources()).map((r) => ({ slug: r.slug }));
}

// Next 16: params is a Promise in generateMetadata too.
export async function generateMetadata(
  props: PageProps<"/resources/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const resource = await getResource(slug);

  if (!resource) return { title: "Resource not found" };

  return {
    title: resource.title,
    description: resource.summary,
  };
}

export default async function ResourcePage(props: PageProps<"/resources/[slug]">) {
  const { slug } = await props.params;
  const resource = await getResource(slug);

  if (!resource) notFound();

  return (
    <article className="bg-[var(--background)]">
      <div className="px-4 sm:px-6 md:px-10 pt-[110px] md:pt-[150px] pb-20 md:pb-28 max-w-[1400px] mx-auto">
        <Link
          href="/resources"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-[var(--accent)] hover:text-[var(--accent-deep)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Resource centre
        </Link>

        <header className="mt-10 flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[760px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resource.format === "exercise" ? "accent" : "neutral"}>
                {resource.format}
              </Badge>
              <span className="text-[12px] text-[var(--muted)]">
                {resource.readingMinutes} min read
              </span>
            </div>

            <h1 className="mt-5 text-[32px] sm:text-[40px] md:text-[52px] leading-[1.06] font-display font-medium">
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
          </div>

          {resource.cover.src ? (
            // A picture that shipped with the site is a cut-out standing in
            // the arch; an uploaded photo fills it.
            <ArchPortrait
              src={resource.cover.src}
              alt={resource.cover.alt}
              tone="var(--sage-soft)"
              cutout={resource.cover.src.startsWith("/people/")}
              aspect={4 / 3}
              sizes="(min-width: 768px) 300px, 70vw"
              priority
              className="aspect-[4/5] w-[70%] max-w-[300px] shrink-0 self-center md:w-[300px] md:self-end"
            />
          ) : null}
        </header>

        <div className="mt-14 md:mt-16">
          <ResourceBody body={resource.body} />
        </div>

        <div className="mt-16 max-w-[680px] space-y-6">
          <Alert tone="info">
            This is general information, not medical advice. If something here
            resonates and you would like to talk it through, you can{" "}
            <Link href="/providers" className="underline underline-offset-4">
              book a session with a verified provider
            </Link>
            .
          </Alert>

          <Alert tone="warning" title="If you need help right now">
            TALK is not an emergency service. Call 117 for police or 116 for an
            ambulance, or see the{" "}
            <Link href="/crisis" className="underline underline-offset-4">
              emergency contacts page
            </Link>
            .
          </Alert>
        </div>

        <div className="mt-14 flex flex-col sm:flex-row gap-3">
          <Button href="/resources" variant="secondary">
            More resources
          </Button>
          <Button href="/providers" variant="ghost" withArrow={false}>
            Find a provider
          </Button>
        </div>
      </div>
    </article>
  );
}
