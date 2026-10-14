"use client";

import { useState } from "react";
import Button from "../../ui/Button";
import Drawer from "../../ui/Drawer";
import DescriptionList from "../../ui/DescriptionList";
import { Dropdown, type DropdownOption } from "../../ui/Dropdown";
import { Alert } from "../../ui/Feedback";
import { Textarea } from "../../ui/Input";
import SegmentedControl from "../../ui/SegmentedControl";
import { useToast } from "../../ui/Toast";
import { adminUpdateSupport } from "@/lib/adminOps-client";
import {
  SUPPORT_NOTE_MAX,
  SUPPORT_SETTABLE_STATUSES,
  SUPPORT_STATUS_LABELS,
  type AdminSupportRow,
  type PersonRef,
  type SupportStatus,
  type UpdateSupportInput,
} from "@/lib/adminOps";
import { SUPPORT_TOPIC_LABELS } from "@/lib/models";
import { SupportChip } from "./chips";
import { banjulDateTime, relativeTime } from "./format";
import { Chip, PersonLink, useHeld } from "./parts";

/**
 * One message from the contact form: what they wrote, how to reach them, and
 * the staff side of it — where it stands, who has it, and notes between
 * staff. Notes are never shown to the person who wrote in.
 *
 * Each change is saved as it is made, through adminUpdateSupport, which
 * records it in the audit log (that a note was added, never what it says).
 */

const NOBODY = "nobody";

