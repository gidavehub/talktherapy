"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import SearchField from "@/components/ui/SearchField";
import StatCard from "@/components/ui/StatCard";
import { Alert, EmptyState, Pill, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { PageBar } from "@/components/ui/AppShell";
import { IconImage, IconPalette, IconResources } from "@/components/ui/icons";
import { useAuth } from "@/components/AuthProvider";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { useNow } from "@/lib/useNow";
import { watchRecentChanges, watchSectionStatuses, type LastChange, type SectionStatus } from "@/lib/content/client";
import { CODE_OWNED_NOTICE, SECTIONS, SECTION_IDS, type SectionId } from "@/lib/content/schema";
import { ago, when } from "./format";
import { GlyphExternal } from "./icons";
import { nameFor, useStaffNames } from "./useStaffNames";

/**
 * Everything on the public site that staff can change, by page: what is
 * live and since when, who published it, and any draft waiting. Each opens
 * its editor; each page can be looked at as visitors see it.
 */

type Filter = "all" | "drafts" | "changed" | "original";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts waiting" },
  { id: "changed", label: "Changed" },
  { id: "original", label: "Original words" },
];

const GROUPS: { title: string; lede: string; ids: SectionId[] }[] = [
  {
    title: "Pages",
    lede: "One public page each.",
    ids: SECTION_IDS.filter((id) => SECTIONS[id].kind === "page"),
  },
  {
    title: "On every page",
    lede: "The header, the footer, what search engines show, and the colours.",
    ids: SECTION_IDS.filter((id) => SECTIONS[id].kind === "site"),
  },
];

function matches(filter: Filter, status: SectionStatus): boolean {
  if (filter === "drafts") return status.draft !== null;
  if (filter === "changed") return !status.original;
  if (filter === "original") return status.original;
  return true;
}

/**
 * The theme has a page of its own, and the resource centre's page opens the
 * resource centre, where its articles are too; every other section opens the
 * same editor.
 */
export function editorHref(id: SectionId): string {
  if (id === "theme") return "/admin/content/theme";
  if (id === "resources") return "/admin/content/resources";
  return `/admin/content/${id}`;
}

