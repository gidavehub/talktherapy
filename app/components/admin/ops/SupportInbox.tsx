"use client";

import { useState } from "react";
import Button from "../../ui/Button";
import type { DataColumn } from "../../ui/DataTable";
import { Dropdown } from "../../ui/Dropdown";
import { Alert, Pill } from "../../ui/Feedback";
import { useAuth } from "../../AuthProvider";
import { useNow } from "@/lib/useNow";
import { adminListSupport } from "@/lib/adminOps-client";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPICS,
  type AdminSupportRow,
  type ListSupportResult,
  type SupportFilter,
  type SupportStatus,
} from "@/lib/adminOps";
import { SUPPORT_TOPIC_LABELS, type SupportTopic } from "@/lib/models";
import { SupportChip } from "./chips";
import { banjulDateTime, plural, relativeTime } from "./format";
import { BanjulNote, Chip, FilterRow, PagedTable, useHeld } from "./parts";
import SupportDrawer from "./SupportDrawer";
import { usePagedList } from "./usePagedList";
import { useStaff } from "./useStaff";

/**
 * The contact form's inbox. Everything not yet resolved comes first, and the
 * ones nobody has picked up are marked so they cannot be missed; a concern
 * about safety is marked louder still.
 *
 * Opening one shows the message, the way to reply, and the staff side: where
 * it stands, who has it, and notes between staff.
 */

type StatusTab = SupportFilter | "all";
const STATUS_TABS: StatusTab[] = ["unresolved", ...SUPPORT_STATUSES, "all"];
const TAB_LABELS: Record<StatusTab, string> = {
  unresolved: "Not resolved",
  ...SUPPORT_STATUS_LABELS,
  all: "All",
};

type TopicFilter = SupportTopic | "any";
const TOPIC_OPTIONS = [
  { value: "any" as const, label: "Any topic" },
  ...SUPPORT_TOPICS.map((t) => ({ value: t, label: SUPPORT_TOPIC_LABELS[t] })),
];

function countFor(tab: StatusTab, counts: Record<SupportStatus, number>): number {
  if (tab === "all") return SUPPORT_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  if (tab === "unresolved") return counts.new + counts.open + counts.in_progress;
  return counts[tab];
}

export default function SupportInbox({ requestId }: { requestId?: string }) {
  const { user } = useAuth();
  const me = user?.uid ?? "";
  const now = useNow(60_000);
  const staff = useStaff();
  const [tab, setTab] = useState<StatusTab>("unresolved");
  const [topic, setTopic] = useState<TopicFilter>("any");
  const [openId, setOpenId] = useState<string | null>(requestId ?? null);

  const list = usePagedList<AdminSupportRow, ListSupportResult>(`${tab}|${topic}`, (cursor) =>
    adminListSupport({
      status: tab === "all" ? undefined : tab,
      topic: topic === "any" ? undefined : topic,
      cursor,
    }),
  );

  // The last counts stay up while another filter loads, rather than blinking out.
  const counts = useHeld(list.first?.counts ?? null);
  const open = openId ? (list.items.find((r) => r.id === openId) ?? null) : null;
  // A link from the audit log names a request that may be further down the
  // inbox, or no longer under this filter.
  const missing = openId !== null && open === null && !list.loading && !list.error;

  /** A saved change, put into the list and the counts without asking again. */
  function updated(row: AdminSupportRow) {
    list.mutate(({ items, first }) => {
      const before = items.find((r) => r.id === row.id);
      const nextCounts =
        first && before && before.status !== row.status
          ? { ...first.counts, [before.status]: first.counts[before.status] - 1, [row.status]: first.counts[row.status] + 1 }
          : first?.counts;
      return {
        items: items.map((r) => (r.id === row.id ? row : r)),
        first: first && nextCounts ? { ...first, counts: nextCounts } : first,
      };
    });
  }

  const columns: DataColumn<AdminSupportRow>[] = [
    {
      key: "from",
      header: "From",
      render: (r) => (
        <span className="flex min-w-0 items-start justify-end gap-2.5 md:justify-start">
          {r.status === "new" ? (
            <span aria-hidden className="mt-1.5 hidden h-2 w-2 shrink-0 rounded-full bg-[var(--accent)] md:block" />
          ) : null}
          <span className="min-w-0 text-right md:text-left">
            <span className={`block truncate ${r.status === "new" ? "font-semibold" : "font-medium"}`}>{r.name ?? "No name given"}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">{r.email ?? "No email"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "topic",
      header: "Topic",
      render: (r) =>
        r.topic === "safety" ? <Chip tone="danger">{SUPPORT_TOPIC_LABELS.safety}</Chip> : SUPPORT_TOPIC_LABELS[r.topic],
    },
    {
      key: "message",
      header: "Message",
      hideBelow: "lg",
      width: "32%",
      render: (r) => <span className="line-clamp-2 text-[13px] text-[var(--muted)]">{r.message}</span>,
    },
    { key: "status", header: "Status", render: (r) => <SupportChip status={r.status} /> },
    {
      key: "assignee",
      header: "With",
      hideBelow: "lg",
      render: (r) =>
        r.assignee ? (
          r.assignee.uid === me ? "You" : (r.assignee.name ?? "A member of staff")
        ) : (
          <span className="text-[var(--muted)]">Nobody</span>
        ),
    },
    {
      key: "sent",
      header: "Sent",
      align: "right",
      render: (r) => (
        <span title={`${banjulDateTime(r.createdAt)} Banjul time`} className={r.status === "new" ? "font-medium" : ""}>
          {relativeTime(r.createdAt, now)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show requests that are">
        {STATUS_TABS.map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)} className="shrink-0">
            {TAB_LABELS[t]}
            {counts ? (
              <span className={`tabular-nums ${tab === t ? "text-white/80" : "text-[var(--muted)]"}`}>{countFor(t, counts)}</span>
            ) : null}
          </Pill>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterRow label="Filter requests">
          <Dropdown<TopicFilter>
            variant="pill"
            label="Topic"
            options={TOPIC_OPTIONS}
            value={topic === "any" ? null : topic}
            onChange={setTopic}
          />
          {topic !== "any" ? (
            <Button variant="ghost" size="sm" onClick={() => setTopic("any")}>
              Clear filter
            </Button>
          ) : null}
        </FilterRow>
        <BanjulNote />
      </div>

      {counts && counts.new > 0 && tab !== "new" ? (
        <Alert tone="info" title={`${plural(counts.new, "request")} nobody has picked up yet`}>
          Open one and take it, so the others know it is being dealt with.
        </Alert>
      ) : null}

      {missing ? (
        <Alert
          tone="info"
          title="That request is not in this list"
          action={
            <Button variant="secondary" size="sm" onClick={() => setTab("all")}>
              Show every request
            </Button>
          }
        >
          It may be further down — load more to find it — or under another status.
        </Alert>
      ) : null}

      <PagedTable
        list={list}
        noun="request"
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        caption="Newest first"
        empty={
          tab === "unresolved" && topic === "any"
            ? { title: "All caught up", description: "Every message to support has been resolved." }
            : { title: "None here", description: "No request matches this status and topic." }
        }
      />

      <SupportDrawer
        request={open}
        staff={staff}
        me={me}
        now={now}
        onClose={() => setOpenId(null)}
        onUpdated={updated}
      />
    </div>
  );
}
