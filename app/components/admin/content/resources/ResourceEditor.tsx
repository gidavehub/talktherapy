"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Input";
import { Alert, EmptyState, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { IconHistory, IconResources } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { PageBar } from "@/components/ui/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Slider, ToggleChips } from "@/components/apply/fields";
import { useNow } from "@/lib/useNow";
import { RESOURCE_TOPIC_LABELS } from "@/lib/models";
import { CODE_OWNED_NOTICE } from "@/lib/content/schema";
import {
  READING_MINUTES,
  RESOURCE_FIELDS,
  RESOURCE_FORMATS,
  RESOURCE_TOPICS,
  TOPICS_MAX,
  isSeedId,
  mergeResource,
  slugify,
  type EditableFormat,
  type ResourceContent,
  type ResourceVersion,
} from "@/lib/content/resources";
import { watchResourceIndex, watchResourceVersions, type ResourceRow } from "@/lib/content/resources-client";
import type { Issue } from "@/lib/content/validate";
import TextControl from "../fields/TextControl";
import RichTextControl from "../fields/RichTextControl";
import ImageControl from "../fields/ImageControl";
import { FormContext, type FormContextValue } from "../fields/context";
import { LABEL } from "../fields/FieldShell";
import { useLibrary } from "../useLibrary";
import { useWide } from "../useWide";
import { useLeaveGuard } from "../useLeaveGuard";
import { useStaffNames, nameFor } from "../useStaffNames";
import { summarise } from "../changes";
import { ago, when } from "../format";
import PreviewPane from "../PreviewPane";
import SaveStatus from "../SaveStatus";
import { GlyphChevron, GlyphExternal } from "../icons";
import { useResourceDraft } from "./useResourceDraft";
import { resourceChanges } from "./changes";
import ResourceHistory from "./ResourceHistory";
import SlugField from "./SlugField";

/**
 * One article in the resource centre, edited: its words, its address, what
 * it is about, its picture — and, beside them, the real article page with
 * the draft in it (one at a time on a phone).
 *
 * Saved as a draft within a second of each change; nothing reaches the site
 * until Publish. It can be taken off the site and put back, and every change
 * can be undone from its history.
 */

const PART_IDS = ["words", "about", "cover"] as const;
type Part = (typeof PART_IDS)[number];

/** Which card holds each field, to open the right one when there is a problem in it. */
const PART_OF: Record<string, Part> = {
  title: "words",
  summary: "words",
  body: "words",
  slug: "about",
  format: "about",
  topics: "about",
  readingMinutes: "about",
  cover: "cover",
};

const PARTS: { id: Part; title: string; help: string }[] = [
  { id: "words", title: "The words", help: "Its title, the summary on its card, and the article itself." },
  { id: "about", title: "Where it lives and what it is", help: "Its web address, what kind of thing it is, its topics, how long it takes." },
  { id: "cover", title: "Cover picture", help: "Optional. Shown on its card in the library and at the top of the article." },
];

export default function ResourceEditor({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(60_000);
  const wide = useWide();
  const library = useLibrary(true);
  const formRef = useRef<HTMLDivElement>(null);

  // Every other article, for which addresses are taken.
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  useEffect(() => watchResourceIndex(setRows, () => setRows([])), []);
  const takenBy = useCallback(
    (slug: string) => rows?.find((row) => row.id !== id && row.liveSlug === slug)?.id ?? null,
    [rows, id],
  );

  const s = useResourceDraft(id, takenBy);
  const guard = useLeaveGuard(s.unsaved, s.flush);

  const [view, setView] = useState<"edit" | "preview">("edit");
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [reveal, setReveal] = useState(false);
  const [openParts, setOpenParts] = useState<Set<Part>>(() => new Set(PART_IDS));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<ResourceVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  useEffect(
    () =>
      watchResourceVersions(id, setVersions, () =>
        setVersionsError("The history could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [id],
  );

  const lastChange = versions?.[0] ?? null;
  const names = useStaffNames([s.draft?.updatedBy, s.othersEdit?.by, lastChange?.replacedBy]);
  const me = user?.uid;
  const seed = isSeedId(id);

  // ------------------------------------------------------------- problems

  // What the function refused that the editor could not know — an address
  // published a moment ago by someone else — shown until the words change.
  const [refused, setRefused] = useState<{ on: ResourceContent | null; issues: Issue[] }>({ on: null, issues: [] });
  const errors = useMemo(
    () => (refused.on !== null && refused.on === s.local ? [...s.errors, ...refused.issues] : s.errors),
    [refused, s.local, s.errors],
  );

  const firstProblem = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of errors) if (!map.has(issue.key)) map.set(issue.key, issue.message);
    return map;
  }, [errors]);

  const visible = useCallback((issue: Issue) => reveal || touched.has(issue.key), [reveal, touched]);

  const form: FormContextValue = useMemo(
    () => ({
      problem: (key, always = false) => (reveal || always || touched.has(key) ? (firstProblem.get(key) ?? null) : null),
      problemsUnder: (key) => errors.filter((issue) => issue.key === key && visible(issue)).length,
      touch: (key) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key))),
      media: library.media,
      addMedia: library.add,
    }),
    [reveal, touched, firstProblem, errors, visible, library.media, library.add],
  );

  const problemsIn = (part: Part) => errors.filter((issue) => PART_OF[issue.key] === part && visible(issue)).length;

  /** Show every problem, open the cards that hold them, and go to the first. */
  function showProblems(issues: Issue[] = errors) {
    setReveal(true);
    setView("edit");
    setOpenParts((prev) => new Set([...prev, ...issues.map((issue) => PART_OF[issue.key] ?? "words")]));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-problem]');
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (first?.matches("input, textarea")) first.focus({ preventScroll: true });
      }),
    );
  }

  // --------------------------------------------------------------- actions

  function startPublish() {
    if (errors.length) {
      showProblems();
      toast.error(
        `${errors.length} ${errors.length === 1 ? "thing needs" : "things need"} fixing first`,
        "Each one is marked in red.",
      );
      return;
    }
    setPublishOpen(true);
  }

  async function publish(anyway: boolean) {
    const out = await s.publish(note, anyway);
    setPublishOpen(false);
    setOverwriteOpen(false);
    if (out.ok) {
      setNote("");
      setTouched(new Set());
      setReveal(false);
      toast.success(
        "Published",
        out.refreshed ? "It is in the resource centre now." : "The resource centre will show it within five minutes.",
      );
    } else if (out.code === "aborted" && !anyway) {
      setOverwriteOpen(true);
    } else {
      if (out.issues.length) {
        setRefused({ on: s.local, issues: out.issues });
        showProblems(out.issues);
      }
      toast.error("Not published", out.error);
    }
  }

  async function unpublish() {
    const out = await s.unpublish(note);
    setUnpublishOpen(false);
    if (out.ok) {
      setNote("");
      toast.success(
        "Taken off the site",
        out.refreshed ? "Its words are kept here as a draft." : "It will be gone within five minutes. Its words are kept here.",
      );
    } else {
      toast.error("Not taken off", out.error);
    }
  }

  async function discard() {
    const outcome = await s.discard();
    setDiscardOpen(false);
    setTouched(new Set());
    setReveal(false);
    if (outcome === "deleted") {
      toast.success("Article deleted", "It was not on the site, so nothing there changes.");
      router.push("/admin/content/resources");
    } else if (outcome === "discarded") {
      toast.success("Draft thrown away", s.isLive ? "The editor shows what is live again." : "The editor shows its original words.");
    } else {
      toast.error("The draft was not thrown away", "Check your connection and try again.");
    }
  }

  const changes = useMemo(
    () => (publishOpen && s.local ? resourceChanges(s.showing, s.local) : []),
    [publishOpen, s.showing, s.local],
  );

  /** Change one part of the article; a new article's address follows its title until it is changed by hand. */
  function set<K extends keyof ResourceContent>(key: K, next: ResourceContent[K]) {
    s.change((prev) => {
      const updated = { ...prev, [key]: next };
      if (key === "title" && !s.isLive && (prev.slug === "" || prev.slug === slugify(prev.title))) {
        updated.slug = slugify(String(next));
      }
      return updated;
    });
  }

  // ----------------------------------------------------------------- render

  const local = s.local;
  const title = local?.title.trim() || (s.ready ? "A new article" : "Article");
  const live = s.live;
  const statusLine = !s.ready
    ? null
    : live?.status === "published"
      ? `Published ${ago(live.updatedAt, now)}${lastChange ? ` by ${nameFor(lastChange.replacedBy, names, me)}` : ""}`
      : s.isLive
        ? "On the site with the words it shipped with"
        : live?.status === "withdrawn"
          ? `Taken off the site ${ago(live.updatedAt, now)}${lastChange ? ` by ${nameFor(lastChange.replacedBy, names, me)}` : ""}`
          : "Not published yet";
  const staleBase = Boolean(live && s.draft && s.draft.baseRev < live.rev && s.isLive);
  const othersEditing = s.othersEdit && s.othersEdit.by !== me ? s.othersEdit : null;
  const pill = !s.isLive
    ? { label: "Not on the site", tone: "bg-[var(--sand)] text-[var(--foreground)]" }
    : s.changed
      ? { label: "Changes waiting", tone: "bg-[var(--accent)] text-white" }
      : { label: "Live", tone: "bg-[var(--sage)] text-white" };

  // The preview shows the saved draft over what is live, as the server will.
  const previewed = s.draft ? mergeResource(s.draft.data, s.showing) : s.showing;
  const preview = previewed ? (
    <PreviewPane
      route={`/resources/${previewed.slug}`}
      version={s.previewVersion}
      label="the article"
      className={wide ? "h-full" : "h-[calc(100dvh-230px)] min-h-[480px]"}
    />
  ) : (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-[24px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <EmptyState
        icon={<IconResources />}
        title="Nothing to preview yet"
        description="Write a title, a summary and the article, and give it a web address. The preview shows it once the draft has saved."
      />
    </div>
  );

  const discardBody = s.isLive ? (
    <p>
      Every change not yet published is lost — yours, and anyone else&rsquo;s in this draft. The editor goes back to what is
      live. The site does not change.
    </p>
  ) : seed ? (
    <p>
      Every change in this draft is lost. The editor starts again from the words this article shipped with. It stays off
      the site.
    </p>
  ) : (
    <p>
      This article is not on the site, so its draft is all there is of it: throwing it away deletes the article. Anything it
      once published stays in its history.
    </p>
  );

  return (
    <div>
      <PageBar>
        <Link
          href="/admin/content/resources"
          aria-label="Back to the resource centre"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--sand)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] font-medium leading-tight">{title}</span>
          {s.ready ? (
            <SaveStatus
              state={s.save.state}
              savedAt={s.save.at}
              draft={s.draft ? { updatedAt: s.draft.updatedAt, by: nameFor(s.draft.updatedBy, names, me) } : null}
              changed={s.changed}
              announce={false}
              className="!text-[11.5px]"
            />
          ) : null}
        </span>
        <Button size="sm" onClick={startPublish} disabled={!s.ready || !s.changed}>
          Publish
        </Button>
      </PageBar>

      <PageHeader
        breadcrumbs={[
          { label: "Site content", href: "/admin/content" },
          { label: "Resource centre", href: "/admin/content/resources" },
          { label: title },
        ]}
        eyebrow={local ? (RESOURCE_FORMATS.find((f) => f.value === local.format)?.label ?? "Article") : "Article"}
        lines={[title]}
        lede={s.showing ? `In the resource centre at /resources/${s.showing.slug}.` : "Not in the resource centre yet."}
        actions={
          s.showing ? (
            <a
              href={`/resources/${s.showing.slug}`}
              target="_blank"
              rel="noopener"
              title="While the preview is on, this browser shows the article with the draft in it."
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] px-5 text-[13.5px] font-medium outline-none transition-colors hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
            >
              <GlyphExternal size={15} />
              Open the article
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : undefined
        }
      />

      {s.loadError ? (
        <Alert tone="warning" title="Not loaded" className="mb-6">
          {s.loadError}
        </Alert>
      ) : null}

      {/* Where it stands, and what can be done with it. */}
      <section
        aria-label="Status"
        className="mb-6 flex flex-col gap-4 rounded-[24px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between md:p-5"
      >
        {s.ready ? (
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${pill.tone}`}>
                {pill.label}
              </span>
              <span className="min-w-0">{statusLine}</span>
            </p>
            <SaveStatus
              state={s.save.state}
              savedAt={s.save.at}
              draft={s.draft ? { updatedAt: s.draft.updatedAt, by: nameFor(s.draft.updatedBy, names, me) } : null}
              changed={s.changed}
            />
          </div>
        ) : (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
            <span className="flex items-center gap-2">
              <IconHistory size={15} />
              History
            </span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDiscardOpen(true)} disabled={!s.ready || (!s.draft && !s.changed)}>
            {s.isLive || seed ? "Discard draft" : "Delete"}
          </Button>
          {s.isLive ? (
            <Button size="sm" variant="ghost" onClick={() => setUnpublishOpen(true)} disabled={!s.ready}>
              Take off the site
            </Button>
          ) : null}
          <Button size="sm" onClick={startPublish} disabled={!s.ready || !s.changed}>
            Publish
          </Button>
        </div>
      </section>

      <div className="mb-6 space-y-3">
        {staleBase ? (
          <Alert tone="warning" title="Changed by someone else since this draft began">
            What is live now has changes this draft does not. Publishing replaces them — look at the history first.
          </Alert>
        ) : null}
        {othersEditing ? (
          <Alert tone="info" title={`${nameFor(othersEditing.by, names, me)} is editing this too`}>
            They saved changes to this draft {ago(othersEditing.at, now)}.{" "}
            {s.unsaved ? "Your newest words will replace theirs when they save." : "The editor shows their changes."}
          </Alert>
        ) : null}
        {s.ready && errors.length > 0 && !reveal && s.draft ? (
          <Alert
            tone="warning"
            title={`This draft has ${errors.length} ${errors.length === 1 ? "thing" : "things"} to fix before it can be published`}
            action={
              <Button size="sm" variant="secondary" onClick={() => showProblems()}>
                Show them
              </Button>
            }
          >
            The preview shows what is live in place of anything that cannot be used yet.
          </Alert>
        ) : null}
        <details className="group rounded-2xl border border-[var(--border)] bg-[var(--dark)]/[.03] px-5 py-3">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 [&::-webkit-details-marker]:hidden">
            Set in code, not here
            <GlyphChevron size={15} className="text-[var(--muted)] group-open:rotate-180" />
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pb-1 pl-5 text-[13px] leading-relaxed text-[var(--muted)]">
            <li>
              The two notes under every article — that it is general information, not medical advice, and what to do in an
              emergency — are the same on every article, so nobody has to remember them.
            </li>
            <li>{CODE_OWNED_NOTICE} Write “see the emergency contacts page” and link to /crisis instead.</li>
            <li>Prices are placeholders such as {"{firstPrice}"}, filled in from what TALK actually charges.</li>
          </ul>
        </details>
      </div>

      {!wide ? (
        <SegmentedControl
          ariaLabel="Edit or preview"
          fullWidth
          className="mb-5"
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}

      <div className={wide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6" : ""}>
        <div ref={formRef} className={!wide && view === "preview" ? "hidden" : "min-w-0 space-y-4"}>
          {!s.ready || !local ? (
            <SkeletonList count={3} label="Loading the editor" className="space-y-4">
              <Skeleton className="h-20 w-full" rounded="rounded-[24px]" />
            </SkeletonList>
          ) : (
            <FormContext.Provider value={form}>
              {PARTS.map((part) => {
                const open = openParts.has(part.id);
                const count = problemsIn(part.id);
                return (
                  <section key={part.id} className="rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
                    <h2>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`part-${part.id}`}
                        onClick={() =>
                          setOpenParts((prev) => {
                            const next = new Set(prev);
                            if (next.has(part.id)) next.delete(part.id);
                            else next.add(part.id);
                            return next;
                          })
                        }
                        className="flex min-h-16 w-full items-center gap-3 rounded-[24px] px-5 py-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 md:px-6"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[19px] font-medium leading-tight">{part.title}</span>
                          <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{part.help}</span>
                        </span>
                        {count ? (
                          <span
                            data-problem
                            className="shrink-0 rounded-full bg-[var(--danger)] px-2.5 py-1 text-[11px] font-medium text-white"
                          >
                            {count} to fix
                          </span>
                        ) : null}
                        <GlyphChevron open={open} size={18} className="shrink-0 text-[var(--muted)]" />
                      </button>
                    </h2>
                    {open ? (
                      <div id={`part-${part.id}`} className="space-y-5 border-t border-[var(--border)] px-5 pb-6 pt-5 md:px-6">
                        {part.id === "words" ? (
                          <>
                            <TextControl
                              field={RESOURCE_FIELDS.title}
                              value={local.title}
                              onChange={(next) => set("title", next)}
                              fieldKey="title"
                            />
                            <TextControl
                              field={RESOURCE_FIELDS.summary}
                              value={local.summary}
                              onChange={(next) => set("summary", next)}
                              fieldKey="summary"
                            />
                            <RichTextControl
                              field={RESOURCE_FIELDS.body}
                              value={local.body}
                              onChange={(next) => set("body", next)}
                              fieldKey="body"
                            />
                          </>
                        ) : part.id === "about" ? (
                          <>
                            <SlugField
                              value={local.slug}
                              title={local.title}
                              live={s.isLive}
                              onChange={(next) => set("slug", next)}
                            />
                            <Dropdown<EditableFormat>
                              label={RESOURCE_FIELDS.format.label}
                              options={RESOURCE_FORMATS.map((f) => ({ value: f.value, label: f.label, description: f.description }))}
                              value={local.format}
                              error={form.problem("format")}
                              onChange={(next) => {
                                set("format", next);
                                form.touch("format");
                              }}
                            />
                            <ToggleChips
                              legend="Topics"
                              hint={`What it is about: the library's filters. Up to ${TOPICS_MAX}.`}
                              options={RESOURCE_TOPICS.map((topic) => ({ value: topic, label: RESOURCE_TOPIC_LABELS[topic] }))}
                              value={local.topics}
                              max={TOPICS_MAX}
                              error={form.problem("topics")}
                              onChange={(next) => {
                                set("topics", next);
                                form.touch("topics");
                              }}
                            />
                            <div>
                              <div className="flex items-end justify-between gap-3">
                                <p className={LABEL}>Reading time</p>
                                <p className="text-[13px] font-medium tabular-nums">
                                  {local.readingMinutes} {local.readingMinutes === 1 ? "minute" : "minutes"}
                                </p>
                              </div>
                              <Slider
                                label="Reading time, in minutes"
                                value={local.readingMinutes}
                                min={READING_MINUTES.min}
                                max={READING_MINUTES.max}
                                step={1}
                                format={(v) => `${v} min`}
                                onChange={(next) => set("readingMinutes", next)}
                              />
                              {form.problem("readingMinutes") ? (
                                <p className="text-[12.5px] leading-snug text-[var(--danger)]">{form.problem("readingMinutes")}</p>
                              ) : (
                                <p className="text-[12px] leading-snug text-[var(--muted)]">
                                  Shown on its card. About 200 words a minute, longer for an exercise done as it is read.
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <ImageControl
                            field={RESOURCE_FIELDS.cover}
                            value={local.cover}
                            onChange={(next) => set("cover", next)}
                            fieldKey="cover"
                            optional
                          />
                        )}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </FormContext.Provider>
          )}
        </div>

        {wide || view === "preview" ? (
          <div className={wide ? "sticky top-20 h-[calc(100dvh-6.5rem)] min-w-0" : "min-w-0"}>{preview}</div>
        ) : null}
      </div>

      <ResourceHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        id={id}
        versions={versions}
        error={versionsError}
        showing={s.showing}
        hasDraft={Boolean(s.draft) || s.changed}
        onRevert={s.revert}
      />

      <ConfirmDialog
        open={publishOpen}
        title={s.isLive ? "Publish these changes?" : "Publish this article?"}
        confirmLabel="Publish"
        onClose={() => setPublishOpen(false)}
        onConfirm={() => publish(false)}
        body={
          <div className="space-y-4">
            <p>
              It goes into the resource centre straight away{local ? `, at /resources/${local.slug}` : ""}. It can be undone
              from the history.
            </p>
            {s.isLive && changes.length ? (
              <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--foreground)]">What changes</p>
                <p className="mt-2 text-[13px]">{summarise(changes, 8)}</p>
              </div>
            ) : null}
            {s.showing && local && s.showing.slug !== local.slug ? (
              <Alert tone="warning" title="Its address changes">
                Links to /resources/{s.showing.slug} stop working.
              </Alert>
            ) : null}
            <Textarea
              label="A note for the history (optional)"
              hint="Why it changed, in a few words — for whoever looks back at it."
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        }
      />

      <ConfirmDialog
        open={unpublishOpen}
        title="Take this article off the site?"
        danger
        confirmLabel="Take it off"
        onClose={() => setUnpublishOpen(false)}
        onConfirm={unpublish}
        body={
          <div className="space-y-4">
            <p>
              It leaves the resource centre straight away, and /resources/{s.showing?.slug} stops working. Its words stay here
              as a draft, to publish again whenever you like.
            </p>
            <Textarea
              label="A note for the history (optional)"
              hint="Why it came down, in a few words."
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        }
      />

      <ConfirmDialog
        open={overwriteOpen}
        title="Somebody else changed this since you started"
        danger
        confirmLabel="Publish mine anyway"
        onClose={() => setOverwriteOpen(false)}
        onConfirm={() => publish(true)}
        body={
          <div className="space-y-2">
            <p>
              What is live now has changes that are not in your draft. Publishing yours replaces them. Look at the history to
              see what they changed.
            </p>
            {live ? <p>Last changed {when(live.updatedAt)} (UTC).</p> : null}
          </div>
        }
      />

      <ConfirmDialog
        open={discardOpen}
        title={s.isLive || seed ? "Throw this draft away?" : "Delete this article?"}
        danger
        confirmLabel={s.isLive || seed ? "Discard draft" : "Delete it"}
        onClose={() => setDiscardOpen(false)}
        onConfirm={discard}
        body={discardBody}
      />

      <ConfirmDialog
        open={guard.blocked !== null}
        title="Your last changes are not saved"
        danger
        confirmLabel="Leave without them"
        cancelLabel="Stay"
        onClose={guard.stay}
        onConfirm={guard.leave}
        body={<p>They could not be saved — the connection may be down. Stay, and they are saved as soon as it is back.</p>}
      />
    </div>
  );
}