export default function ContentIndex() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [statuses, setStatuses] = useState<Record<SectionId, SectionStatus> | null>(null);
  const [changes, setChanges] = useState<Partial<Record<SectionId, LastChange>>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(
    () =>
      watchSectionStatuses(setStatuses, () =>
        setError("The site's content could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [],
  );
  // Who published is extra: if it cannot be read, the times still show.
  useEffect(() => watchRecentChanges(setChanges, () => setChanges({})), []);

  const names = useStaffNames([
    ...Object.values(statuses ?? {}).map((s) => s.draft?.updatedBy),
    ...Object.values(changes).map((c) => c?.by),
  ]);

  const list = statuses ? Object.values(statuses) : [];
  const counts: Record<Filter, number> = {
    all: list.length,
    drafts: list.filter((s) => matches("drafts", s)).length,
    changed: list.filter((s) => matches("changed", s)).length,
    original: list.filter((s) => matches("original", s)).length,
  };
  const lastPublished = Math.max(0, ...list.map((s) => s.publishedAt ?? 0));

  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        ids: group.ids.filter((id) => {
          const status = statuses?.[id];
          if (status && !matches(filter, status)) return false;
          if (!term) return true;
          return `${SECTIONS[id].label} ${SECTIONS[id].description}`.toLowerCase().includes(term);
        }),
      })).filter((group) => group.ids.length > 0),
    [statuses, filter, term],
  );

  return (
    <div className="space-y-8">
      <PageBar>
        <span className="font-display hidden shrink-0 text-[20px] font-medium sm:block">Site content</span>
        <SearchField value={search} onChange={setSearch} placeholder="Find a page or part" label="Find a page or part of the site" />
      </PageBar>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" href="/admin/content/media">
          <span className="flex items-center gap-2">
            <IconImage size={15} />
            Media library
          </span>
        </Button>
        <Button size="sm" variant="secondary" href="/admin/content/theme">
          <span className="flex items-center gap-2">
            <IconPalette size={15} />
            Colours
          </span>
        </Button>
        <Button size="sm" variant="secondary" href="/admin/content/resources">
          <span className="flex items-center gap-2">
            <IconResources size={15} />
            Resource centre
          </span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Drafts waiting" value={statuses ? counts.drafts : "—"} loading={!statuses && !error} />
        <StatCard label="Changed from the original" value={statuses ? `${counts.changed} of ${counts.all}` : "—"} loading={!statuses && !error} />
        <StatCard
          label="Last published"
          value={statuses ? (lastPublished ? ago(lastPublished, now) : "Never") : "—"}
          caption={lastPublished ? `${when(lastPublished)} UTC` : undefined}
          loading={!statuses && !error}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show the parts that are">
        {FILTERS.map((f) => (
          <Pill key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} className="shrink-0">
            {f.label}
            <span className={`tabular-nums ${filter === f.id ? "text-white/80" : "text-[var(--muted)]"}`}>
              {statuses ? counts[f.id] : "–"}
            </span>
          </Pill>
        ))}
      </div>

      {error ? (
        <Alert tone="warning" title="Not loaded">
          {error}
        </Alert>
      ) : !statuses ? (
        <SkeletonList count={6} label="Loading the site's content" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 w-full" rounded="rounded-[24px]" />
        </SkeletonList>
      ) : shown.length === 0 ? (
        <EmptyState
          title={term ? `Nothing called “${search.trim()}”` : "Nothing here"}
          description={term ? "Try another word, or clear the search." : "No part of the site is in this state."}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Show everything
            </Button>
          }
        />
      ) : (
        shown.map((group) => (
          <section key={group.title} aria-labelledby={`group-${group.title}`}>
            <div className="mb-4">
              <h2 id={`group-${group.title}`} className="font-display text-[24px] font-medium leading-tight">
                {group.title}
              </h2>
              <p className="mt-1 text-[13px] text-[var(--muted)]">{group.lede}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.ids.map((id) => (
                <li key={id}>
                  <SectionCard
                    id={id}
                    status={statuses[id]}
                    change={changes[id] ?? null}
                    names={names}
                    me={user?.uid}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Alert tone="info" title="Set in code, not here">
        {CODE_OWNED_NOTICE} So are prices: the words carry placeholders such as {"{firstPrice}"}, filled in from what
        TALK actually charges.
      </Alert>
    </div>
  );
}

function SectionCard({
  id,
  status,
  change,
  names,
  me,
  now,
}: {
  id: SectionId;
  status: SectionStatus;
  change: LastChange | null;
  names: Record<string, string>;
  me: string | undefined;
  now: number;
}) {
  const def = SECTIONS[id];
  // The route to look at: a page's own, or the front page for what is on every page.
  const view = id === "seo" ? null : (def.route ?? "/");
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={SPRING_SNAP}
      className="relative flex h-full flex-col rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] focus-within:ring-4 focus-within:ring-[var(--accent)]/20"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[19px] font-medium leading-tight">
          {/* The whole card opens the editor; the link is stretched over it. */}
          <Link href={editorHref(id)} className="outline-none after:absolute after:inset-0 after:rounded-[24px] after:content-['']">
            {def.label}
          </Link>
        </h3>
        <span className="flex shrink-0 gap-1.5">
          {status.draft ? (
            <span className="inline-flex h-6 items-center rounded-full bg-[var(--accent)] px-2.5 text-[11px] font-medium text-white">
              Draft
            </span>
          ) : null}
          <span
            className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${
              status.original ? "bg-[var(--sand)] text-[var(--foreground)]" : "bg-[var(--sage)] text-white"
            }`}
          >
            {status.original ? "Original" : "Changed"}
          </span>
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{def.description}</p>

      <div className="mt-4 flex-1 space-y-1 text-[12.5px] leading-snug">
        <p>
          {status.publishedAt
            ? `Published ${ago(status.publishedAt, now)}${change ? ` by ${nameFor(change.by, names, me)}` : ""}`
            : "Showing the original words"}
        </p>
        {status.draft ? (
          <p className="text-[var(--accent-deep)]">
            Draft saved {ago(status.draft.updatedAt, now)} by {nameFor(status.draft.updatedBy, names, me)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <span className="text-[13px] font-medium text-[var(--accent-deep)]">{status.draft ? "Carry on editing" : "Edit"}</span>
        {view ? (
          // Above the stretched link, so it can be pressed on its own.
          <a
            href={view}
            target="_blank"
            rel="noopener"
            className="relative z-10 -my-2 -mr-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-[var(--muted)] outline-none transition-colors hover:bg-[var(--sand)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
          >
            <GlyphExternal size={14} />
            View {def.kind === "page" ? "page" : "site"}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </motion.article>
  );
}
