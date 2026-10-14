"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type DataColumn } from "../../ui/DataTable";
import SearchField from "../../ui/SearchField";
import { Pill } from "../../ui/Feedback";
import StatCard from "../../ui/StatCard";
import StatusBadge from "./StatusBadge";
import { useNow } from "@/lib/useNow";
import { watchApplications } from "@/lib/providerApplication-client";
import { LOCALE_LABELS, STATUS_LABELS, type ApplicationStatus, type ProviderApplication } from "@/lib/providerApplication";
import { SERVICE_LABELS } from "@/lib/matching";

/**
 * Every provider application, by where it stands. "Waiting" first, oldest at
 * the top of it: somebody who applied a week ago has waited longest.
 */

type Filter = "waiting" | ApplicationStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "changes_requested", label: STATUS_LABELS.changes_requested },
  { id: "approved", label: STATUS_LABELS.approved },
  { id: "rejected", label: STATUS_LABELS.rejected },
  { id: "suspended", label: STATUS_LABELS.suspended },
  { id: "draft", label: "Drafts" },
];

const DAY = 86_400_000;

function matches(filter: Filter, app: ProviderApplication): boolean {
  return filter === "waiting" ? app.status === "submitted" || app.status === "in_review" : app.status === filter;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function shortDate(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";
}

export default function ApplicationsList() {
  const router = useRouter();
  const now = useNow(60_000);
  const [apps, setApps] = useState<ProviderApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [search, setSearch] = useState("");

  useEffect(
    () =>
      watchApplications(setApps, () =>
        setError("Applications could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [],
  );

  const counts = useMemo(() => {
    const out: Record<Filter, number> = {
      waiting: 0,
      draft: 0,
      submitted: 0,
      in_review: 0,
      changes_requested: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
    };
    for (const app of apps ?? []) {
      out[app.status] += 1;
      if (matches("waiting", app)) out.waiting += 1;
    }
    return out;
  }, [apps]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (apps ?? []).filter((app) => {
      if (!matches(filter, app)) return false;
      if (!term) return true;
      return [app.personal.displayName, app.personal.legalName, app.personal.town, ...app.professional.services.map((s) => SERVICE_LABELS[s])]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [apps, filter, search]);

  const waitingDays = (app: ProviderApplication) => (app.submittedAt ? Math.floor((now - app.submittedAt) / DAY) : null);
  const oldestWait = Math.max(0, ...(apps ?? []).filter((a) => matches("waiting", a)).map((a) => waitingDays(a) ?? 0));

  const columns: DataColumn<ProviderApplication>[] = [
    {
      key: "name",
      header: "Applicant",
      sortValue: (a) => a.personal.displayName.toLowerCase(),
      csvValue: (a) => a.personal.displayName,
      render: (a) => (
        <span className="flex items-center gap-3">
          <span className="arch flex h-10 w-9 shrink-0 items-end justify-center rounded-b-lg bg-[var(--peach)] pb-1.5 text-[12px] font-medium text-[var(--dark)]">
            {initials(a.personal.displayName || a.personal.legalName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{a.personal.displayName || "No name yet"}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">{a.personal.town || "—"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "services",
      header: "Offers",
      hideBelow: "lg",
      render: (a) => a.professional.services.map((s) => SERVICE_LABELS[s]).join(", ") || "—",
    },
    {
      key: "languages",
      header: "Languages",
      render: (a) => a.professional.languages.map((l) => LOCALE_LABELS[l]).join(", ") || "—",
    },
    {
      key: "submitted",
      header: "Sent",
      sortValue: (a) => a.submittedAt ?? 0,
      render: (a) => shortDate(a.submittedAt),
    },
    {
      key: "waiting",
      header: "Waiting",
      align: "right",
      sortValue: (a) => waitingDays(a) ?? -1,
      render: (a) => {
        const days = matches("waiting", a) ? waitingDays(a) : null;
        if (days == null) return <span className="text-[var(--muted)]">—</span>;
        return (
          <span className={days >= 3 ? "font-medium text-[var(--accent-deep)]" : ""}>
            {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
          </span>
        );
      },
    },
    {
      key: "docs",
      header: "Documents",
      align: "right",
      hideBelow: "lg",
      sortValue: (a) => a.documents.length,
      render: (a) => a.documents.length,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (a) => a.status,
      csvValue: (a) => STATUS_LABELS[a.status],
      render: (a) => <StatusBadge status={a.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Waiting for a decision" value={apps ? counts.waiting : "—"} />
        <StatCard label="Longest wait" value={apps ? (counts.waiting ? `${oldestWait} d` : "—") : "—"} />
        <StatCard label="Approved" value={apps ? counts.approved : "—"} />
        <StatCard label="Being filled in" value={apps ? counts.draft + counts.changes_requested : "—"} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show applications that are">
          {FILTERS.map((f) => (
            <Pill key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} className="shrink-0">
              {f.label}
              <span className={`tabular-nums ${filter === f.id ? "text-white/80" : "text-[var(--muted)]"}`}>{counts[f.id]}</span>
            </Pill>
          ))}
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="Search by name, town or service" className="lg:w-[320px]" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.uid}
        onRowClick={(a) => router.push(`/admin/providers/${a.uid}`)}
        loading={apps === null && !error}
        error={error}
        initialSort={filter === "waiting" ? { key: "waiting", dir: "desc" } : { key: "submitted", dir: "desc" }}
        empty={{
          title: filter === "waiting" ? "Nothing waiting" : "None here",
          description:
            filter === "waiting"
              ? "When a provider sends their application, it appears here."
              : "No applications are in this state.",
        }}
        pageSize={25}
        caption="Applications"
        csv={{ filename: "provider-applications.csv" }}
      />
    </div>
  );
}
