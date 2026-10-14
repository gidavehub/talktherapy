"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../ui/Button";
import ConfirmDialog from "../../ui/ConfirmDialog";
import DataTable from "../../ui/DataTable";
import DescriptionList from "../../ui/DescriptionList";
import { Dropdown } from "../../ui/Dropdown";
import { Alert, Skeleton } from "../../ui/Feedback";
import { Textarea } from "../../ui/Input";
import PageHeader from "../../ui/PageHeader";
import { PageBar } from "../../ui/AppShell";
import { useToast } from "../../ui/Toast";
import { useAuth } from "../../AuthProvider";
import StatusBadge from "../providers/StatusBadge";
import { useNow } from "@/lib/useNow";
import { adminGetUser, adminSetDisabled, adminSetRole, type OpsResult } from "@/lib/adminOps-client";
import {
  ROLE_LABELS,
  SCRIPT_ACTOR,
  SETTABLE_ROLES,
  type AdminBookingRow,
  type AdminPaymentRow,
  type AdminSupportRow,
  type AdminUserDetail,
  type EntitlementSummary,
  type SettableRole,
} from "@/lib/adminOps";
import { AI_TIERS, LOCALE_LABELS, SUPPORT_TOPIC_LABELS, type AppRole } from "@/lib/models";
import { formatDalasi } from "@/lib/money";
import AuditTimeline from "./AuditTimeline";
import { RoleChip, SupportChip } from "./chips";
import { bookingColumns, paymentColumns } from "./columns";
import { banjulDate, banjulDateTime, plural, relativeTime } from "./format";
import { PaymentDrawer } from "./MoneyDrawers";
import { BanjulNote, Chip, LoadError, PersonLink, Reference, Section } from "./parts";
import SessionDrawer from "./SessionDrawer";
import SupportDrawer from "./SupportDrawer";
import { useStaff } from "./useStaff";

/**
 * One person, as staff may see them: their account and sign-in, their role
 * and whether they can sign in (both changeable here, each behind a
 * confirmation), what they have paid for, their sessions and payments, what
 * they have asked support, and every staff change made to them.
 *
 * Nothing they told TALK or a provider is on this page. The server sends
 * named, safe fields only (adminGetUser), so there is nothing here to hide.
 */

const ROLE_CHOICES: { value: SettableRole; label: string; description: string }[] = [
  { value: "patient", label: ROLE_LABELS.patient, description: "Talks with TALK and books providers." },
  { value: "provider", label: ROLE_LABELS.provider, description: "Offers sessions, once an application is approved." },
  { value: "admin", label: ROLE_LABELS.admin, description: "Sees and changes everything on these staff pages." },
];

/** What a role change will do, said before it is done. */
function roleChangeEffects(from: AppRole, to: SettableRole): string[] {
  const effects: string[] = [];
  if (to === "admin") {
    effects.push(
      "They will see every staff page — people, money, support and the audit log — and can change other people's roles.",
      "Their sign-in gets staff access the next time they open a staff page.",
    );
  }
  if (from === "admin") effects.push("They lose the staff pages straight away.");
  if (from === "provider") {
    effects.push("Their listing leaves the directory and their application is paused. Sessions already booked are not cancelled.");
  }
  if (to === "provider") effects.push("They are not listed until a provider application of theirs is approved.");
  if (to === "patient" && from !== "patient") effects.push("They use TALK as anybody looking for help does.");
  return effects;
}

/** Where a paid conversation with TALK stands. */
function entitlementState(e: EntitlementSummary, now: number): { label: string; tone: "positive" | "muted" | "warning" } {
  if (e.active) return { label: e.startedAt ? "In use" : "Ready to use", tone: "positive" };
  if (e.startedAt && e.endsAt !== null && e.endsAt <= now) return { label: "Used", tone: "muted" };
  if (!e.startedAt && e.expiresAt !== null && e.expiresAt <= now) return { label: "Lapsed unused", tone: "warning" };
  return { label: "Not active", tone: "muted" };
}

type Loaded = { uid: string; key: string; result: OpsResult<AdminUserDetail> };

