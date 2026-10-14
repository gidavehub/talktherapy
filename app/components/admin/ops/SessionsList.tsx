"use client";

import { useState } from "react";
import Button from "../../ui/Button";
import DateRangePicker, { type DateRangeValue } from "../../ui/DateRangePicker";
import { Dropdown } from "../../ui/Dropdown";
import Tabs from "../../ui/Tabs";
import { useNow } from "@/lib/useNow";
import { adminListBookings } from "@/lib/adminOps-client";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  BOOKING_VIEW_LABELS,
  type AdminBookingRow,
  type BookingView,
  type ListBookingsResult,
} from "@/lib/adminOps";
import type { BookingStatus } from "@/lib/models";
import { bookingColumns } from "./columns";
import { banjulRange, rangeKey } from "./format";
import { BanjulNote, Chip, FilterRow, PagedTable, useHeld } from "./parts";
import SessionDrawer from "./SessionDrawer";
import { usePagedList } from "./usePagedList";

/**
 * Every session booked through TALK, by where it stands: coming up, today,
 * over, cancelled, or disputed by the patient.
 *
 * Times and money only. The patient is named by first name, and nothing
 * either side wrote is sent to this page at all.
 */

type Tab = Exclude<BookingView, "all">;
const TABS: Tab[] = ["upcoming", "today", "past", "cancelled", "disputed"];

type StatusFilter = BookingStatus | "any";
const STATUS_OPTIONS = [
  { value: "any" as const, label: "Any status" },
  ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s] })),
];

const EMPTY: Record<Tab, { title: string; description: string }> = {
  upcoming: { title: "Nothing coming up", description: "Sessions booked for later appear here." },
  today: { title: "Nothing today", description: "No session starts today, Banjul time." },
  past: { title: "No past sessions", description: "Sessions appear here once they are over." },
  cancelled: { title: "Nothing cancelled", description: "Sessions cancelled by either side appear here." },
  disputed: { title: "No disputes", description: "When a patient says a session did not happen, it waits here for a decision." },
};

export default function SessionsList({ providerUid }: { providerUid?: string }) {
  const now = useNow(60_000);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [period, setPeriod] = useState<DateRangeValue>({ preset: "all" });
  const [open, setOpen] = useState<AdminBookingRow | null>(null);

  // Whole Banjul days, so the clock ticking does not change the range — and
  // so the list — until midnight.
  const range = banjulRange(period, now);

  const list = usePagedList<AdminBookingRow, ListBookingsResult>(
    `${tab}|${status}|${rangeKey(range)}|${providerUid ?? ""}`,
    (cursor) =>
      adminListBookings({
        view: tab,
        status: status === "any" ? undefined : status,
        range,
        providerUid,
        cursor,
      }),
  );

  // Counts come with the first page and ignore the status and range, so
  // they still say how many there are when a filter is on. The last ones
  // stay up while another tab loads, rather than blinking out.
  const counts = useHeld(list.first?.counts ?? null);
  const providerName = providerUid ? (list.items.find((b) => b.provider.uid === providerUid)?.provider.name ?? null) : null;
  const filtered = status !== "any" || period.preset !== "all";

  return (
    <div className="space-y-5">
      <Tabs<Tab>
        items={TABS.map((t) => ({ id: t, label: BOOKING_VIEW_LABELS[t], badge: counts?.[t] }))}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setOpen(null);
        }}
        className="-mx-1 px-1"
      />

      <div className="space-y-4 rounded-[24px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
        <FilterRow label="Filter sessions">
          <Dropdown<StatusFilter>
            variant="pill"
            label="Status"
            options={STATUS_OPTIONS}
            value={status === "any" ? null : status}
            onChange={setStatus}
          />
          {providerUid ? (
            <span className="inline-flex items-center gap-1">
              <Chip tone="info">Provider: {providerName ?? "one provider"}</Chip>
              <Button variant="ghost" size="sm" href="/admin/sessions" aria-label="Show every provider's sessions">
                Show everyone&apos;s
              </Button>
            </span>
          ) : null}
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus("any");
                setPeriod({ preset: "all" });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </FilterRow>
        <DateRangePicker
          label="Sessions starting in"
          value={period}
          onChange={setPeriod}
          presets={["all", "7d", "30d", "90d", "custom"]}
        />
        <BanjulNote />
      </div>

      <PagedTable
        list={list}
        noun="session"
        columns={bookingColumns(now)}
        rowKey={(b) => b.id}
        onRowClick={setOpen}
        caption={`${BOOKING_VIEW_LABELS[tab]}${tab === "past" || tab === "cancelled" || tab === "disputed" ? ", most recent first" : ", soonest first"}`}
        csv={{ filename: `sessions-${tab}.csv` }}
        empty={
          filtered
            ? { title: "None match", description: "No session here has that status in that time. Clear the filters to see them all." }
            : EMPTY[tab]
        }
      />

      <SessionDrawer
        booking={open}
        onClose={() => setOpen(null)}
        onReviewed={list.reload}
      />
    </div>
  );
}
