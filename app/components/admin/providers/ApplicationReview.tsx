"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../../ui/PageHeader";
import Button from "../../ui/Button";
import ConfirmDialog from "../../ui/ConfirmDialog";
import DescriptionList from "../../ui/DescriptionList";
import SegmentedControl from "../../ui/SegmentedControl";
import Timeline, { type TimelineItem, type TimelineTone } from "../../ui/Timeline";
import { Checkbox, Textarea } from "../../ui/Input";
import { Alert, Skeleton } from "../../ui/Feedback";
import { formatBytes } from "../../ui/FileDropzone";
import { IconFile } from "../../ui/icons";
import { useToast } from "../../ui/Toast";
import { PageBar } from "../../ui/AppShell";
import { useAuth } from "../../AuthProvider";
import StatusBadge from "./StatusBadge";
import { usePrivateFile } from "../../apply/usePrivateFile";
import { useNow } from "@/lib/useNow";
import {
  REVIEW_CHECKS,
  addReviewNote,
  decideApplication,
  ensureStaffFileAccess,
  openPrivateFile,
  saveStaffReview,
  watchApplication,
  watchReviewNotes,
  watchStaffReview,
  type DocVerdict,
  type ReviewDecision,
  type ReviewNote,
  type StaffReview,
} from "@/lib/providerApplication-client";
import {
  AGE_GROUP_LABELS,
  AGREEMENTS,
  APPLICANT_GENDER_LABELS,
  APPLICATION_FORMAT_LABELS,
  DAYS,
  DOC_TYPE_LABELS,
  LOCALE_LABELS,
  STATUS_LABELS,
  STEPS,
  ageOn,
  isOwnCredentialPath,
  formatPhone,
  gambianPhone,
  incompleteSteps,
  qualificationLine,
  takeHomeMinor,
  weeklySessions,
  type ApplicationDocument,
  type HistoryEvent,
  type ProviderApplication,
} from "@/lib/providerApplication";
import { AREA_LABELS, SERVICE_LABELS, SPECIALIZATION_LABELS, townLabel } from "@/lib/matching";
import { PAYOUT_NETWORK_LABELS } from "@/lib/payouts";
import { formatDalasi } from "@/lib/money";

/**
 * One application, everything a reviewer needs to decide it: what the
 * applicant said, the documents to check it against, a checklist, notes
 * between staff, and every decision so far.
 *
 * The decisions go through reviewProviderApplication, which records who made
 * them. The checklist and notes are staff's own working space
 * (providerReviews/{uid}), never shown to the applicant.
 */

const DECISIONS: Record<
  ReviewDecision,
  { label: string; title: string; body: string; confirm: string; danger?: boolean; needsMessage?: string }
> = {
  start_review: {
    label: "Start review",
    title: "Start reviewing this application?",
    body: "The applicant is told their application is being checked, and it is marked as yours.",
    confirm: "Start review",
  },
  request_changes: {
    label: "Ask for changes",
    title: "Ask for changes",
    body: "The application goes back to the applicant to fix. Say exactly what needs changing — they read this word for word.",
    confirm: "Send it back",
    needsMessage: "What should they change?",
  },
  approve: {
    label: "Approve",
    title: "Approve and publish?",
    body: "Their profile goes into the public directory straight away, their photo becomes public, and the next two weeks of their hours open for booking. People in distress will read 'verified' as 'somebody checked'.",
    confirm: "Approve",
  },
  reject: {
    label: "Reject",
    title: "Reject this application?",
    body: "The applicant is told it was not approved, with your reason. They cannot send it again.",
    confirm: "Reject",
    danger: true,
    needsMessage: "The reason, for the applicant",
  },
  suspend: {
    label: "Suspend",
    title: "Suspend this provider?",
    body: "Their profile leaves the directory at once and they lose access to their provider tools. Sessions already booked are not cancelled — deal with those separately.",
    confirm: "Suspend",
    danger: true,
    needsMessage: "The reason, for the provider",
  },
  reinstate: {
    label: "Reinstate",
    title: "Reinstate this provider?",
    body: "Their profile returns to the directory and they can work again.",
    confirm: "Reinstate",
  },
};

const ACTIONS_FOR: Record<ProviderApplication["status"], ReviewDecision[]> = {
  draft: [],
  submitted: ["start_review", "request_changes", "approve", "reject"],
  in_review: ["request_changes", "approve", "reject"],
  changes_requested: ["reject"],
  approved: ["suspend"],
  rejected: [],
  suspended: ["reinstate"],
};