export default function UserDetail({ uid }: { uid: string }) {
  const { user } = useAuth();
  const me = user?.uid ?? "";
  const toast = useToast();
  const now = useNow(60_000);
  const staff = useStaff();

  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}|${uid}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const [roleChoice, setRoleChoice] = useState<SettableRole | null>(null);
  const [roleReason, setRoleReason] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessReason, setAccessReason] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);

  const [session, setSession] = useState<AdminBookingRow | null>(null);
  const [payment, setPayment] = useState<AdminPaymentRow | null>(null);
  const [request, setRequest] = useState<AdminSupportRow | null>(null);

  useEffect(() => {
    let live = true;
    void adminGetUser(uid).then((result) => {
      if (live) setLoaded({ uid, key, result });
    });
    return () => {
      live = false;
    };
  }, [uid, key]);

  // After a change the page keeps showing what it had while the fresh copy
  // comes; only a different person starts from a skeleton.
  const shown = loaded?.uid === uid ? loaded : null;
  const refreshing = shown !== null && shown.key !== key;
  const reload = () => setAttempt((n) => n + 1);

  if (!shown) {
    return (
      <div role="status" aria-label="Loading this person" className="space-y-6">
        <Skeleton className="h-4 w-40" rounded="rounded-full" />
        <Skeleton className="h-12 w-72" rounded="rounded-2xl" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-72" rounded="rounded-[24px]" />
          <Skeleton className="h-72" rounded="rounded-[24px]" />
        </div>
      </div>
    );
  }

  if (!shown.result.ok) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: "Account" }]} lines={["This account"]} />
        <LoadError title="This person did not load" message={shown.result.error} onRetry={reload} busy={refreshing} />
      </div>
    );
  }

  const d = shown.result.data;
  const profile = d.profile;
  const auth = d.auth;
  const name = profile?.displayName ?? profile?.email ?? "No name";
  const role = profile?.role ?? null;
  const isMe = uid === me;
  const disabled = auth?.disabled === true;
  const currentChoice = role && (SETTABLE_ROLES as readonly string[]).includes(role) ? (role as SettableRole) : null;
  const bookingsAbout = role === "provider" ? "provider" : "patient";

  async function changeRole() {
    if (!roleChoice) return;
    setRoleError(null);
    const result = await adminSetRole({ uid, role: roleChoice, reason: roleReason.trim() || undefined });
    if (!result.ok) {
      setRoleError(result.error);
      return;
    }
    const r = result.data;
    toast.success(
      r.changed ? `${name} is now ${ROLE_LABELS[r.role].toLowerCase()}.` : `${name} already had that role.`,
      r.listingPaused ? "Their provider listing has left the directory." : undefined,
    );
    setRoleChoice(null);
    reload();
  }

  async function changeAccess() {
    const reason = accessReason.trim();
    if (!disabled && reason.length < 5) {
      setAccessError("Say why, in a few words. It is kept in the audit log.");
      return;
    }
    setAccessError(null);
    const result = await adminSetDisabled({ uid, disabled: !disabled, reason });
    if (!result.ok) {
      setAccessError(result.error);
      return;
    }
    toast.success(result.data.disabled ? "Their sign-in is turned off." : "They can sign in again.");
    setAccessOpen(false);
    reload();
  }

  const entitlement = d.entitlement;
  const entitlementNow = entitlement ? entitlementState(entitlement, now) : null;

  return (
    <div>
      <PageBar>
        <Link
          href="/admin/users"
          aria-label="Back to everyone"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-medium">{name}</span>
        <span className="hidden sm:inline-flex">
          <RoleChip role={role} />
        </span>
      </PageBar>

      <PageHeader
        breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: name }]}
        eyebrow={role ? ROLE_LABELS[role] : "No TALK profile"}
        lines={[name]}
        lede={
          <span className="flex flex-col gap-1">
            <span className="[overflow-wrap:anywhere]">{profile?.email ?? "No email on their profile"}</span>
            <span>
              Joined {banjulDate(profile?.createdAt ?? auth?.createdAt ?? null, now)}
              {d.lastSeenAt ? ` · last seen ${relativeTime(d.lastSeenAt, now)}` : ""}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RoleChip role={role} />
            {disabled ? <Chip tone="danger">Turned off</Chip> : null}
            {refreshing ? <span className="text-[12px] text-[var(--muted)]">Updating…</span> : null}
          </div>
        }
      />

      <div className="mb-6 space-y-3">
        {isMe ? (
          <Alert tone="info" title="This is you">
            Your own role and sign-in can only be changed by another member of staff.
          </Alert>
        ) : null}
        {disabled ? (
          <Alert tone="warning" title="Their sign-in is turned off">
            They cannot sign in to TALK until it is turned back on.
          </Alert>
        ) : null}
        {!profile ? (
          <Alert tone="info" title="No TALK profile yet">
            They have a sign-in but never got as far as making a profile, so there is no role to change.
          </Alert>
        ) : null}
        {!auth ? (
          <Alert tone="info" title="The sign-in has been deleted">
            Their profile is still here, but there is no sign-in account behind it any more.
          </Alert>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section title="Account" aside={<BanjulNote />}>
            <DescriptionList
              columns={2}
              items={[
                {
                  label: "Email",
                  value: profile?.email ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="[overflow-wrap:anywhere]">{profile.email}</span>
                      {auth?.emailVerified ? <Chip tone="muted">Checked</Chip> : null}
                    </span>
                  ) : (
                    ""
                  ),
                },
                { label: "Signs in with", value: auth ? auth.signInMethods.join(", ") : "" },
                { label: "Joined", value: banjulDateTime(profile?.createdAt ?? auth?.createdAt ?? null, now) },
                { label: "Last signed in", value: auth?.lastSignInAt ? banjulDateTime(auth.lastSignInAt, now) : "" },
                {
                  label: "Last seen",
                  value: d.lastSeenAt ? `${relativeTime(d.lastSeenAt, now)} · ${banjulDateTime(d.lastSeenAt, now)}` : "",
                },
                { label: "Language", value: profile ? LOCALE_LABELS[profile.locale] : "" },
                {
                  label: "Talked to TALK",
                  value: profile ? (profile.onboarded ? "Yes" : "Not yet") : "",
                },
                { label: "Organisation", value: profile?.orgId ? <Reference>{profile.orgId}</Reference> : "" },
                {
                  label: "Role before",
                  value: profile?.previousRole ? ROLE_LABELS[profile.previousRole] : "",
                },
                {
                  label: "Role last changed",
                  value: profile?.roleChangedAt ? (
                    <span>
                      {banjulDateTime(profile.roleChangedAt, now)}
                      {profile.roleChangedBy === SCRIPT_ACTOR ? (
                        " · by a script"
                      ) : profile.roleChangedBy ? (
                        <>
                          {" · by "}
                          <PersonLink uid={profile.roleChangedBy} name={profile.roleChangedBy === me ? "you" : "a member of staff"} />
                        </>
                      ) : null}
                    </span>
                  ) : (
                    ""
                  ),
                },
                {
                  label: "Staff access on their sign-in",
                  value: auth ? (auth.claims.admin ? "Yes" : role === "admin" ? "Not yet — added when they next open a staff page" : "No") : "",
                },
                { label: "Account id", value: <Reference>{uid}</Reference> },
              ]}
            />
          </Section>

          <Section
            title="Sessions"
            aside={
              role === "provider" ? (
                <Link
                  href={`/admin/sessions?provider=${uid}`}
                  className="text-[13px] text-[var(--accent-deep)] underline-offset-4 hover:underline"
                >
                  All their sessions
                </Link>
              ) : undefined
            }
          >
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Coming up", d.bookings.upcoming],
                  ["Past", d.bookings.past],
                  ["Cancelled", d.bookings.cancelled],
                  ["Disputed", d.bookings.disputed],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="rounded-2xl bg-[var(--background)] px-4 py-3">
                  <p className="text-[12px] text-[var(--muted)]">{label}</p>
                  <p className={`mt-1 font-display text-[24px] font-medium leading-none ${label === "Disputed" && count > 0 ? "text-[var(--danger)]" : ""}`}>
                    {count}
                  </p>
                </div>
              ))}
            </div>
            <DataTable
              columns={bookingColumns(now, { hide: bookingsAbout })}
              rows={d.bookings.recent}
              rowKey={(b) => b.id}
              onRowClick={setSession}
              pageSize={10}
              empty={{ title: "No sessions", description: "Nothing booked with or by them yet." }}
            />
            {d.bookings.total > d.bookings.recent.length ? (
              <p className="mt-3 text-[12.5px] text-[var(--muted)]">
                The {d.bookings.recent.length} most recent of {plural(d.bookings.total, "session")}.
              </p>
            ) : null}
          </Section>

          <Section title="Payments" aside={<span className="text-[12.5px] text-[var(--muted)]">{plural(d.payments.total, "payment")}</span>}>
            <DataTable
              columns={paymentColumns(now, { payer: false })}
              rows={d.payments.recent}
              rowKey={(p) => p.id}
              onRowClick={setPayment}
              pageSize={10}
              empty={{ title: "No payments", description: "They have not paid for anything yet." }}
            />
            {d.payments.total > d.payments.recent.length ? (
              <p className="mt-3 text-[12.5px] text-[var(--muted)]">
                The {d.payments.recent.length} most recent of {plural(d.payments.total, "payment")}.
              </p>
            ) : null}
          </Section>

          <Section title="Messages to support">
            {d.support.length ? (
              <ul className="space-y-2">
                {d.support.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setRequest(s)}
                      className="flex min-h-11 w-full items-start justify-between gap-4 rounded-2xl bg-[var(--background)] px-4 py-3 text-left outline-none transition-colors hover:bg-[var(--cream)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium">{SUPPORT_TOPIC_LABELS[s.topic]}</span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--muted)]">{s.message}</span>
                        <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{banjulDateTime(s.createdAt, now)}</span>
                      </span>
                      <SupportChip status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[var(--muted)]">Nothing sent to support.</p>
            )}
          </Section>

          <Section
            title="Changes made by staff"
            aside={
              <Link
                href={`/admin/audit?target=${encodeURIComponent(`users/${uid}`)}`}
                className="text-[13px] text-[var(--accent-deep)] underline-offset-4 hover:underline"
              >
                In the audit log
              </Link>
            }
          >
            {d.audit.length ? (
              <AuditTimeline rows={d.audit} now={now} me={me} showTarget={false} />
            ) : (
              <p className="text-[14px] text-[var(--muted)]">No staff changes recorded.</p>
            )}
          </Section>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Section title="Role and sign-in">
            <div className="space-y-6">
              <div>
                <Dropdown<SettableRole>
                  label="Role"
                  options={ROLE_CHOICES}
                  value={roleChoice ?? currentChoice}
                  placeholder={role ? ROLE_LABELS[role] : "No profile"}
                  disabled={!profile || isMe || refreshing}
                  hint={
                    isMe
                      ? "You cannot change your own role."
                      : !profile
                        ? "There is no profile to give a role to."
                        : role === "org_admin"
                          ? "Organisation admins are set up separately; choosing a role here replaces it."
                          : undefined
                  }
                  onChange={(next) => {
                    if (next === currentChoice) return;
                    setRoleChoice(next);
                    setRoleReason("");
                    setRoleError(null);
                  }}
                />
              </div>

              <div className="border-t border-[var(--border)] pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]">Sign-in</p>
                <p className="mt-2 text-[14px]">
                  {!auth ? "No sign-in account." : disabled ? "Turned off. They cannot sign in." : "They can sign in."}
                </p>
                {auth && !isMe ? (
                  <div className="mt-4">
                    <Button
                      variant={disabled ? "sage" : "secondary"}
                      fullWidth
                      disabled={refreshing}
                      onClick={() => {
                        setAccessOpen(true);
                        setAccessReason("");
                        setAccessError(null);
                      }}
                    >
                      {disabled ? "Turn sign-in back on" : "Turn off sign-in"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </Section>

          <Section title="Conversations with TALK">
            {entitlement && entitlementNow ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={entitlementNow.tone}>{entitlementNow.label}</Chip>
                  <span className="text-[13px] text-[var(--muted)]">{AI_TIERS[entitlement.tier].label}</span>
                </div>
                <DescriptionList
                  items={[
                    { label: "Paid", value: `${formatDalasi(entitlement.amountMinor)} · ${banjulDateTime(entitlement.grantedAt, now)}` },
                    { label: "Start by", value: banjulDateTime(entitlement.expiresAt, now) },
                    { label: "Started", value: entitlement.startedAt ? banjulDateTime(entitlement.startedAt, now) : "Not yet" },
                    { label: "Ends", value: entitlement.endsAt ? banjulDateTime(entitlement.endsAt, now) : "" },
                    {
                      label: "On their sign-in",
                      value: auth?.claims.aiTier ? AI_TIERS[auth.claims.aiTier].label : "Nothing",
                    },
                  ]}
                />
              </div>
            ) : (
              <p className="text-[14px] text-[var(--muted)]">Nothing paid for yet.</p>
            )}
          </Section>

          {d.providerApplication || role === "provider" ? (
            <Section title="Provider application">
              {d.providerApplication ? (
                <div className="space-y-4">
                  <StatusBadge status={d.providerApplication.status} />
                  <DescriptionList
                    items={[
                      { label: "Sent", value: d.providerApplication.submittedAt ? banjulDateTime(d.providerApplication.submittedAt, now) : "Not yet" },
                      { label: "Decided", value: d.providerApplication.decidedAt ? banjulDateTime(d.providerApplication.decidedAt, now) : "" },
                    ]}
                  />
                  <Button variant="secondary" fullWidth href={`/admin/providers/${uid}`}>
                    Open the application
                  </Button>
                </div>
              ) : (
                <p className="text-[14px] text-[var(--muted)]">They have not started one.</p>
              )}
            </Section>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={roleChoice !== null}
        title={roleChoice ? `Make ${name} ${ROLE_LABELS[roleChoice].toLowerCase()}?` : ""}
        confirmLabel={roleChoice === "admin" ? "Make them staff" : "Change role"}
        danger={role === "admin" || role === "provider"}
        onClose={() => setRoleChoice(null)}
        onConfirm={changeRole}
        body={
          roleChoice && role ? (
            <div className="space-y-4">
              <p>
                From {ROLE_LABELS[role].toLowerCase()} to {ROLE_LABELS[roleChoice].toLowerCase()}. Their old role is kept,
                so it can be given back.
              </p>
              <ul className="space-y-2">
                {roleChangeEffects(role, roleChoice).map((effect) => (
                  <li key={effect} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{effect}</span>
                  </li>
                ))}
              </ul>
              <Textarea
                label="Why (optional)"
                hint="Kept in the audit log."
                rows={2}
                maxLength={300}
                value={roleReason}
                onChange={(event) => setRoleReason(event.target.value)}
                error={roleError}
              />
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        open={accessOpen}
        title={disabled ? `Let ${name} sign in again?` : `Turn off ${name}'s sign-in?`}
        confirmLabel={disabled ? "Turn it back on" : "Turn it off"}
        danger={!disabled}
        onClose={() => setAccessOpen(false)}
        onConfirm={changeAccess}
        body={
          <div className="space-y-4">
            <p>
              {disabled
                ? "They can sign in again the usual way. Nothing of theirs was deleted while it was off."
                : "They are signed out on every device — within the hour at the latest — and cannot sign in until it is turned back on. Nothing of theirs is deleted, and sessions already booked are not cancelled."}
            </p>
            <Textarea
              label={disabled ? "Why (optional)" : "Why"}
              hint="Kept in the audit log."
              rows={2}
              maxLength={300}
              required={!disabled}
              value={accessReason}
              onChange={(event) => setAccessReason(event.target.value)}
              error={accessError}
            />
          </div>
        }
      />

      <SessionDrawer booking={session} onClose={() => setSession(null)} onReviewed={reload} />
      <PaymentDrawer payment={payment} onClose={() => setPayment(null)} onReviewed={reload} />
      <SupportDrawer
        request={request}
        staff={staff}
        me={me}
        now={now}
        onClose={() => setRequest(null)}
        onUpdated={(row) => {
          setRequest(row);
          reload();
        }}
      />
    </div>
  );
}
