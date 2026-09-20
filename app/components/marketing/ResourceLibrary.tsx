"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Badge, EmptyState, Pill } from "../ui/Feedback";
import Button from "../ui/Button";
import { IconResources } from "../ui/icons";
import {
  RESOURCE_TOPIC_LABELS,
  type Resource,
  type ResourceTopic,
} from "../../lib/models";

/**
 * Resource centre listing.
 *
 * Content is passed in from the server rather than fetched here — it is static
 * seed data today and public Firestore documents later, and in both cases the
 * list should render without waiting on the client.
 */

const FORMAT_LABELS: Record<Resource["format"], string> = {
  article: "Read",
  audio: "Listen",
  video: "Watch",
  exercise: "Exercise",
};

export default function ResourceLibrary({
  resources,
}: {
  resources: Pick<
    Resource,
    "id" | "slug" | "title" | "summary" | "format" | "topics" | "readingMinutes"
  >[];
}) {
  const [topic, setTopic] = useState<ResourceTopic | null>(null);

  // Only offer filters that would actually return something.
  const availableTopics = useMemo(() => {
    const seen = new Set<ResourceTopic>();
    resources.forEach((r) => r.topics.forEach((t) => seen.add(t)));
    return [...seen];
  }, [resources]);

  const visible = useMemo(
    () => (topic ? resources.filter((r) => r.topics.includes(topic)) : resources),
    [resources, topic],
  );

  if (resources.length === 0) {
    return (
      <EmptyState
        icon={<IconResources />}
        title="The library is being written"
        description="We are building out the resource centre now. Check back shortly."
        action={<Button href="/how-it-works">See how Talk works</Button>}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Pill active={topic === null} onClick={() => setTopic(null)}>
          Everything
        </Pill>
        {availableTopics.map((t) => (
          <Pill key={t} active={topic === t} onClick={() => setTopic(t)}>
            {RESOURCE_TOPIC_LABELS[t]}
          </Pill>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {visible.map((resource, i) => (
          <motion.article
            key={resource.id}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: Math.min(i, 8) * 0.05 }}
            whileHover={{ y: -4 }}
            className="relative rounded-[28px] bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)] p-6 flex flex-col"
          >
            <div className="flex items-center gap-2">
              <Badge tone={resource.format === "exercise" ? "accent" : "neutral"}>
                {FORMAT_LABELS[resource.format]}
              </Badge>
              <span className="text-[12px] text-[var(--muted)]">
                {resource.readingMinutes} min
              </span>
            </div>

            <h3 className="mt-5 text-[18px] leading-snug tracking-tight font-medium">
              <Link
                href={`/resources/${resource.slug}`}
                className="hover:text-[var(--accent)] transition-colors"
              >
                {/* Stretched link so the whole card is the target. */}
                <span className="absolute inset-0" aria-hidden />
                {resource.title}
              </Link>
            </h3>

            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)] flex-1">
              {resource.summary}
            </p>

            <div className="mt-6 pt-5 border-t border-[var(--border)] flex flex-wrap gap-1.5">
              {resource.topics.slice(0, 2).map((t) => (
                <span key={t} className="text-[11px] text-[var(--muted)]">
                  {RESOURCE_TOPIC_LABELS[t]}
                </span>
              ))}
            </div>
          </motion.article>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<IconResources />}
          title="Nothing here yet"
          description="We have not published anything on this topic so far. It is on the list."
          action={
            <Button variant="secondary" withArrow={false} onClick={() => setTopic(null)}>
              Show everything
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