const EVENT_TITLES: Record<HistoryEvent["type"], { title: string; tone: TimelineTone }> = {
  created: { title: "Started the application", tone: "neutral" },
  submitted: { title: "Sent the application", tone: "accent" },
  resubmitted: { title: "Sent changes back", tone: "accent" },
  review_started: { title: "Review started", tone: "neutral" },
  changes_requested: { title: "Changes asked for", tone: "warning" },
  approved: { title: "Approved", tone: "positive" },
  rejected: { title: "Rejected", tone: "danger" },
  suspended: { title: "Suspended", tone: "danger" },
  reinstated: { title: "Reinstated", tone: "positive" },
};

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-[24px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Whether this staff member's sign-in can open applicants' files yet. */
type FileAccess = "checking" | "ready" | "denied";

const NO_FILE_ACCESS =
  "Your sign-in cannot open applicants' files yet. Sign out and in again; if it still fails, check your account is staff.";

/**
 * Until it is sent, an application can name any path at all for its photo
 * and documents — the checks run on sending. Staff open only what really is
 * in this applicant's own folder, so a draft cannot show a reviewer somebody
 * else's passport under its own name.
 */
const NOT_THEIRS = "This is not a file in the applicant's own folder, so it is not shown.";

function PrivateImage({ uid, path, alt, access }: { uid: string; path: string; alt: string; access: FileAccess }) {
  const theirs = isOwnCredentialPath(path, uid);
  const file = usePrivateFile(path, access === "ready" && theirs);
  const src = file.status === "ready" ? file.src : null;
  const failed = !theirs || access === "denied" || file.status === "failed";
  return (
    <span className="arch relative block aspect-[4/5] w-full max-w-[220px] overflow-hidden rounded-b-3xl bg-[var(--peach)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private blob, which next/image cannot fetch
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : failed ? (
        <span className="absolute inset-0 grid place-items-center px-4 text-center text-[12.5px] text-[var(--dark)]">
          {!theirs ? NOT_THEIRS : access === "denied" ? NO_FILE_ACCESS : "Could not load the photo. Reload to try again."}
        </span>
      ) : (
        <Skeleton className="absolute inset-0" rounded="rounded-none" />
      )}
    </span>
  );
}

function when(ms: number | null): string {
  return ms
    ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : "—";
}

