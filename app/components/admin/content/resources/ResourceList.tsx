"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type DataColumn } from "@/components/ui/DataTable";
import SearchField from "@/components/ui/SearchField";
import StatCard from "@/components/ui/StatCard";
import { Alert, Pill } from "@/components/ui/Feedback";
import { PageBar } from "@/components/ui/AppShell";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { useAuth } from "@/components/AuthProvider";
import { useNow } from "@/lib/useNow";
import { RESOURCE_TOPIC_LABELS } from "@/lib/models";
import { watchSectionStatuses, type SectionStatus } from "@/lib/content/client";
import { RESOURCE_FORMATS } from "@/lib/content/resources";
import { newResourceId, watchResourceIndex, type ResourceRow } from "@/lib/content/resources-client";
import { ago, when } from "../format";
import { GlyphExternal } from "../icons";
import { nameFor, useStaffNames } from "../useStaffNames";

/**
 * The resource centre, for staff: every article — the starter set that ships
 * with the site, and every one written here — what is live, what is waiting,
 * and the page around the library. Each opens its editor.
 */

type Filter = "all" | "live" | "off" | "waiting";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Published" },
  { id: "off", label: "Drafts" },
  { id: "waiting", label: "Changes waiting" },
];

function matches(filter: Filter, row: ResourceRow): boolean {
  if (filter === "live") return row.live;
  if (filter === "off") return !row.live;
  if (filter === "waiting") return row.live && row.draft !== null;
  return true;
}

const FORMAT_LABELS = Object.fromEntries(RESOURCE_FORMATS.map((f) => [f.value, f.label])) as Record<string, string>;

function Status({ row }: { row: ResourceRow }) {
  const [label, tone] = !row.live
    ? row.draft
      ? ["Draft", "bg-[var(--sand)] text-[var(--foreground)]"]
      : ["Taken down", "bg-[var(--sand)] text-[var(--foreground)]"]
    : row.draft
      ? ["Changes waiting", "bg-[var(--accent)] text-white"]
      : ["Published", "bg-[var(--sage)] text-white"];
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}

