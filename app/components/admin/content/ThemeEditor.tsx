"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ColorPicker, { type ContrastTarget } from "@/components/ui/ColorPicker";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Input";
import { Alert, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { IconHistory } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { PageBar } from "@/components/ui/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useNow } from "@/lib/useNow";
import { formatRatio, isHex } from "@/lib/contrast";
import { watchVersions } from "@/lib/content/client";
import { CODE_OWNED_NOTICE, SECTIONS, defaultContent, type ContentVersion } from "@/lib/content/schema";
import { AA_RATIO, THEME_DEFAULTS, THEME_TOKENS, checkTheme, type ThemeColors, type ThemeToken } from "@/lib/content/theme";
import { useSectionDraft } from "./useSectionDraft";
import { useWide } from "./useWide";
import { useLeaveGuard } from "./useLeaveGuard";
import { nameFor, useStaffNames } from "./useStaffNames";
import { changedFields } from "./changes";
import { ago, when } from "./format";
import SaveStatus from "./SaveStatus";
import ThemeSample from "./ThemeSample";
import VersionHistory from "./VersionHistory";

/**
 * The public site's colours. A picker for each brand colour, grouped as
 * people think of them; the contrast that matters checked as each is
 * picked; the palette shown on buttons, cards, headings, the footer band
 * and TALK's screen as it is chosen.
 *
 * A palette that makes a guarded pair harder to read than the site is today
 * cannot be published (publishContent refuses it too). One below the 4.5:1
 * that small text needs is allowed, with a warning.
 *
 * Saved as a draft like any other section, and published, undone and
 * discarded the same way.
 */

const GROUPS: { title: string; lede: string; tokens: ThemeToken[] }[] = [
  {
    title: "Brand",
    lede: "Terracotta for what to press, sage for arches and the second line of headings, peach for warmth.",
    tokens: ["accent", "accent-deep", "accent-soft", "peach", "sage", "sage-deep", "sage-soft", "sage-pale"],
  },
  {
    title: "Surfaces",
    lede: "What the words sit on: the page, the cards, the bands, the dark footer and TALK's screen.",
    tokens: ["background", "surface", "cream", "sand", "dark", "stage"],
  },
  {
    title: "Text",
    lede: "The words themselves, and the quieter words for times and notes.",
    tokens: ["foreground", "muted"],
  },
];

/** What each colour is read against, for the picker's own contrast readout. */
function targetsFor(token: ThemeToken, c: ThemeColors): ContrastTarget[] {
  switch (token) {
    case "foreground":
      return [
        { name: "Page background", value: c.background },
        { name: "Cards", value: c.surface },
      ];
    case "muted":
      return [
        { name: "Page background", value: c.background },
        { name: "Cards", value: c.surface },
      ];
    case "background":
    case "surface":
    case "cream":
    case "sand":
    case "sage-pale":
      return [{ name: "Text", value: c.foreground, use: "text" }];
    case "sage":
      // The italic second line of headings, and the fill of sage buttons.
      return [
        { name: "Page background", value: c.background },
        { name: "White text", value: "#FFFFFF", use: "text" },
      ];
    case "accent":
    case "accent-deep":
    case "sage-deep":
      return [{ name: "White text", value: "#FFFFFF", use: "text" }];
    case "dark":
    case "stage":
      return [{ name: "Cream text", value: c.cream, use: "text" }];
    default:
      return [];
  }
}

function safeColors(stored: Partial<Record<ThemeToken, string>> | undefined): ThemeColors {
  const colors = { ...THEME_DEFAULTS };
  for (const token of THEME_TOKENS) {
    const value = stored?.[token];
    if (typeof value === "string" && isHex(value)) colors[token] = value;
  }
  return colors;
}

const STATUS_STYLES = {
  ok: "bg-[var(--sage-deep)] text-white",
  warn: "bg-[var(--warning-soft)] text-[var(--foreground)] ring-1 ring-inset ring-[var(--warning)]/40",
  block: "bg-[var(--danger)] text-white",
} as const;

const STATUS_LABELS = { ok: "Readable", warn: "Below AA", block: "Too faint" } as const;

export default function ThemeEditor() {
  const def = SECTIONS.theme;
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(60_000);
  const wide = useWide();
  const s = useSectionDraft("theme");
  const guard = useLeaveGuard(s.unsaved, s.flush);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<ContentVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  useEffect(
    () =>
      watchVersions("theme", setVersions, () =>
        setVersionsError("The history could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [],
  );

  const lastChange = versions?.[0] ?? null;
  const names = useStaffNames([s.draft?.updatedBy, lastChange?.replacedBy]);
  const me = user?.uid;

  // A stored draft keeps whatever string it holds; one that is not a colour
  // is shown as the original, as the public site would show it, rather than
  // breaking the contrast sums.
  const stored = s.local?.colors;
  const colors = useMemo(() => safeColors(stored), [stored]);
  const checks = useMemo(() => checkTheme(colors), [colors]);
  const blocked = checks.filter((c) => c.status === "block");
  const isOriginal = (Object.keys(THEME_DEFAULTS) as ThemeToken[]).every(
    (token) => colors[token]?.toUpperCase() === THEME_DEFAULTS[token],
  );
  const problemFor = (token: ThemeToken) => s.errors.find((e) => e.key === `colors.${token}`)?.message ?? null;

  function pick(token: ThemeToken, value: string) {
    s.change((prev) => ({ ...prev, colors: { ...prev.colors, [token]: value } }));
  }

  function startPublish() {
    if (s.errors.length) {
      toast.error("Not yet", blocked.length ? "Some text would be too faint to read. Each pair is marked." : s.errors[0].message);
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
      toast.success(
        "Colours published",
        out.refreshed ? "The public site shows them now." : "The public site will show them within five minutes.",
      );
    } else if (out.code === "aborted" && !anyway) {
      setOverwriteOpen(true);
    } else {
      toast.error("Not published", out.error);
    }
  }

  const changes = useMemo(
    () => (publishOpen && s.local ? changedFields("theme", s.live?.data ?? null, s.local) : []),
    [publishOpen, s.live, s.local],
  );

  const liveLine = s.live
    ? `Published ${ago(s.live.publishedAt, now)}${lastChange ? ` by ${nameFor(lastChange.replacedBy, names, me)}` : ""}`
    : s.live === null
      ? "The original colours — nothing published yet"
      : null;
  const draftInfo = s.draft ? { updatedAt: s.draft.updatedAt, by: nameFor(s.draft.updatedBy, names, me) } : null;

  const checksCard = (
    <section aria-labelledby="contrast-title" className="rounded-[24px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
      <h2 id="contrast-title" className="font-display text-[20px] font-medium">
        Can it be read?
      </h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--muted)]">
        Each pair is held to the contrast the site has today. {formatRatio(AA_RATIO)} is what small text needs to be easy
        to read.
      </p>
      <ul className="mt-4 space-y-2.5" aria-live="polite">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] font-display text-[16px] font-medium"
              style={{ background: check.on, color: check.text }}
            >
              Aa
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
              <span className="block">{check.label}</span>
              <span className="block tabular-nums text-[var(--muted)]">
                {formatRatio(check.ratio)} · today {formatRatio(check.floor)}
              </span>
            </span>
            <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium ${STATUS_STYLES[check.status]}`}>
              {STATUS_LABELS[check.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );

  const pickers = (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <section
          key={group.title}
          aria-labelledby={`colours-${group.title}`}
          className="rounded-[24px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6"
        >
          <h2 id={`colours-${group.title}`} className="font-display text-[20px] font-medium">
            {group.title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--muted)]">{group.lede}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {group.tokens.map((token) => {
              const field = def.fields.colors.fields[token];
              const problem = problemFor(token);
              const changedFromOriginal = colors[token]?.toUpperCase() !== THEME_DEFAULTS[token];
              return (
                <div key={token} className="min-w-0">
                  <ColorPicker
                    label={field.label}
                    hint={field.help}
                    value={colors[token]}
                    against={targetsFor(token, colors)}
                    onChange={(value) => pick(token, value)}
                  />
                  {problem ? (
                    <p role="alert" className="mt-2 text-[12.5px] leading-snug text-[var(--danger)]">
                      {problem}
                    </p>
                  ) : null}
                  {changedFromOriginal ? (
                    <button
                      type="button"
                      onClick={() => pick(token, THEME_DEFAULTS[token])}
                      className="mt-1.5 flex min-h-11 items-center gap-2 rounded-full px-2 text-[12px] text-[var(--accent-deep)] outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                    >
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-full border border-[var(--dark)]/15"
                        style={{ background: THEME_DEFAULTS[token] }}
                      />
                      Back to the original, {THEME_DEFAULTS[token]}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div>
      <PageBar>
        <Link
          href="/admin/content"
          aria-label="Back to all of the site's content"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--sand)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] font-medium leading-tight">Colours</span>
          {s.ready ? (
            <SaveStatus
              state={s.save.state}
              savedAt={s.save.at}
              draft={draftInfo}
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
        breadcrumbs={[{ label: "Site content", href: "/admin/content" }, { label: "Colours" }]}
        eyebrow="On every page"
        lines={["Colours,", "checked before they go live."]}
        lede={def.description}
      />

      {s.loadError ? (
        <Alert tone="warning" title="Not loaded" className="mb-6">
          {s.loadError}
        </Alert>
      ) : null}

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
            <SaveStatus state={s.save.state} savedAt={s.save.at} draft={draftInfo} changed={s.changed} />
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
          <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)} disabled={!s.ready || isOriginal}>
            Reset to the original
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
        {blocked.length ? (
          <Alert tone="warning" title="Some text would be too faint to read">
            {blocked.map((c) => c.label).join("; ")}. Choose colours with more contrast, or put the original back —
            this palette cannot be published as it is.
          </Alert>
        ) : null}
        <Alert tone="info" title="Set in code, not here">
          {[...def.locked, CODE_OWNED_NOTICE].join(" ")}
        </Alert>
      </div>

      {!wide ? (
        <SegmentedControl
          ariaLabel="Colours or preview"
          fullWidth
          className="mb-5"
          options={[
            { value: "edit", label: "Colours" },
            { value: "preview", label: "Preview" },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}

      {!s.ready ? (
        <SkeletonList count={3} label="Loading the colours" className="space-y-4">
          <Skeleton className="h-48 w-full" rounded="rounded-[24px]" />
        </SkeletonList>
      ) : wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6">
          <div className="min-w-0 space-y-4">
            {checksCard}
            {pickers}
          </div>
          <div className="sticky top-20 min-w-0">
            <ThemeSample colors={colors} />
          </div>
        </div>
      ) : view === "edit" ? (
        <div className="space-y-4">
          {checksCard}
          {pickers}
        </div>
      ) : (
        <div className="space-y-4">
          <ThemeSample colors={colors} />
          {checksCard}
        </div>
      )}

      <VersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sectionId="theme"
        versions={versions}
        error={versionsError}
        live={s.live}
        hasDraft={Boolean(s.draft) || s.changed}
        onRevert={s.revert}
      />

      <ConfirmDialog
        open={publishOpen}
        title="Publish these colours?"
        confirmLabel="Publish"
        onClose={() => setPublishOpen(false)}
        onConfirm={() => publish(false)}
        body={
          <div className="space-y-4">
            <p>Every public page changes colour straight away. It can be undone from the history.</p>
            {changes.length ? (
              <ul className="space-y-1.5 rounded-2xl bg-[var(--background)] px-4 py-3 text-[13px]">
                {changes.map((c) => {
                  const token = c.key.replace("colors.", "") as ThemeToken;
                  const before = ((s.live?.data?.colors ?? THEME_DEFAULTS) as ThemeColors)[token];
                  return (
                    <li key={c.key} className="flex items-center gap-2">
                      <span aria-hidden className="h-4 w-4 rounded-full border border-[var(--dark)]/15" style={{ background: before }} />
                      <span aria-hidden>→</span>
                      <span aria-hidden className="h-4 w-4 rounded-full border border-[var(--dark)]/15" style={{ background: colors[token] }} />
                      <span>
                        {c.label.replace(/^Colours › /, "")}: {before} to {colors[token]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {s.warnings.length ? (
              <Alert tone="warning" title="Allowed, but worth a second look">
                {s.warnings.map((w) => w.message).join(" ")}
              </Alert>
            ) : null}
            <Textarea
              label="A note for the history (optional)"
              hint="Why the colours changed, in a few words."
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
        title="Somebody else published colours since you started"
        danger
        confirmLabel="Publish mine anyway"
        onClose={() => setOverwriteOpen(false)}
        onConfirm={() => publish(true)}
        body={
          <div className="space-y-2">
            <p>Publishing yours replaces theirs. Look at the history to see what they changed.</p>
            {s.live ? <p>Live now: published {when(s.live.publishedAt)} (UTC).</p> : null}
          </div>
        }
      />

      <ConfirmDialog
        open={resetOpen}
        title="Put every colour back to the original?"
        confirmLabel="Reset"
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          s.change(() => defaultContent("theme"));
          setResetOpen(false);
        }}
        body={<p>The draft goes back to the colours the site was built with. Nothing changes on the public site until you publish.</p>}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Throw this draft away?"
        danger
        confirmLabel="Discard draft"
        onClose={() => setDiscardOpen(false)}
        onConfirm={async () => {
          const ok = await s.discard();
          setDiscardOpen(false);
          if (ok) toast.success("Draft thrown away", "The editor shows the live colours again.");
          else toast.error("The draft was not thrown away", "Check your connection and try again.");
        }}
        body={<p>Every colour change not yet published is lost. The public site does not change.</p>}
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
