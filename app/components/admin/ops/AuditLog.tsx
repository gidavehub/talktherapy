"use client";

import { useState } from "react";
import Button from "../../ui/Button";
import type { DataColumn } from "../../ui/DataTable";
import DateRangePicker, { type DateRangeValue } from "../../ui/DateRangePicker";
import { Dropdown, type DropdownOption } from "../../ui/Dropdown";
import { EmptyState, Skeleton } from "../../ui/Feedback";
import SegmentedControl from "../../ui/SegmentedControl";
import { useAuth } from "../../AuthProvider";
import { useNow } from "@/lib/useNow";
import { adminListAudit } from "@/lib/adminOps-client";
import { AUDIT_ACTION_LABELS, SCRIPT_ACTOR, SYSTEM_ACTOR, type AdminAuditRow } from "@/lib/adminOps";
import AuditTimeline, { AuditActor, AuditDetails, AuditTargetLink, auditTarget } from "./AuditTimeline";
import { banjulDateTime, banjulRange, rangeKey } from "./format";
import { BanjulNote, Chip, FilterRow, LoadError, LoadMore, PagedTable } from "./parts";
import { usePagedList } from "./usePagedList";
import { useStaff } from "./useStaff";

/**
 * Every change made by staff, by the scripts that act for them, and by TALK
 * itself clearing up after a deleted account — who, what, to what, when —
 * newest first. Read as a timeline a day at a time, or
 * as a table to scan and download.
 *
 * Entries carry what changed, never what anybody wrote: a support note is
 * logged as "a note was added", not by its words.
 */

type Layout = "timeline" | "table";

/** Each kind of change, by the start its actions share. */
const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "user", label: "People and roles" },
  { value: "provider_application", label: "Provider applications" },
  { value: "support", label: "Support requests" },
  { value: "site_content", label: "Site pages" },
  { value: "site_media", label: "Media library" },
];

const ANY = "any";

const ACTION_OPTIONS: DropdownOption<string>[] = [
  { value: ANY, label: "Any change" },
  ...ACTION_GROUPS.map((g) => ({ value: g.value, label: g.label, description: "Every change of this kind" })),
  ...Object.entries(AUDIT_ACTION_LABELS).map(([action, label]) => ({
    value: action,
    label,
    description: ACTION_GROUPS.find((g) => action.startsWith(`${g.value}.`))?.label,
  })),
];

