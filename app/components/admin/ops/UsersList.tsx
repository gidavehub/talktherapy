"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../ui/Button";
import type { DataColumn } from "../../ui/DataTable";
import { Dropdown } from "../../ui/Dropdown";
import SearchField from "../../ui/SearchField";
import { PageBar } from "../../ui/AppShell";
import { useNow } from "@/lib/useNow";
import { adminListUsers } from "@/lib/adminOps-client";
import {
  APP_ROLES,
  ROLE_LABELS,
  USER_STATUSES,
  USER_STATUS_LABELS,
  type AdminUserRow,
  type UserStatusFilter,
} from "@/lib/adminOps";
import type { AppRole } from "@/lib/models";
import { RoleChip } from "./chips";
import { banjulDate, banjulDateTime, plural, relativeTime } from "./format";
import { BanjulNote, Chip, FilterRow, PagedTable, PersonMark } from "./parts";
import { usePagedList } from "./usePagedList";

/**
 * Everyone with a TALK account, newest first: who they are, their role,
 * whether they can sign in, and when they were last about.
 *
 * Names and emails only — never what anybody told TALK. Searching asks the
 * server (a name or email from its start, an exact email, or an account id);
 * the role and status filters narrow the same list.
 */

type RoleFilter = AppRole | "any";
type StatusFilter = UserStatusFilter | "any";

const ROLE_OPTIONS = [
  { value: "any" as const, label: "Any role" },
  ...APP_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
];

const STATUS_OPTIONS = [
  { value: "any" as const, label: "Anyone" },
  ...USER_STATUSES.map((status) => ({ value: status, label: USER_STATUS_LABELS[status] })),
];

/** How long typing has to pause before the search is sent. */
const SEARCH_SETTLE_MS = 350;

function StatusCell({ row }: { row: AdminUserRow }) {
  if (row.disabled) return <Chip tone="danger">{USER_STATUS_LABELS.disabled}</Chip>;
  if (row.role === "provider" && !row.verified) return <Chip tone="warning">Not approved yet</Chip>;
  if (row.role === "patient" && !row.onboarded) return <Chip tone="muted">Not talked to TALK yet</Chip>;
  return <span className="text-[13px] text-[var(--muted)]">{USER_STATUS_LABELS.active}</span>;
}

export default function UsersList() {
  const router = useRouter();
  const now = useNow(60_000);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("any");
  const [status, setStatus] = useState<StatusFilter>("any");

  // A search is a call to the server; "fat" on the way to "fatou" is not
  // worth one. The query only moves once the typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const list = usePagedList<AdminUserRow>(`${query}|${role}|${status}`, (cursor) =>
    adminListUsers({
      query: query || undefined,
      role: role === "any" ? undefined : role,
      status: status === "any" ? undefined : status,
      cursor,
    }),
  );

  const filtered = role !== "any" || status !== "any";

  const columns: DataColumn<AdminUserRow>[] = [
    {
      key: "person",
      header: "Person",
      render: (u) => (
        <span className="flex min-w-0 items-center justify-end gap-3 md:justify-start">
          <span className="hidden md:block">
            <PersonMark name={u.displayName ?? u.email} />
          </span>
          <span className="min-w-0 text-right md:text-left">
            <span className="block truncate font-medium">{u.displayName ?? "No name"}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">{u.email ?? "No email"}</span>
          </span>
        </span>
      ),
    },
    { key: "role", header: "Role", render: (u) => <RoleChip role={u.role} /> },
    { key: "status", header: "Status", render: (u) => <StatusCell row={u} /> },
    {
      key: "seen",
      header: "Last seen",
      render: (u) =>
        u.lastSeenAt ? (
          <span title={`${banjulDateTime(u.lastSeenAt)} Banjul time`}>{relativeTime(u.lastSeenAt, now)}</span>
        ) : (
          <span className="text-[var(--muted)]">Not yet</span>
        ),
    },
    {
      key: "activity",
      header: "Activity",
      hideBelow: "lg",
      render: (u) =>
        u.bookingCount || u.paymentCount ? (
          `${plural(u.bookingCount, "session")} · ${plural(u.paymentCount, "payment")}`
        ) : (
          <span className="text-[var(--muted)]">None yet</span>
        ),
    },
    { key: "joined", header: "Joined", align: "right", render: (u) => banjulDate(u.createdAt, now) },
  ];

  return (
    <div className="space-y-5">
      {/* Pinned in the top bar, so the search is under the thumb however far
          down the list somebody has scrolled. */}
      <PageBar>
        <span className="hidden shrink-0 font-display text-[20px] font-medium sm:block">Users</span>
        <SearchField value={search} onChange={setSearch} placeholder="Name, email or account id" label="Search people" />
      </PageBar>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterRow label="Filter people">
          <Dropdown<RoleFilter>
            variant="pill"
            label="Role"
            options={ROLE_OPTIONS}
            value={role === "any" ? null : role}
            onChange={setRole}
          />
          <Dropdown<StatusFilter>
            variant="pill"
            label="Status"
            options={STATUS_OPTIONS}
            value={status === "any" ? null : status}
            onChange={setStatus}
          />
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRole("any");
                setStatus("any");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </FilterRow>
        <BanjulNote />
      </div>

      {query ? (
        <p className="text-[12.5px] text-[var(--muted)]">
          Names and emails match from their start; an email or account id typed in full finds that one account. A search
          shows its best matches only.
        </p>
      ) : null}

      <PagedTable
        list={list}
        noun="account"
        columns={columns}
        rowKey={(u) => u.uid}
        onRowClick={(u) => router.push(`/admin/users/${u.uid}`)}
        caption={query ? `Matching “${query}”` : "Newest first"}
        end={query ? "These are the best matches. Type more of the name or email to narrow them." : undefined}
        stickyOffset={64}
        empty={{
          title: query ? "Nobody matches that" : filtered ? "Nobody here" : "No accounts yet",
          description: query
            ? "Try the start of their first name, their surname, or their whole email."
            : filtered
              ? "Nobody has that role and status. Clear the filters to see everyone."
              : "People appear here when they first sign in.",
        }}
      />
    </div>
  );
}