/** Something@somewhere, with nothing a mail link would read as more than an address. */
const PLAIN_EMAIL = /^[^\s@?&#%/:]+@[^\s@?&#%/:]+\.[^\s@?&#%/:]+$/;

export default function SupportDrawer({
  request,
  staff,
  me,
  now,
  onClose,
  onUpdated,
}: {
  request: AdminSupportRow | null;
  /** Everyone who can be given a request; null while it loads. */
  staff: PersonRef[] | null;
  me: string;
  now: number;
  onClose: () => void;
  onUpdated: (row: AdminSupportRow) => void;
}) {
  const r = useHeld(request);
  return (
    <Drawer
      open={request !== null}
      onClose={onClose}
      eyebrow={r ? SUPPORT_TOPIC_LABELS[r.topic] : "Support"}
      title={r ? (r.name ?? "No name given") : ""}
      width="560px"
    >
      {/* Keyed by the request, so a half-written note never follows the
          drawer on to the next message. */}
      {r ? <SupportDetail key={r.id} request={r} staff={staff} me={me} now={now} onUpdated={onUpdated} /> : null}
    </Drawer>
  );
}

function SupportDetail({
  request: r,
  staff,
  me,
  now,
  onUpdated,
}: {
  request: AdminSupportRow;
  staff: PersonRef[] | null;
  me: string;
  now: number;
  onUpdated: (row: AdminSupportRow) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"status" | "assignee" | "note" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function save(change: Omit<UpdateSupportInput, "id">, what: "status" | "assignee" | "note", done: string) {
    setBusy(what);
    setError(null);
    const result = await adminUpdateSupport({ id: r.id, ...change });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    onUpdated(result.data.request);
    toast.success(done);
    return true;
  }

  async function addNote() {
    const body = note.trim();
    if (!body) return;
    if (await save({ note: body }, "note", "Note added.")) setNote("");
  }

  // Whoever has it now stays choosable even if they have since left the staff.
  const people = [...(staff ?? [])];
  if (r.assignee && !people.some((p) => p.uid === r.assignee?.uid)) people.push(r.assignee);
  const assigneeOptions: DropdownOption<string>[] = [
    { value: NOBODY, label: "Nobody" },
    ...people.map((p) => ({
      value: p.uid,
      label: p.name ?? "A member of staff",
      description: p.uid === me ? "You" : undefined,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SupportChip status={r.status} />
        {r.topic === "safety" ? <Chip tone="danger">A concern about safety</Chip> : null}
        <span className="text-[12.5px] text-[var(--muted)]">
          Sent {relativeTime(r.createdAt, now)} · {banjulDateTime(r.createdAt, now)} Banjul time
        </span>
      </div>

      {r.topic === "safety" ? (
        <Alert tone="warning" title="Read this one first">
          Somebody is reporting a concern. If anyone is in danger now, the emergency numbers are free to call: 117 police,
          116 ambulance, 118 fire.
        </Alert>
      ) : null}

      <div className="rounded-[22px] bg-[var(--background)] px-5 py-4">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-[var(--sage)]">Their message</p>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]">
          {r.message || <span className="text-[var(--muted)]">No message.</span>}
        </p>
      </div>

      <DescriptionList
        columns={2}
        items={[
          {
            label: "Email",
            // Typed into a public form: only a plain address becomes a link,
            // so nothing can ride along in it (a "?cc=" or "&body=").
            value: r.email && PLAIN_EMAIL.test(r.email) ? (
              <a
                href={`mailto:${r.email}`}
                className="rounded-sm text-[var(--accent-deep)] underline-offset-4 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"
              >
                {r.email}
              </a>
            ) : (
              (r.email ?? "")
            ),
          },
          {
            label: "Account",
            value: r.userId ? <PersonLink uid={r.userId} name="Open their account" /> : "Sent without signing in",
          },
          { label: "Topic", value: SUPPORT_TOPIC_LABELS[r.topic] },
          {
            label: "Resolved",
            value: r.resolvedAt ? (
              <span>
                {banjulDateTime(r.resolvedAt, now)}
                {r.resolvedBy ? (
                  <>
                    {" · by "}
                    <PersonLink uid={r.resolvedBy} name={r.resolvedBy === me ? "you" : "a member of staff"} />
                  </>
                ) : null}
              </span>
            ) : (
              ""
            ),
          },
        ]}
      />

      {error ? (
        <Alert tone="warning" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-5 rounded-[22px] border border-[var(--border)] p-5">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]">
            Where it stands
          </p>
          <SegmentedControl<SupportStatus>
            ariaLabel="Where this request stands"
            fullWidth
            value={r.status}
            onChange={(next) => {
              if (next !== "new" && next !== r.status && busy === null) {
                void save({ status: next }, "status", `Marked as ${SUPPORT_STATUS_LABELS[next].toLowerCase()}.`);
              }
            }}
            options={SUPPORT_SETTABLE_STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s], disabled: busy !== null }))}
          />
          {r.status === "new" ? (
            <p className="mt-2 text-[12px] text-[var(--muted)]">New — nobody has picked it up yet.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Dropdown<string>
            label="Who has it"
            className="min-w-0 flex-1"
            options={assigneeOptions}
            value={r.assignee?.uid ?? NOBODY}
            disabled={busy !== null}
            searchable={assigneeOptions.length > 8}
            hint={staff === null ? "Loading the staff list…" : undefined}
            onChange={(next) => {
              if (next === (r.assignee?.uid ?? NOBODY)) return;
              void save(
                { assignee: next === NOBODY ? null : next },
                "assignee",
                next === NOBODY ? "Nobody has it now." : next === me ? "It is yours." : "Given to them.",
              );
            }}
          />
          {r.assignee?.uid !== me ? (
            <Button
              variant="secondary"
              loading={busy === "assignee"}
              disabled={busy !== null}
              onClick={() => void save({ assignee: me }, "assignee", "It is yours.")}
            >
              Take it
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="font-display text-[18px] font-medium">Staff notes</h3>
        <p className="mt-1 text-[12.5px] text-[var(--muted)]">Only staff see these. The person who wrote in never does.</p>
        {r.notes.length ? (
          <ul className="mt-4 space-y-3">
            {r.notes.map((n) => (
              <li key={n.id || `${n.at}-${n.by}`} className="rounded-2xl bg-[var(--background)] px-4 py-3">
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">{n.body}</p>
                <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">
                  {n.by === me ? "You" : (n.byName ?? "A member of staff")} · {banjulDateTime(n.at, now)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <Textarea
          className="mt-4"
          label="Add a note"
          hideLabel
          rows={3}
          maxLength={SUPPORT_NOTE_MAX}
          placeholder="What you did, or what happens next"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            loading={busy === "note"}
            disabled={!note.trim() || (busy !== null && busy !== "note")}
            onClick={() => void addNote()}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
