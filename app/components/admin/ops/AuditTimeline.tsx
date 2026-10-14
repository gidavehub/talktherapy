"use client";

import Link from "next/link";
import { ROLE_LABELS, SCRIPT_ACTOR, SUPPORT_STATUS_LABELS, SYSTEM_ACTOR, type AdminAuditRow } from "@/lib/adminOps";
import { banjulDayLabel, banjulTime, dayStart } from "./format";
import { PersonLink } from "./parts";

/**
 * The audit log drawn as a timeline, a day at a time: what was done, by
 * whom, to what, and the details the function recorded with it.
 *
 * Its own rather than the kit's Timeline, which shows the browser's local
 * time; an audit entry is quoted back to somebody, and has to read in Banjul
 * time wherever it is opened. Entries arrive newest first and stay so.
 */

type Tone = "neutral" | "accent" | "danger" | "positive";

const DOTS: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] shadow-[0_0_0_4px_var(--sand)]",
  positive: "bg-[var(--success)] shadow-[0_0_0_4px_var(--success-soft)]",
  danger: "bg-[var(--danger)] shadow-[0_0_0_4px_var(--danger-soft)]",
  accent: "bg-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
};

/** Turning something off or down is what a reader of the log looks for first. */
function toneOf(action: string): Tone {
  if (/\.(disable|reject|suspend|delete)$/.test(action)) return "danger";
  if (/\.(approve|reinstate|enable|publish)$/.test(action)) return "positive";
  if (action.startsWith("user.")) return "accent";
  return "neutral";
}

/** Where an entry's target can be opened, and what to call it. */
export function auditTarget(path: string): { label: string; href: string | null } {
  const [collection, raw] = path.split("/");
  if (!raw) return { label: path || "—", href: null };
  // The id goes into a link as one path segment, whatever it holds.
  const id = encodeURIComponent(raw);
  switch (collection) {
    case "users":
      return { label: "Their account", href: `/admin/users/${id}` };
    case "entitlements":
      return { label: "Their paid conversation", href: `/admin/users/${id}` };
    case "payoutAccounts":
      return { label: "Their payout account", href: `/admin/users/${id}` };
    case "providerApplications":
      return { label: "Provider application", href: `/admin/providers/${id}` };
    case "supportRequests":
      return { label: "Support request", href: `/admin/support?request=${id}` };
    case "siteContent":
      return { label: `Site page: ${raw}`, href: "/admin/content" };
    case "siteMedia":
      return { label: "Media library picture", href: "/admin/content/media" };
    // Held payments, flagged payouts and disputed sessions are decided on
    // the review page; the decision itself is on the item.
    case "payments":
      return { label: "A held payment", href: "/admin/review" };
    case "payouts":
      return { label: "A flagged payout", href: "/admin/review" };
    case "bookings":
      return { label: "A disputed session", href: "/admin/review" };
    default:
      return { label: path, href: null };
  }
}

/** "previousRole" → "previous role". */
function keyLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

function valueLabel(value: string | number | boolean | null): string {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  // Own keys only: "constructor" is "in" every object.
  if (Object.hasOwn(ROLE_LABELS, value)) return ROLE_LABELS[value as keyof typeof ROLE_LABELS];
  if (Object.hasOwn(SUPPORT_STATUS_LABELS, value)) return SUPPORT_STATUS_LABELS[value as keyof typeof SUPPORT_STATUS_LABELS];
  return value.replace(/_/g, " ");
}

/** The details recorded with an entry, as short "key: value" chips. */
export function AuditDetails({ metadata }: { metadata: AdminAuditRow["metadata"] }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="max-w-full rounded-full bg-[var(--sand)] px-2.5 py-1 text-[11.5px] leading-snug text-[var(--foreground)] [overflow-wrap:anywhere]"
        >
          <span className="text-[var(--muted)]">{keyLabel(key)}:</span>{" "}
          {Array.isArray(value) ? value.map(valueLabel).join(", ") : valueLabel(value)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Who did it: a link to their account, "A script" for scripts/grant-admin.mjs
 * and the like, or TALK itself for what happens on its own.
 */
export function AuditActor({ row, me }: { row: AdminAuditRow; me: string }) {
  if (row.actorId === SCRIPT_ACTOR) return <span>A script</span>;
  if (row.actorId === SYSTEM_ACTOR) return <span>TALK, automatically</span>;
  if (row.actorId === me) return <PersonLink uid={row.actorId} name="You" />;
  return <PersonLink uid={row.actorId} name={row.actorName} fallback="A member of staff" />;
}

export function AuditTargetLink({ path }: { path: string }) {
  const target = auditTarget(path);
  return target.href ? (
    <Link
      href={target.href}
      className="rounded-sm text-[var(--accent-deep)] underline-offset-4 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15"
    >
      {target.label}
    </Link>
  ) : (
    <span className="break-all">{target.label}</span>
  );
}

export default function AuditTimeline({
  rows,
  now,
  me,
  showTarget = true,
}: {
  rows: AdminAuditRow[];
  now: number;
  me: string;
  /** Off on a person's own page, where every entry is about them. */
  showTarget?: boolean;
}) {
  // Runs of one Banjul day each, in the order given.
  const days: { day: number; rows: AdminAuditRow[] }[] = [];
  for (const row of rows) {
    const day = row.createdAt === null ? -1 : dayStart(row.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else days.push({ day, rows: [row] });
  }

  return (
    <div className="space-y-8">
      {days.map((group) => (
        <section key={group.day} aria-label={group.day < 0 ? "Undated" : banjulDayLabel(group.day, now)}>
          <h3 className="mb-4 text-[10.5px] font-medium uppercase tracking-[0.28em] text-[var(--sage)]">
            {group.day < 0 ? "Undated" : banjulDayLabel(group.day, now)}
          </h3>
          <ol>
            {group.rows.map((row, i) => {
              const last = i === group.rows.length - 1;
              return (
                <li key={row.id} className={`relative pl-8 ${last ? "" : "pb-6"}`}>
                  {last ? null : <span aria-hidden className="absolute bottom-0 left-[5px] top-4 w-px bg-[var(--border)]" />}
                  <span aria-hidden className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full ${DOTS[toneOf(row.action)]}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-[14px] font-medium leading-snug">{row.actionLabel}</p>
                    {row.createdAt !== null ? (
                      <time dateTime={new Date(row.createdAt).toISOString()} className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]">
                        {banjulTime(row.createdAt)}
                      </time>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                    by <AuditActor row={row} me={me} />
                    {showTarget && row.targetPath ? (
                      <>
                        {" · "}
                        <AuditTargetLink path={row.targetPath} />
                      </>
                    ) : null}
                  </p>
                  <div className="mt-2">
                    <AuditDetails metadata={row.metadata} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
