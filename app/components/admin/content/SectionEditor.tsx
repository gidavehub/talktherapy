"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Input";
import { Alert, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { IconHistory } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { PageBar } from "@/components/ui/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { useNow } from "@/lib/useNow";
import { watchVersions } from "@/lib/content/client";
import {
  CODE_OWNED_NOTICE,
  SECTIONS,
  type ContentOf,
  type ContentVersion,
  type Field,
  type Fields,
  type SectionId,
} from "@/lib/content/schema";
import type { Issue } from "@/lib/content/validate";
import { FieldControl, GroupFields } from "./fields/FieldControl";
import { FormContext, type FormContextValue } from "./fields/context";
import { useSectionDraft } from "./useSectionDraft";
import { useLibrary } from "./useLibrary";
import { useWide } from "./useWide";
import { useLeaveGuard } from "./useLeaveGuard";
import { useStaffNames, nameFor } from "./useStaffNames";
import { changedFields } from "./changes";
import { ago, when } from "./format";
import PreviewPane from "./PreviewPane";
import SeoPreview from "./SeoPreview";
import SaveStatus from "./SaveStatus";
import VersionHistory from "./VersionHistory";
import { GlyphChevron, GlyphExternal } from "./icons";

/**
 * One part of the public site, edited: the form drawn from its schema on one
 * side, the real page with the draft in it on the other (or one at a time on
 * a phone), and the way to publish, discard and undo.
 *
 * Every change is saved as a draft within a second, so the words are never
 * lost and another member of staff can pick them up; nothing reaches the
 * public site until Publish. Problems are pointed out under each field once
 * it has been left, and all at once when publishing is tried.
 */

function hasImages(fields: Fields): boolean {
  return Object.values(fields).some((field: Field) =>
    field.kind === "image"
      ? true
      : field.kind === "group"
        ? hasImages(field.fields)
        : field.kind === "list"
          ? hasImages({ item: field.item })
          : false,
  );
}

/** Whether a problem sits at a key or anywhere inside it. */
const under = (issue: Issue, key: string) => issue.key === key || issue.key.startsWith(`${key}.`);

export default function SectionEditor<S extends SectionId>({
  id,
  parent,
}: {
  id: S;
  /**
   * Where this section sits when it is not straight under Site content — the
   * resource centre's page, under Resource centre — and what to call it there.
   */
  parent?: { label: string; href: string; here: string };
}) {
  const def = SECTIONS[id];
  const fields = def.fields as Fields;
  const topKeys = Object.keys(fields);
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(60_000);
  const wide = useWide();
  const s = useSectionDraft(id);
  const guard = useLeaveGuard(s.unsaved, s.flush);
  const library = useLibrary(hasImages(fields));
  const formRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<"edit" | "preview">("edit");
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [reveal, setReveal] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(topKeys.slice(0, 1)));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<ContentVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  useEffect(
    () =>
      watchVersions(id, setVersions, () =>
        setVersionsError("The history could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [id],
  );

  const lastChange = versions?.[0] ?? null;
  const names = useStaffNames([s.draft?.updatedBy, s.othersEdit?.by, lastChange?.replacedBy]);
  const me = user?.uid;

  // ------------------------------------------------------------- problems

  const firstProblem = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of s.errors) if (!map.has(issue.key)) map.set(issue.key, issue.message);
    return map;
  }, [s.errors]);

  const form: FormContextValue = useMemo(
    () => ({
      problem: (key, always = false) => (reveal || always || touched.has(key) ? (firstProblem.get(key) ?? null) : null),
      problemsUnder: (key) =>
        new Set(s.errors.filter((issue) => under(issue, key) && (reveal || touched.has(issue.key))).map((i) => i.key))
          .size,
      touch: (key) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key))),
      media: library.media,
      addMedia: library.add,
    }),
    [reveal, touched, firstProblem, s.errors, library.media, library.add],
  );

  /** Show every problem, open what holds them, and go to the first. */
  function showProblems() {
    setReveal(true);
    setView("edit");
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const key of topKeys) if (s.errors.some((issue) => under(issue, key))) next.add(key);
      return next;
    });
    // Two frames: one for the cards to open, one for the problems to draw.
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
    if (s.errors.length) {
      showProblems();
      toast.error(
        `${s.errors.length} ${s.errors.length === 1 ? "thing needs" : "things need"} fixing first`,
        "Each one is marked in red.",
      );
      return;
    }
    setPublishOpen(true);
  }

  async function publish(anyway: boolean) {
    const out = await s.publish(note, anyway);
    if (out.ok) {
      setPublishOpen(false);
      setOverwriteOpen(false);
      setNote("");
      setTouched(new Set());
      setReveal(false);
      toast.success(
        "Published",
        out.refreshed ? "It is on the public site now." : "The public site will show it within five minutes.",
      );
      return;
    }
    setPublishOpen(false);
    setOverwriteOpen(false);
    if (out.code === "aborted" && !anyway) {
      setOverwriteOpen(true);
    } else if (out.issues.length) {
      showProblems();
      toast.error("Not published", out.error);
    } else {
      toast.error("Not published", out.error);
    }
  }

  async function discard() {
    const ok = await s.discard();
    setDiscardOpen(false);
    setTouched(new Set());
    setReveal(false);
    if (ok) toast.success("Draft thrown away", "The editor shows what is live again.");
    else toast.error("The draft was not thrown away", "Check your connection and try again.");
  }

  const changes = useMemo(
    () => (publishOpen && s.local ? changedFields(id, s.live?.data ?? null, s.local) : []),
    [publishOpen, id, s.live, s.local],
  );

  // ----------------------------------------------------------------- render

  const previewRoute = def.route ?? "/";
  const liveLine = s.live
    ? `Published ${ago(s.live.publishedAt, now)}${lastChange ? ` by ${nameFor(lastChange.replacedBy, names, me)}` : ""}`
    : s.live === null
      ? "Showing the original words — nothing published yet"
      : null;
  const staleBase = Boolean(s.live && s.draft && s.draft.baseRev < s.live.rev);
  const othersEditing = s.othersEdit && s.othersEdit.by !== me ? s.othersEdit : null;

  const preview =
    id === "seo" ? (
      s.local ? (
        <SeoPreview value={s.local as ContentOf<"seo">} />
      ) : null
    ) : (
      <PreviewPane
        route={previewRoute}
        version={s.previewVersion}
        label={def.kind === "page" ? `the ${def.label} page` : `the ${def.label.toLowerCase()}`}
        scrollTo={id === "footer" ? "bottom" : "top"}
        className={wide ? "h-full" : "h-[calc(100dvh-230px)] min-h-[480px]"}
      />
    );

  return (
    <div>
      <PageBar>
        <Link
          href={parent?.href ?? "/admin/content"}
          aria-label={parent ? `Back to ${parent.label}` : "Back to all of the site's content"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--sand)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] font-medium leading-tight">{def.label}</span>
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
          ...(parent ? [{ label: parent.label, href: parent.href }] : []),
          { label: parent?.here ?? def.label },
        ]}
        eyebrow={def.kind === "page" ? "Page" : "On every page"}
        lines={[def.label]}
        lede={def.description}
        actions={
          // Not "the live page": while the preview is on, this browser is
          // shown the drafts on every public page, this one included.
          def.route ? (
            <a
              href={def.route}
              target="_blank"
              rel="noopener"
              title="While the preview is on, this browser shows the page with the drafts in it."
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] px-5 text-[13.5px] font-medium outline-none transition-colors hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
            >
              <GlyphExternal size={15} />
              Open the page
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
              <span
                className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${
                  s.changed ? "bg-[var(--accent)] text-white" : "bg-[var(--sage)] text-white"
                }`}
              >
                {s.changed ? "Draft" : "Live"}
              </span>
              <span className="min-w-0">{liveLine}</span>
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
            Discard draft
          </Button>
          <Button size="sm" onClick={startPublish} disabled={!s.ready || !s.changed}>
            Publish
          </Button>
        </div>
      </section>

      <div className="mb-6 space-y-3">
        {staleBase ? (
          <Alert tone="warning" title="Published by someone else since this draft began">
            What is live now has changes this draft does not. Publishing replaces them — look at the history first.
          </Alert>
        ) : null}
        {othersEditing ? (
          <Alert tone="info" title={`${nameFor(othersEditing.by, names, me)} is editing this too`}>
            They saved changes to this draft {ago(othersEditing.at, now)}.{" "}
            {s.unsaved ? "Your newest words will replace theirs when they save." : "The editor shows their changes."}
          </Alert>
        ) : null}
        {s.ready && s.errors.length > 0 && !reveal && s.draft ? (
          <Alert
            tone="warning"
            title={`This draft has ${s.errors.length} ${s.errors.length === 1 ? "thing" : "things"} to fix before it can be published`}
            action={
              <Button size="sm" variant="secondary" onClick={showProblems}>
                Show them
              </Button>
            }
          >
            A field with a problem shows its original words in the preview until it is fixed.
          </Alert>
        ) : null}
        <details className="group rounded-2xl border border-[var(--border)] bg-[var(--dark)]/[.03] px-5 py-3">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 [&::-webkit-details-marker]:hidden">
            Set in code, not here
            <GlyphChevron size={15} className="text-[var(--muted)] group-open:rotate-180" />
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pb-1 pl-5 text-[13px] leading-relaxed text-[var(--muted)]">
            {[...def.locked, CODE_OWNED_NOTICE].map((line) => (
              <li key={line}>{line}</li>
            ))}
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
            { value: "preview", label: id === "seo" ? "In a search" : "Preview" },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}

      <div className={wide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6" : ""}>
        <div ref={formRef} className={!wide && view === "preview" ? "hidden" : "min-w-0 space-y-4"}>
          {!s.ready || !s.local ? (
            <SkeletonList count={4} label="Loading the editor" className="space-y-4">
              <Skeleton className="h-20 w-full" rounded="rounded-[24px]" />
            </SkeletonList>
          ) : (
            <FormContext.Provider value={form}>
              {topKeys.map((key) => {
                const field = fields[key];
                const value = (s.local as Record<string, unknown>)[key];
                const open = openGroups.has(key);
                const count = form.problemsUnder(key);
                const onChange = (next: unknown) =>
                  s.change((prev) => ({ ...(prev as Record<string, unknown>), [key]: next }) as ContentOf<S>);
                return (
                  <section key={key} className="rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
                    <h2>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`group-${key}`}
                        onClick={() =>
                          setOpenGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        className="flex min-h-16 w-full items-center gap-3 rounded-[24px] px-5 py-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 md:px-6"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[19px] font-medium leading-tight">{field.label}</span>
                          {field.help ? (
                            <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{field.help}</span>
                          ) : null}
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
                    <AnimatePresence initial={false}>
                      {open ? (
                        <motion.div
                          id={`group-${key}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={SPRING_SNAP}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-[var(--border)] px-5 pb-6 pt-5 md:px-6">
                            {field.kind === "group" ? (
                              <GroupFields fields={field.fields} value={value} onChange={onChange} path={[key]} />
                            ) : (
                              <FieldControl field={field} value={value} onChange={onChange} path={[key]} hideLabel />
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </section>
                );
              })}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setOpenGroups(openGroups.size === topKeys.length ? new Set() : new Set(topKeys))}
                  className="h-11 rounded-full px-4 text-[12.5px] text-[var(--accent-deep)] outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                >
                  {openGroups.size === topKeys.length ? "Fold every part" : "Open every part"}
                </button>
              </div>
            </FormContext.Provider>
          )}
        </div>

        {wide || view === "preview" ? (
          <div className={wide ? "sticky top-20 h-[calc(100dvh-6.5rem)] min-w-0" : "min-w-0"}>{preview}</div>
        ) : null}
      </div>

      <VersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sectionId={id}
        versions={versions}
        error={versionsError}
        live={s.live}
        hasDraft={Boolean(s.draft) || s.changed}
        onRevert={s.revert}
      />

      <ConfirmDialog
        open={publishOpen}
        title={`Publish ${def.label}?`}
        confirmLabel="Publish"
        onClose={() => setPublishOpen(false)}
        onConfirm={() => publish(false)}
        body={
          <div className="space-y-4">
            <p>
              It goes on the public site straight away
              {def.kind === "page" ? ` (${def.route})` : ", on every page"}. It can be undone from the history.
            </p>
            {changes.length ? (
              <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--foreground)]">
                  What changes
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
                  {changes.slice(0, 8).map((c) => (
                    <li key={c.key}>{c.label}</li>
                  ))}
                </ul>
                {changes.length > 8 ? (
                  <p className="mt-1.5 text-[12.5px]">and {changes.length - 8} more.</p>
                ) : null}
              </div>
            ) : null}
            {s.warnings.length ? (
              <Alert tone="warning" title="Worth a second look">
                {s.warnings.map((w) => w.message).join(" ")}
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
        open={overwriteOpen}
        title="Somebody else published this since you started"
        danger
        confirmLabel="Publish mine anyway"
        onClose={() => setOverwriteOpen(false)}
        onConfirm={() => publish(true)}
        body={
          <div className="space-y-2">
            <p>
              What is live now has changes that are not in your draft. Publishing yours replaces them. Look at the
              history to see what they changed.
            </p>
            {s.live ? <p>Live now: published {when(s.live.publishedAt)} (UTC).</p> : null}
          </div>
        }
      />

      <ConfirmDialog
        open={discardOpen}
        title="Throw this draft away?"
        danger
        confirmLabel="Discard draft"
        onClose={() => setDiscardOpen(false)}
        onConfirm={discard}
        body={
          <p>
            Every change not yet published is lost — yours, and anyone else&rsquo;s in this draft. The editor goes back
            to what is live. The public site does not change.
          </p>
        }
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