export default function AuditLog({ initialTarget, initialActor }: { initialTarget?: string; initialActor?: string }) {
  const { user } = useAuth();
  const me = user?.uid ?? "";
  const now = useNow(60_000);
  const staff = useStaff();
  const [layout, setLayout] = useState<Layout>("timeline");
  const [actor, setActor] = useState<string>(initialActor ?? ANY);
  const [action, setAction] = useState<string>(ANY);
  const [target, setTarget] = useState<string | null>(initialTarget ?? null);
  // A link about one account or one person wants their whole history, not
  // only the last month of it.
  const [defaultPeriod] = useState<DateRangeValue>(() =>
    initialTarget || initialActor ? { preset: "all" } : { preset: "30d" },
  );
  const [period, setPeriod] = useState<DateRangeValue>(defaultPeriod);
  // Whole Banjul days: the range only moves at midnight, not every tick.
  const range = banjulRange(period, now);

  const list = usePagedList<AdminAuditRow>(`${actor}|${action}|${target ?? ""}|${rangeKey(range)}`, (cursor) =>
    adminListAudit({
      actor: actor === ANY ? undefined : actor,
      action: action === ANY ? undefined : action,
      target: target ?? undefined,
      range,
      cursor,
    }),
  );

  const actorOptions: DropdownOption<string>[] = [
    { value: ANY, label: "Anyone" },
    { value: SCRIPT_ACTOR, label: "A script", description: "Changes made from the command line" },
    { value: SYSTEM_ACTOR, label: "TALK, automatically", description: "Clearing up after a deleted account" },
    ...(staff ?? []).map((p) => ({
      value: p.uid,
      label: p.name ?? "A member of staff",
      description: p.uid === me ? "You" : undefined,
    })),
  ];
  // Somebody named in a link who is no longer staff still shows by name.
  if (actor !== ANY && !actorOptions.some((o) => o.value === actor)) {
    actorOptions.push({ value: actor, label: "The person in the link" });
  }

  const filtered = actor !== ANY || action !== ANY || target !== null || period.preset !== defaultPeriod.preset;

  const columns: DataColumn<AdminAuditRow>[] = [
    {
      key: "when",
      header: "When",
      csvValue: (r) => banjulDateTime(r.createdAt),
      render: (r) => banjulDateTime(r.createdAt, now),
    },
    {
      key: "who",
      header: "Who",
      // auditRow names the script and TALK itself; everyone else by their name now.
      csvValue: (r) => r.actorName ?? r.actorId,
      render: (r) => <AuditActor row={r} me={me} />,
    },
    { key: "what", header: "What", csvValue: (r) => r.actionLabel, render: (r) => <span className="font-medium">{r.actionLabel}</span> },
    {
      key: "about",
      header: "About",
      csvValue: (r) => r.targetPath,
      render: (r) => (r.targetPath ? <AuditTargetLink path={r.targetPath} /> : <span className="text-[var(--muted)]">—</span>),
    },
    {
      key: "details",
      header: "Details",
      hideBelow: "lg",
      width: "30%",
      csvValue: (r) =>
        Object.entries(r.metadata)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .join("; "),
      render: (r) => <AuditDetails metadata={r.metadata} />,
    },
  ];

  let body: React.ReactNode;
  if (layout === "table") {
    body = (
      <PagedTable
        list={list}
        noun="entry"
        columns={columns}
        rowKey={(r) => r.id}
        caption="Newest first"
        csv={{ filename: "audit-log.csv" }}
        empty={{ title: "Nothing recorded", description: "No change matches these filters in this time." }}
      />
    );
  } else if (list.error) {
    body = <LoadError message={list.error} onRetry={list.reload} />;
  } else if (list.loading) {
    body = (
      <div role="status" aria-label="Loading the audit log" className="space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 pl-8">
            <Skeleton className="h-3.5 w-2/3" rounded="rounded-full" />
            <Skeleton className="h-3 w-1/3" rounded="rounded-full" />
          </div>
        ))}
      </div>
    );
  } else if (list.items.length === 0) {
    body = list.nextCursor ? (
      <EmptyState
        title="None found yet"
        description="Only the most recent part of the log has been looked through so far. Look further back to keep searching."
        action={
          <Button variant="secondary" loading={list.loadingMore} onClick={list.loadMore}>
            Look further back
          </Button>
        }
      />
    ) : (
      <EmptyState title="Nothing recorded" description="No change matches these filters in this time." />
    );
  } else {
    body = (
      <>
        <AuditTimeline rows={list.items} now={now} me={me} />
        <LoadMore list={list} noun="entry" />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
        <FilterRow label="Filter the audit log">
          <Dropdown<string>
            variant="pill"
            label="Who"
            options={actorOptions}
            value={actor === ANY ? null : actor}
            onChange={setActor}
            searchable={actorOptions.length > 8}
          />
          <Dropdown<string>
            variant="pill"
            label="What"
            options={ACTION_OPTIONS}
            value={action === ANY ? null : action}
            onChange={setAction}
            searchable
            searchPlaceholder="Search changes"
          />
          {target ? (
            <span className="inline-flex items-center gap-1">
              <Chip tone="info">About: {auditTarget(target).label}</Chip>
              <Button variant="ghost" size="sm" onClick={() => setTarget(null)} aria-label="Show changes about anything">
                Remove
              </Button>
            </span>
          ) : null}
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActor(ANY);
                setAction(ANY);
                setTarget(null);
                setPeriod(defaultPeriod);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </FilterRow>
        <DateRangePicker label="Changes made in" value={period} onChange={setPeriod} />
        <BanjulNote />
      </div>

      <SegmentedControl<Layout>
        ariaLabel="Show the log as"
        value={layout}
        onChange={setLayout}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "table", label: "Table" },
        ]}
      />

      {/* The timeline sits on a card; the table, an error and an empty
          state bring their own surfaces. */}
      {layout === "table" || list.error || (!list.loading && list.items.length === 0) ? (
        body
      ) : (
        <div className="rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
          {body}
        </div>
      )}
    </div>
  );
}