export default function ApplicationReview({ uid }: { uid: string }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const now = useNow(60_000);
  const [app, setApp] = useState<ProviderApplication | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [review, setReview] = useState<StaffReview>({ checks: {}, documents: {} });
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [message, setMessage] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [fileAccess, setFileAccess] = useState<FileAccess>("checking");

  useEffect(
    () => watchApplication(uid, setApp, () => setLoadError("This application could not be loaded. Reload to try again.")),
    [uid],
  );
  useEffect(() => watchStaffReview(uid, setReview, () => setWorkspaceError(true)), [uid]);
  useEffect(() => watchReviewNotes(uid, setNotes, () => setWorkspaceError(true)), [uid]);
  // Documents are read straight from Storage, which knows staff by a claim on
  // their sign-in. Made sure of once, before any file is asked for.
  useEffect(() => {
    let live = true;
    void ensureStaffFileAccess().then((ok) => {
      if (live) setFileAccess(ok ? "ready" : "denied");
    });
    return () => {
      live = false;
    };
  }, []);

  if (loadError) {
    return (
      <Alert tone="warning" title="Something went wrong">
        {loadError}
      </Alert>
    );
  }
  if (app === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (app === null) {
    return (
      <Alert tone="info" title="No application">
        This account has not started an application.
      </Alert>
    );
  }

  const me = user?.uid ?? "";
  const myName = profile?.displayName ?? user?.displayName ?? "Staff";
  const incomplete = incompleteSteps(app, now);
  const checksDone = REVIEW_CHECKS.filter((c) => review.checks[c.id]).length;
  const phone = gambianPhone(app.personal.phone);
  const age = ageOn(app.personal.dateOfBirth, now);
  const waiting = app.submittedAt && (app.status === "submitted" || app.status === "in_review")
    ? Math.floor((now - app.submittedAt) / 86_400_000)
    : null;
  const name = app.personal.displayName || app.personal.legalName || "Applicant";

  async function decide() {
    if (!decision) return;
    const spec = DECISIONS[decision];
    if (spec.needsMessage && message.trim().length < 10) {
      setDecisionError("Write at least a sentence — the applicant reads this.");
      return;
    }
    setDecisionError(null);
    const result = await decideApplication(uid, decision, message.trim());
    if (!result.ok) {
      setDecisionError(result.error);
      return;
    }
    toast.success(
      decision === "approve"
        ? `Approved. ${result.slots} bookable time${result.slots === 1 ? "" : "s"} opened.`
        : `${spec.label} — done.`,
    );
    setDecision(null);
    setMessage("");
  }

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await addReviewNote(uid, me, myName, note);
      setNote("");
    } catch {
      toast.error("The note was not saved. Try again.");
    } finally {
      setSavingNote(false);
    }
  }

  async function open(doc: Pick<ApplicationDocument, "id" | "path">) {
    if (!isOwnCredentialPath(doc.path, uid)) {
      toast.error(NOT_THEIRS);
      return;
    }
    if (fileAccess !== "ready") {
      toast.error(fileAccess === "checking" ? "Still checking your access — try again in a moment." : NO_FILE_ACCESS);
      return;
    }
    setOpening(doc.id);
    try {
      await openPrivateFile(doc.path);
    } catch {
      toast.error("That file could not be opened. Check your connection and try again.");
    } finally {
      setOpening(null);
    }
  }

  // Only the one entry that changed: the write merges, so two members of
  // staff ticking different boxes at once do not undo each other's.
  const setCheck = (id: string, on: boolean) =>
    void saveStaffReview(uid, { checks: { [id]: on } }, me).catch(() => toast.error("Not saved."));
  const setVerdict = (docId: string, verdict: DocVerdict) =>
    void saveStaffReview(uid, { documents: { [docId]: verdict } }, me).catch(() => toast.error("Not saved."));

  const actions = ACTIONS_FOR[app.status];
  const actionButtons = actions.map((a) => (
    <Button
      key={a}
      size="sm"
      variant={a === "approve" || a === "reinstate" ? "sage" : DECISIONS[a].danger ? "danger" : a === "start_review" ? "primary" : "secondary"}
      onClick={() => {
        setDecision(a);
        setMessage("");
        setDecisionError(null);
      }}
    >
      {DECISIONS[a].label}
    </Button>
  ));

  const timeline: TimelineItem[] = [
    ...app.history.map((h, i) => ({
      id: `h-${i}`,
      at: h.at,
      title: EVENT_TITLES[h.type].title,
      tone: EVENT_TITLES[h.type].tone,
      actor: h.by ? (h.by === me ? "You" : "Staff") : name,
      body: h.message ? <span className="whitespace-pre-line">{h.message}</span> : undefined,
    })),
    ...(app.createdAt ? [{ id: "created", at: app.createdAt, title: "Started the application", tone: "neutral" as const, actor: name }] : []),
  ].sort((a, b) => b.at - a.at);

  const ranges = app.availability.ranges;

  return (
    <div>
      <PageBar>
        <Link
          href="/admin/providers"
          aria-label="Back to all applications"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--sand)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-medium">{name}</span>
        <StatusBadge status={app.status} className="hidden sm:inline-flex" />
      </PageBar>

      <PageHeader
        breadcrumbs={[{ label: "Providers", href: "/admin/providers" }, { label: name }]}
        eyebrow="Application"
        lines={[name]}
        lede={
          <span className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status={app.status} />
            <span>
              {app.submittedAt ? `Sent ${when(app.submittedAt)}` : "Not sent yet"}
              {waiting != null ? ` · waiting ${waiting === 0 ? "since today" : `${waiting} day${waiting === 1 ? "" : "s"}`}` : ""}
            </span>
          </span>
        }
        actions={actionButtons.length ? actionButtons : undefined}
      />

      {incomplete.length > 0 && app.status !== "draft" ? (
        <Alert tone="warning" title="Incomplete by today's checks" className="mb-6">
          Some parts no longer pass the checks: {incomplete.map((id) => STEPS.find((s) => s.id === id)?.label ?? id).join(", ")}. Ask
          for changes rather than approving.
        </Alert>
      ) : null}
      {workspaceError ? (
        <Alert tone="warning" title="The checklist and notes did not load" className="mb-6">
          The application itself is fine. Reload to see the staff checklist and notes.
        </Alert>
      ) : null}
      {fileAccess === "denied" ? (
        <Alert tone="warning" title="Files cannot be opened" className="mb-6">
          {NO_FILE_ACCESS}
        </Alert>
      ) : null}
      {app.status === "changes_requested" ? (
        <Alert tone="info" title="With the applicant" className="mb-6">
          Waiting for them to make the changes you asked for and send it back.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="About them">
            <DescriptionList
              columns={2}
              items={[
                { label: "Legal name", value: app.personal.legalName },
                { label: "Name shown", value: app.personal.displayName },
                { label: "Gender", value: app.personal.gender ? APPLICANT_GENDER_LABELS[app.personal.gender] : "" },
                { label: "Age", value: age != null ? `${age} (born ${app.personal.dateOfBirth})` : "" },
                { label: "Mobile", value: phone ? formatPhone(phone) : app.personal.phone },
                {
                  label: "Based in",
                  value: [app.personal.town ? townLabel(app.personal.town) : "", app.personal.area ? AREA_LABELS[app.personal.area] : ""]
                    .filter(Boolean)
                    .join(", "),
                },
              ]}
            />
          </Card>

          <Card title="Their work">
            <DescriptionList
              columns={2}
              items={[
                { label: "Offers", value: app.professional.services.map((s) => SERVICE_LABELS[s]).join(", "), wide: true },
                { label: "Experience", value: app.professional.yearsExperience != null ? `${app.professional.yearsExperience} years` : "" },
                { label: "Works at", value: app.professional.workplace },
                { label: "Professional body", value: app.professional.registrationBody },
                { label: "Registration number", value: app.professional.registrationNumber },
                {
                  label: "Works with",
                  value: app.professional.specializations.map((s) => SPECIALIZATION_LABELS[s]).join(", "),
                  wide: true,
                },
                { label: "Age groups", value: app.professional.ageGroups.map((g) => AGE_GROUP_LABELS[g]).join(", ") },
                { label: "Sessions by", value: app.professional.formats.map((f) => APPLICATION_FORMAT_LABELS[f]).join(", ") },
                {
                  label: "Languages",
                  value: [...app.professional.languages.map((l) => LOCALE_LABELS[l]), app.professional.otherLanguages.trim()]
                    .filter(Boolean)
                    .join(", "),
                  wide: true,
                },
              ]}
            />
          </Card>

          <Card title="Qualifications">
            {app.qualifications.length ? (
              <ul className="space-y-2 text-[14px]">
                {app.qualifications.map((q) => (
                  <li key={q.id} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>
                      {qualificationLine(q)}
                      {q.country ? <span className="text-[var(--muted)]"> · {q.country}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[var(--muted)]">None listed.</p>
            )}
          </Card>

          <Card title="How they describe their practice">
            <DescriptionList
              items={[
                { label: "One line", value: app.practice.headline },
                { label: "About them", value: <span className="whitespace-pre-line">{app.practice.bio}</span> },
                { label: "How they work", value: <span className="whitespace-pre-line">{app.practice.approach}</span> },
                { label: "A first session", value: <span className="whitespace-pre-line">{app.practice.firstSession}</span> },
              ]}
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Fee and payouts">
              <DescriptionList
                items={[
                  {
                    label: "Fee",
                    value: app.fee.sessionRateMinor
                      ? `${formatDalasi(app.fee.sessionRateMinor)} — they receive ${formatDalasi(takeHomeMinor(app.fee.sessionRateMinor))}`
                      : "",
                  },
                  {
                    label: "Paid to",
                    value: app.payout.network
                      ? `${PAYOUT_NETWORK_LABELS[app.payout.network]} ${app.payout.accountHint}, ${app.payout.beneficiaryName}`
                      : "",
                  },
                ]}
              />
            </Card>
            <Card title="Hours">
              {ranges.length ? (
                <>
                  <ul className="space-y-1.5 text-[14px]">
                    {DAYS.filter((d) => ranges.some((r) => r.day === d.value)).map((d) => (
                      <li key={d.value} className="flex gap-3">
                        <span className="w-[42px] font-medium">{d.short}</span>
                        <span className="text-[var(--muted)]">
                          {ranges
                            .filter((r) => r.day === d.value)
                            .map((r) => `${r.start}–${r.end}`)
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12.5px] text-[var(--muted)]">{weeklySessions(ranges)} sessions a week, UTC</p>
                </>
              ) : (
                <p className="text-[14px] text-[var(--muted)]">None given.</p>
              )}
            </Card>
          </div>

          <Card title="Agreements">
            <ul className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
              {AGREEMENTS.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${app.agreements.accepted[a.id] ? "bg-[var(--sage)]" : "bg-[var(--danger)]"}`}
                    aria-hidden
                  />
                  {a.title}
                  <span className="sr-only">{app.agreements.accepted[a.id] ? "accepted" : "not accepted"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13.5px] text-[var(--muted)]">
              {app.agreements.signedAt
                ? `Signed "${app.agreements.signature}" on ${when(app.agreements.signedAt)}`
                : "Not signed."}
            </p>
          </Card>

          <Card title="History">
            <Timeline items={timeline} emptyText="Nothing yet." />
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card title="Photo">
            {app.photo.path ? <PrivateImage uid={uid} path={app.photo.path} alt={`Photo of ${name}`} access={fileAccess} /> : <p className="text-[14px] text-[var(--muted)]">No photo.</p>}
          </Card>

          <Card title="Documents" aside={<span className="text-[12.5px] text-[var(--muted)]">{app.documents.length}</span>}>
            {app.documents.length ? (
              <ul className="space-y-3">
                {app.documents.map((doc) => (
                  <li key={doc.id} className="rounded-2xl bg-[var(--background)] p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
                        <IconFile size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">{DOC_TYPE_LABELS[doc.type]}</span>
                        <span className="block truncate text-[12px] text-[var(--muted)]">
                          {doc.name} · {formatBytes(doc.bytes)}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => void open(doc)} loading={opening === doc.id}>
                        View
                      </Button>
                    </div>
                    <SegmentedControl<DocVerdict | "none">
                      ariaLabel={`What you made of ${doc.name}`}
                      size="sm"
                      fullWidth
                      className="mt-3"
                      value={review.documents[doc.id] ?? "none"}
                      onChange={(v) => v !== "none" && setVerdict(doc.id, v)}
                      options={[
                        { value: "verified", label: "Checked" },
                        { value: "unclear", label: "Unclear" },
                        { value: "missing", label: "Wrong" },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[var(--muted)]">None uploaded.</p>
            )}
          </Card>

          <Card title="Checklist" aside={<span className="text-[12.5px] text-[var(--muted)]">{checksDone} of {REVIEW_CHECKS.length}</span>}>
            <div className="space-y-3.5">
              {REVIEW_CHECKS.map((c) => (
                <Checkbox key={c.id} label={c.label} checked={review.checks[c.id] === true} onChange={(on) => setCheck(c.id, on)} />
              ))}
            </div>
          </Card>

          <Card title="Staff notes">
            {notes.length ? (
              <ul className="mb-4 space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-2xl bg-[var(--background)] px-4 py-3">
                    <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{n.body}</p>
                    <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">
                      {n.authorId === me ? "You" : n.authorName} · {when(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-[13px] text-[var(--muted)]">Only staff see these. The applicant never does.</p>
            )}
            <Textarea label="Add a note" hideLabel rows={3} placeholder="Add a note for other staff" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" loading={savingNote} disabled={!note.trim()} onClick={() => void addNote()}>
                Add note
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={decision !== null}
        title={decision ? DECISIONS[decision].title : ""}
        confirmLabel={decision ? DECISIONS[decision].confirm : "Confirm"}
        danger={decision ? DECISIONS[decision].danger : false}
        onClose={() => setDecision(null)}
        onConfirm={decide}
        body={
          decision ? (
            <div className="space-y-4">
              <p>{DECISIONS[decision].body}</p>
              {decision === "approve" && checksDone < REVIEW_CHECKS.length ? (
                <p className="rounded-2xl bg-[var(--warning-soft)] px-4 py-3 text-[13px] text-[var(--warning)]">
                  The checklist is not finished ({checksDone} of {REVIEW_CHECKS.length}).
                </p>
              ) : null}
              {DECISIONS[decision].needsMessage ? (
                <Textarea
                  label={DECISIONS[decision].needsMessage ?? ""}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  error={decisionError}
                />
              ) : decisionError ? (
                <p className="text-[13px] text-[var(--danger)]">{decisionError}</p>
              ) : null}
              <p className="text-[12px]">
                Now: {STATUS_LABELS[app.status]}. This is recorded with your name.
              </p>
            </div>
          ) : null
        }
      />
    </div>
  );
}