export default function ResourceList() {
  const router = useRouter();
  const { user } = useAuth();
  const now = useNow(60_000);
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<SectionStatus | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(
    () =>
      watchResourceIndex(setRows, () =>
        setError("The articles could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [],
  );
  // The page around the library is extra: if it cannot be read, its card still opens its editor.
  useEffect(() => watchSectionStatuses((statuses) => setPage(statuses.resources), () => setPage(null)), []);

  const names = useStaffNames([page?.draft?.updatedBy]);

  const all = useMemo(() => rows ?? [], [rows]);
  const counts: Record<Filter, number> = {
    all: all.length,
    live: all.filter((r) => matches("live", r)).length,
    off: all.filter((r) => matches("off", r)).length,
    waiting: all.filter((r) => matches("waiting", r)).length,
  };
  const lastPublished = Math.max(0, ...all.map((r) => (r.live && !r.original ? (r.publishedAt ?? 0) : 0)));

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((row) => {
      if (!matches(filter, row)) return false;
      if (!term) return true;
      return [row.title, row.slug, ...row.topics.map((t) => RESOURCE_TOPIC_LABELS[t])].join(" ").toLowerCase().includes(term);
    });
  }, [all, filter, search]);

  const columns: DataColumn<ResourceRow>[] = [
    {
      key: "title",
      header: "Article",
      sortValue: (r) => r.title.toLowerCase(),
      csvValue: (r) => r.title,
      render: (r) => (
        <span className="flex items-center gap-3">
          <span className="arch relative block h-11 w-9 shrink-0 overflow-hidden rounded-b-lg bg-[var(--sage-soft)]">
            {r.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- a thumbnail; the title beside it names the article
              <img src={r.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.title || "Untitled"}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">/resources/{r.slug || "…"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "format",
      header: "Kind",
      sortValue: (r) => r.format,
      csvValue: (r) => FORMAT_LABELS[r.format] ?? r.format,
      render: (r) => FORMAT_LABELS[r.format] ?? r.format,
    },
    {
      key: "topics",
      header: "Topics",
      hideBelow: "lg",
      csvValue: (r) => r.topics.map((t) => RESOURCE_TOPIC_LABELS[t]).join("; "),
      render: (r) => r.topics.map((t) => RESOURCE_TOPIC_LABELS[t]).join(", ") || "—",
    },
    {
      key: "minutes",
      header: "Time",
      align: "right",
      hideBelow: "lg",
      sortValue: (r) => r.readingMinutes,
      csvValue: (r) => r.readingMinutes,
      render: (r) => `${r.readingMinutes} min`,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => (r.live ? (r.draft ? 1 : 0) : 2),
      csvValue: (r) => (r.live ? (r.draft ? "Changes waiting" : "Published") : r.draft ? "Draft" : "Taken down"),
      render: (r) => <Status row={r} />,
    },
    {
      key: "changed",
      header: "Changed",
      align: "right",
      sortValue: (r) => r.changedAt,
      csvValue: (r) => (r.changedAt ? `${when(r.changedAt)} UTC` : ""),
      render: (r) => (
        <span className="whitespace-nowrap text-[var(--muted)]">{r.original && !r.draft ? "As shipped" : ago(r.changedAt, now)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageBar>
        <span className="font-display hidden shrink-0 text-[20px] font-medium sm:block">Resource centre</span>
        <SearchField value={search} onChange={setSearch} placeholder="Find an article by title, address or topic" label="Find an article" />
      </PageBar>

      <PageHeader
        breadcrumbs={[{ label: "Site content", href: "/admin/content" }, { label: "Resource centre" }]}
        eyebrow="Site content"
        lines={["The resource centre,", "article by article."]}
        lede="Write, fix, picture and take down the articles and exercises anyone can read for free. Drafts save as you type; nothing changes for readers until you publish."
        actions={<Button onClick={() => router.push(`/admin/content/resources/${newResourceId()}`)}>New article</Button>}
      />

      <motion.article
        whileHover={{ y: -3 }}
        transition={SPRING_SNAP}
        className="relative flex flex-col gap-3 rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] focus-within:ring-4 focus-within:ring-[var(--accent)]/20 md:flex-row md:items-center md:justify-between"
      >
        <div className="min-w-0">
          <h2 className="font-display text-[19px] font-medium leading-tight">
            <Link
              href="/admin/content/resources/page-words"
              className="outline-none after:absolute after:inset-0 after:rounded-[24px] after:content-['']"
            >
              The page around the library
            </Link>
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            Its heading and introduction, the note under the library, and the closing panel.
          </p>
          {page?.draft ? (
            <p className="mt-1.5 text-[12.5px] text-[var(--accent-deep)]">
              Draft saved {ago(page.draft.updatedAt, now)} by {nameFor(page.draft.updatedBy, names, user?.uid)}
            </p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-[13px] font-medium text-[var(--accent-deep)]">{page?.draft ? "Carry on editing" : "Edit"}</span>
          <a
            href="/resources"
            target="_blank"
            rel="noopener"
            className="relative z-10 -my-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-[var(--muted)] outline-none transition-colors hover:bg-[var(--sand)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
          >
            <GlyphExternal size={14} />
            View page
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
      </motion.article>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Published" value={rows ? counts.live : "—"} loading={!rows && !error} />
        <StatCard label="Drafts, not on the site" value={rows ? counts.off : "—"} loading={!rows && !error} />
        <StatCard label="Changes waiting" value={rows ? counts.waiting : "—"} loading={!rows && !error} />
        <StatCard
          label="Last published"
          value={rows ? (lastPublished ? ago(lastPublished, now) : "Never") : "—"}
          caption={lastPublished ? `${when(lastPublished)} UTC` : "Only the starter articles so far"}
          loading={!rows && !error}
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show articles that are">
        {FILTERS.map((f) => (
          <Pill key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} className="shrink-0">
            {f.label}
            <span className={`tabular-nums ${filter === f.id ? "text-white/80" : "text-[var(--muted)]"}`}>
              {rows ? counts[f.id] : "–"}
            </span>
          </Pill>
        ))}
      </div>

      {/* Keyed by the filter, so each opens on its own first page (DataTable takes its sort once). */}
      <DataTable
        key={filter}
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/content/resources/${r.id}`)}
        loading={rows === null && !error}
        error={error}
        initialSort={{ key: "changed", dir: "desc" }}
        empty={{
          title: search.trim() ? `Nothing called “${search.trim()}”` : "None here",
          description: search.trim() ? "Try another word, or clear the search." : "No article is in this state.",
        }}
        pageSize={25}
        stickyOffset={64}
        caption="Articles"
        csv={{ filename: "resource-centre.csv" }}
      />

      <Alert tone="info" title="The starter articles">
        The resource centre opened with a set of articles written into the site. They show exactly as written until you
        publish a change to one or take one down — and each can be put back to its original words from its history.
      </Alert>
    </div>
  );
}
