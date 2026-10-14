/**
 * Staff operations: what the staff pages are sent about people, sessions,
 * payments, support and the audit log, and the small rules both sides share
 * (track: ops).
 *
 * Pure on purpose — no Firebase, no React — because the adminOps functions
 * compile it in (functions/tsconfig.json) and build every answer with it, and
 * scripts/test-admin-ops.mts checks it offline. The browser's half, the
 * callable wrappers, is ./adminOps-client.
 *
 * The one rule that matters most here: a staff page is sent ALLOWED fields,
 * never "everything but". Every row below is built by picking named fields,
 * so a field added to a document tomorrow — a new intake answer, a note — is
 * not shown to staff until somebody decides it should be.
 */

import { AI_TIERS, LOCALE_LABELS, SUPPORT_TOPIC_LABELS, entitlementActive, normaliseRole } from "./models";
import type { AiTierId, AppRole, BookingStatus, Locale, PaymentStatus, SupportTopic } from "./models";
import type { PayoutStatus } from "./payouts";
import type { ApplicationStatus } from "./providerApplication";

// -------------------------------------------------------------------- paging

export const PAGE_LIMIT_DEFAULT = 25;
export const PAGE_LIMIT_MAX = 100;

/** How many rows a page asks for, kept to what one call can afford to read. */
export function pageLimit(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : PAGE_LIMIT_DEFAULT;
  return Math.min(Math.max(n, 1), PAGE_LIMIT_MAX);
}

/** One page of a list, and where the next one starts (null at the end). */
export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Where a page ended: the ordering value of its last document and that
 * document's id, so the next page starts strictly after it even when two
 * documents share a time.
 *
 * A Firestore timestamp keeps its seconds and nanoseconds as they are.
 * Rounding one to milliseconds would put the cursor a fraction before the
 * document, and anything written in that same millisecond would be skipped.
 */
export type CursorPosition =
  | { kind: "number"; value: number; id: string }
  | { kind: "timestamp"; seconds: number; nanos: number; id: string };

const CURSOR_MAX = 1600;

/** A cursor as the page holds it. Opaque to the page; the server reads it back. */
export function encodeCursor(position: CursorPosition): string {
  return position.kind === "number"
    ? `n~${position.value}~${position.id}`
    : `t~${position.seconds}~${position.nanos}~${position.id}`;
}

/** The position a cursor names, or null when it is not one this code wrote. */
export function decodeCursor(raw: unknown): CursorPosition | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > CURSOR_MAX) return null;
  const parts = raw.split("~");
  // A document id is the last part, and may itself contain "~".
  const idFrom = (index: number) => {
    const id = parts.slice(index).join("~");
    return id && !id.includes("/") ? id : null;
  };
  if (parts[0] === "n" && parts.length >= 3) {
    const value = parts[1] === "" ? NaN : Number(parts[1]);
    const id = idFrom(2);
    return Number.isFinite(value) && id ? { kind: "number", value, id } : null;
  }
  if (parts[0] === "t" && parts.length >= 4) {
    const seconds = parts[1] === "" ? NaN : Number(parts[1]);
    const nanos = parts[2] === "" ? NaN : Number(parts[2]);
    const id = idFrom(3);
    const ok = Number.isSafeInteger(seconds) && Number.isInteger(nanos) && nanos >= 0 && nanos < 1e9;
    return ok && id ? { kind: "timestamp", seconds, nanos, id } : null;
  }
  return null;
}

/**
 * Firestore's own order for two positions: numbers before timestamps (its
 * type order), then by value, then by document id.
 */
export function comparePositions(a: CursorPosition, b: CursorPosition): number {
  if (a.kind !== b.kind) return a.kind === "number" ? -1 : 1;
  const byValue =
    a.kind === "number" && b.kind === "number"
      ? a.value - b.value
      : a.kind === "timestamp" && b.kind === "timestamp"
        ? a.seconds - b.seconds || a.nanos - b.nanos
        : 0;
  if (byValue !== 0) return byValue;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A page of a list that was read whole — the small sets fetched by one
 * equality (sessions in dispute, payments held for review) — paged in memory
 * with the same cursors as everything else.
 */
export function pageAfter<T>(
  items: T[],
  positionOf: (item: T) => CursorPosition,
  direction: "asc" | "desc",
  cursor: CursorPosition | null,
  limit: number,
): { items: T[]; next: CursorPosition | null } {
  const sign = direction === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => sign * comparePositions(positionOf(a), positionOf(b)));
  const rest = cursor ? sorted.filter((item) => sign * comparePositions(positionOf(item), cursor) > 0) : sorted;
  const page = rest.slice(0, limit);
  return { items: page, next: rest.length > limit ? positionOf(page[page.length - 1]) : null };
}

// --------------------------------------------------------------------- time

/** A span of time in ms. A missing end is open: null `from` is "since the start". */
export type DateRange = { from: number | null; to: number | null };

/**
 * The range a page sent, checked. Null when it is not one: a range is two
 * optional, non-negative millisecond times, the first no later than the
 * second. Pages build it with resolveDateRange from the DateRangePicker.
 */
export function parseRange(raw: unknown): DateRange | null {
  if (raw == null) return { from: null, to: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const read = (v: unknown): number | null | undefined =>
    v == null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
  const from = read((raw as Record<string, unknown>).from);
  const to = read((raw as Record<string, unknown>).to);
  if (from === undefined || to === undefined) return null;
  if (from !== null && to !== null && from > to) return null;
  return { from, to };
}

export function inRange(value: number | null, range: DateRange): boolean {
  if (value === null) return range.from === null && range.to === null;
  return (range.from === null || value >= range.from) && (range.to === null || value <= range.to);
}

/**
 * The same length of time just before `range`, for "compared with the
 * previous 30 days". None for an open start: all time has no "before".
 */
export function previousRange(range: DateRange, now: number): DateRange | null {
  if (range.from === null) return null;
  const to = range.to ?? now;
  const length = to - range.from + 1;
  return { from: Math.max(range.from - length, 0), to: range.from - 1 };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today, in Banjul. The Gambia keeps UTC all year, so the UTC day is the day. */
export function banjulDay(now: number): { start: number; end: number } {
  const start = Math.floor(now / DAY_MS) * DAY_MS;
  return { start, end: start + DAY_MS - 1 };
}

/**
 * A stored time as ms — whichever way it was written. Users and support
 * requests carry Firestore timestamps (serverTimestamp), the functions write
 * numbers, and Auth hands back date strings.
 */
export function toMillis(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value && typeof value === "object") {
    const v = value as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
    if (typeof v.toMillis === "function") return (v.toMillis as () => number)();
    if (typeof v.seconds === "number") {
      return v.seconds * 1000 + Math.floor((typeof v.nanoseconds === "number" ? v.nanoseconds : 0) / 1e6);
    }
  }
  return null;
}

/** The latest of several times, any of which may be unknown. */
export function latest(...values: (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return known.length ? Math.max(...known) : null;
}

// ------------------------------------------------------- what is never sent

/**
 * Keys that hold what a person disclosed, or their private record. No row
 * below carries any of them; scripts/test-admin-ops.mts checks that against
 * documents that do.
 */
export const CLINICAL_KEYS = [
  "intake",
  "goals",
  "consents",
  "concernSummary",
  "patientNote",
  "notes",
  "journalEntries",
  "moodEntries",
  "transcript",
  "summary",
] as const;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// -------------------------------------------------------------------- people

export const APP_ROLES = ["patient", "provider", "admin", "org_admin"] as const satisfies readonly AppRole[];

/** The roles staff may give somebody here. Organisation admins are set up elsewhere. */
export const SETTABLE_ROLES = ["patient", "provider", "admin"] as const;
export type SettableRole = (typeof SETTABLE_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  patient: "Patient",
  provider: "Provider",
  admin: "Staff",
  org_admin: "Organisation admin",
};

export function isSettableRole(value: unknown): value is SettableRole {
  return typeof value === "string" && (SETTABLE_ROLES as readonly string[]).includes(value);
}

/** Would giving `target` the role `next` leave nobody on the staff side? */
export function wouldLeaveNoAdmin(adminUids: string[], target: string, next: AppRole): boolean {
  if (next === "admin") return false;
  return adminUids.filter((uid) => uid !== target).length === 0;
}

/**
 * `verified` after a role change. For a provider it means "live in the
 * directory" — the same thing approving their application sets — so only a
 * provider whose listing is still live keeps it. Everyone else is trivially
 * verified, as a patient's account is created.
 */
export function verifiedForRole(role: AppRole, listingLive: boolean): boolean {
  return role === "provider" ? listingLive : true;
}

/** The fields of users/{uid} a staff page may ever be sent. Read with a field mask. */
export const SAFE_USER_FIELDS = [
  "email",
  "displayName",
  "photoURL",
  "role",
  "previousRole",
  "verified",
  "onboarded",
  "locale",
  "orgId",
  "createdAt",
  "updatedAt",
  "roleChangedAt",
  "roleChangedBy",
] as const;

export type SafeUserProfile = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: AppRole;
  /** The role before the most recent change, kept so it can be given back. */
  previousRole: AppRole | null;
  verified: boolean;
  onboarded: boolean;
  locale: Locale;
  orgId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  roleChangedAt: number | null;
  roleChangedBy: string | null;
};

export function safeUser(uid: string, data: Record<string, unknown>): SafeUserProfile {
  const locale = str(data.locale);
  return {
    uid,
    displayName: str(data.displayName),
    email: str(data.email),
    photoURL: str(data.photoURL),
    role: normaliseRole(str(data.role)),
    previousRole: str(data.previousRole) ? normaliseRole(str(data.previousRole)) : null,
    verified: data.verified === true,
    onboarded: data.onboarded === true,
    locale: locale && locale in LOCALE_LABELS ? (locale as Locale) : "en",
    orgId: str(data.orgId),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    roleChangedAt: toMillis(data.roleChangedAt),
    roleChangedBy: str(data.roleChangedBy),
  };
}

/** A paid conversation with TALK, as staff see it. */
export type EntitlementSummary = {
  tier: AiTierId;
  amountMinor: number;
  grantedAt: number | null;
  /** Start by this, or it lapses. */
  expiresAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  /** Paid for, not lapsed and not run out, right now. */
  active: boolean;
};

export function entitlementSummary(data: Record<string, unknown> | null | undefined, now: number): EntitlementSummary | null {
  if (!data || (data.aiTier !== "initial" && data.aiTier !== "extended")) return null;
  const expiresAt = num(data.expiresAt);
  const endsAt = num(data.endsAt);
  return {
    tier: data.aiTier,
    amountMinor: num(data.amountMinor) ?? 0,
    grantedAt: num(data.grantedAt),
    expiresAt,
    startedAt: num(data.startedAt),
    endsAt,
    active: data.status === "granted" && expiresAt !== null && entitlementActive({ status: "granted", expiresAt, endsAt }, now),
  };
}

/**
 * The custom claims staff are shown — the known ones, nothing else. A claim
 * this code does not know about is not something to display on a hunch.
 */
export type KnownClaims = {
  admin: boolean;
  aiTier: AiTierId | null;
  aiExpiresAt: number | null;
  aiEndsAt: number | null;
};

export function knownClaims(claims: Record<string, unknown> | null | undefined): KnownClaims {
  const c = claims ?? {};
  return {
    admin: c.admin === true,
    aiTier: c.aiTier === "initial" || c.aiTier === "extended" ? c.aiTier : null,
    aiExpiresAt: num(c.aiExpiresAt),
    aiEndsAt: num(c.aiEndsAt),
  };
}

const SIGN_IN_METHOD_LABELS: Record<string, string> = {
  "google.com": "Google",
  password: "Email and password",
  phone: "Phone",
  "apple.com": "Apple",
};

export function signInMethodLabel(providerId: string): string {
  return SIGN_IN_METHOD_LABELS[providerId] ?? providerId;
}

/** One person in the staff list. */
export type AdminUserRow = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  /** Null for a sign-in account that never made a TALK profile. */
  role: AppRole | null;
  verified: boolean;
  onboarded: boolean;
  createdAt: number | null;
  lastSeenAt: number | null;
  /** Turned off in Firebase Auth: they cannot sign in. */
  disabled: boolean;
  entitlement: EntitlementSummary | null;
  bookingCount: number;
  paymentCount: number;
};

export function userRow(
  uid: string,
  profile: SafeUserProfile | null,
  extras: {
    authEmail?: string | null;
    authName?: string | null;
    authCreatedAt?: number | null;
    disabled: boolean;
    lastSeenAt: number | null;
    entitlement: EntitlementSummary | null;
    bookingCount: number;
    paymentCount: number;
  },
): AdminUserRow {
  return {
    uid,
    displayName: profile?.displayName ?? extras.authName ?? null,
    email: profile?.email ?? extras.authEmail ?? null,
    photoURL: profile?.photoURL ?? null,
    role: profile?.role ?? null,
    verified: profile?.verified ?? false,
    onboarded: profile?.onboarded ?? false,
    createdAt: profile?.createdAt ?? extras.authCreatedAt ?? null,
    lastSeenAt: extras.lastSeenAt,
    disabled: extras.disabled,
    entitlement: extras.entitlement,
    bookingCount: extras.bookingCount,
    paymentCount: extras.paymentCount,
  };
}

export const USER_STATUSES = ["active", "disabled", "unverified", "not_onboarded"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatusFilter, string> = {
  active: "Can sign in",
  disabled: "Turned off",
  unverified: "Provider not yet approved",
  not_onboarded: "Not yet talked to TALK",
};

export function userMatchesStatus(
  row: Pick<AdminUserRow, "disabled" | "role" | "verified" | "onboarded">,
  status: UserStatusFilter,
): boolean {
  switch (status) {
    case "active":
      return !row.disabled;
    case "disabled":
      return row.disabled;
    case "unverified":
      return row.role === "provider" && !row.verified;
    case "not_onboarded":
      return row.role === "patient" && !row.onboarded;
  }
}

/**
 * Ways somebody might have typed a name that is stored as it was given:
 * Firestore's prefix match is case-sensitive, so "fatou" has to be tried as
 * "Fatou" too.
 */
export function nameSearchVariants(query: string): string[] {
  const typed = query.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!typed) return [];
  const lower = typed.toLowerCase();
  const first = lower.charAt(0).toUpperCase() + lower.slice(1);
  const words = lower.replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
  return [...new Set([typed, first, words, lower])];
}

/** "Fatou" from "Fatou Jallow" — all a sessions list needs of a patient. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first.slice(0, 40) : null;
}

/** Does this look like an account id rather than a name? */
export function looksLikeUid(query: string): boolean {
  return /^[A-Za-z0-9]{20,40}$/.test(query.trim());
}

// ------------------------------------------------------------------ sessions

/** The fields of bookings/{id} a staff page may be sent. Never the patient's note. */
export const BOOKING_FIELDS = [
  "patientId",
  "providerId",
  "startsAt",
  "endsAt",
  "status",
  "paymentStatus",
  "amountMinor",
  "currency",
  "disputed",
  "refundDue",
  "patientMinor",
  "payoutId",
  "cancelledBy",
  "createdAt",
  "updatedAt",
  "review",
] as const;

export const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const satisfies readonly BookingStatus[];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Waiting for payment",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not happen",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Not paid",
  processing: "Paying",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};

/** The sessions page's tabs. "all" is every session, newest first. */
export const BOOKING_VIEWS = ["upcoming", "today", "past", "cancelled", "disputed", "all"] as const;
export type BookingView = (typeof BOOKING_VIEWS)[number];
export type CountedBookingView = Exclude<BookingView, "all">;
export type BookingCounts = Record<CountedBookingView, number>;

export const BOOKING_VIEW_LABELS: Record<BookingView, string> = {
  upcoming: "Upcoming",
  today: "Today",
  past: "Past",
  cancelled: "Cancelled",
  disputed: "Disputed",
  all: "All",
};

/** A session as read: any field may be missing from an old document. */
type BookingTimes = { startsAt?: unknown; endsAt?: unknown; status?: unknown; disputed?: unknown };

/**
 * Which tab a session belongs in. Cancelled sessions have their own tab and
 * appear in no other; one in progress is "today" but neither upcoming nor
 * past.
 */
export function bookingInView(b: BookingTimes, view: BookingView, now: number): boolean {
  const startsAt = num(b.startsAt);
  const endsAt = num(b.endsAt) ?? startsAt;
  const cancelled = b.status === "cancelled";
  switch (view) {
    case "all":
      return true;
    case "cancelled":
      return cancelled;
    case "disputed":
      return b.disputed === true;
    case "upcoming":
      return !cancelled && startsAt !== null && startsAt >= now;
    case "past":
      return !cancelled && endsAt !== null && endsAt < now;
    case "today": {
      const day = banjulDay(now);
      return !cancelled && startsAt !== null && startsAt >= day.start && startsAt <= day.end;
    }
  }
}

/**
 * The stretch of time a tab reads, within the range asked for, and which way
 * round: what is coming soonest first, what has been most recent first. Null
 * when the two do not overlap, so there is nothing to read.
 */
export function bookingWindow(
  view: BookingView,
  range: DateRange,
  now: number,
): { range: DateRange; direction: "asc" | "desc" } | null {
  const clamp = (from: number | null, to: number | null, direction: "asc" | "desc") =>
    from !== null && to !== null && from > to ? null : { range: { from, to }, direction };
  const lower = (a: number | null, b: number) => (a === null ? b : Math.max(a, b));
  const upper = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));
  switch (view) {
    case "upcoming":
      return clamp(lower(range.from, now), range.to, "asc");
    case "today": {
      const day = banjulDay(now);
      return clamp(lower(range.from, day.start), upper(range.to, day.end), "asc");
    }
    case "past":
      return clamp(range.from, upper(range.to, now), "desc");
    default:
      return clamp(range.from, range.to, "desc");
  }
}

/** Every tab's count, from sessions read whole (one provider's, say). */
export function countBookingViews(rows: BookingTimes[], now: number): BookingCounts {
  const counts: BookingCounts = { upcoming: 0, today: 0, past: 0, cancelled: 0, disputed: 0 };
  for (const row of rows) {
    for (const view of Object.keys(counts) as CountedBookingView[]) {
      if (bookingInView(row, view, now)) counts[view] += 1;
    }
  }
  return counts;
}

/**
 * How far before today's start the window of "recent and future" sessions
 * reaches, so that every session not yet over is in it. Far longer than any
 * session.
 */
export const OPEN_SESSION_REACH_MS = 6 * 60 * 60 * 1000;

/**
 * Every tab's count across all sessions, without reading them all.
 *
 * Cancelled, disputed and "ended before now" are counted by Firestore. The
 * window — every session from shortly before today onwards — is read, which
 * gives upcoming and today directly. Past is then ended-before-now less the
 * cancelled ones among them, and those are the cancelled total less the
 * cancelled sessions in the window that are not over yet.
 */
export function deriveBookingCounts(input: {
  window: BookingTimes[];
  now: number;
  endedTotal: number;
  cancelledTotal: number;
  disputedTotal: number;
}): BookingCounts {
  const { window, now } = input;
  const inWindow = countBookingViews(window, now);
  const cancelledNotOver = window.filter((b) => b.status === "cancelled" && (num(b.endsAt) ?? 0) >= now).length;
  const cancelledEnded = Math.max(input.cancelledTotal - cancelledNotOver, 0);
  return {
    upcoming: inWindow.upcoming,
    today: inWindow.today,
    past: Math.max(input.endedTotal - cancelledEnded, 0),
    cancelled: input.cancelledTotal,
    disputed: input.disputedTotal,
  };
}

/** A decision recorded by resolveReview on a payment, payout or session. */
export type ReviewRecord = { decision: string; by: string | null; at: number | null; note: string };

export function reviewRecord(raw: unknown): ReviewRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const decision = str(r.decision);
  if (!decision) return null;
  return { decision, by: str(r.by), at: num(r.at), note: typeof r.note === "string" ? r.note.slice(0, 500) : "" };
}

export type PersonRef = { uid: string; name: string | null };

/** One session in the staff list. Times and money, never what was said. */
export type AdminBookingRow = {
  id: string;
  startsAt: number | null;
  endsAt: number | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amountMinor: number;
  currency: "GMD";
  disputed: boolean;
  /** Decided as not having happened; the patient is owed their fee back. */
  refundDue: boolean;
  /** The patient said they are under 18 (stamped by the server at booking). */
  patientMinor: boolean;
  payoutId: string | null;
  cancelledBy: "patient" | "provider" | "staff" | null;
  /** First name only. */
  patient: PersonRef;
  provider: PersonRef;
  createdAt: number | null;
  updatedAt: number | null;
  review: ReviewRecord | null;
};

const oneOfOr = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;

export function bookingRow(
  id: string,
  data: Record<string, unknown>,
  names: { patientFirstName: string | null; providerName: string | null },
): AdminBookingRow {
  const patientId = str(data.patientId) ?? "";
  const providerId = str(data.providerId) ?? "";
  const cancelledBy = str(data.cancelledBy);
  return {
    id,
    startsAt: num(data.startsAt),
    endsAt: num(data.endsAt),
    status: oneOfOr(data.status, BOOKING_STATUSES, "pending"),
    paymentStatus: oneOfOr(data.paymentStatus, ["unpaid", "processing", "paid", "refunded", "failed"] as const, "unpaid"),
    amountMinor: num(data.amountMinor) ?? 0,
    currency: "GMD",
    disputed: data.disputed === true,
    refundDue: data.refundDue === true,
    patientMinor: data.patientMinor === true,
    payoutId: str(data.payoutId),
    cancelledBy: !cancelledBy
      ? null
      : cancelledBy === patientId
        ? "patient"
        : cancelledBy === providerId
          ? "provider"
          : "staff",
    patient: { uid: patientId, name: names.patientFirstName },
    provider: { uid: providerId, name: names.providerName },
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    review: reviewRecord(data.review),
  };
}

// ------------------------------------------------------------------ payments

export const PAYMENT_PURPOSES = ["ai_initial", "ai_extended", "session_fee"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  ai_initial: AI_TIERS.initial.label,
  ai_extended: AI_TIERS.extended.label,
  session_fee: "Session with a provider",
};

/** The payments page's filter: the gateway's states, plus the two a person decides. */
export const PAYMENT_FILTERS = ["pending", "succeeded", "failed", "needs_review", "refunded"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export const PAYMENT_FILTER_LABELS: Record<PaymentFilter, string> = {
  pending: "Not finished",
  succeeded: "Paid",
  failed: "Failed",
  needs_review: "Held for review",
  refunded: "Refunded",
};

export type AdminPaymentRow = {
  id: string;
  purpose: string | null;
  amountMinor: number;
  currency: "GMD";
  status: "pending" | "succeeded" | "failed";
  /** What was paid for has been given. */
  fulfilled: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  refunded: boolean;
  paymentMethods: string[];
  /** The email the gateway was given — what matches an unclaimed payment to a person. */
  customerEmail: string | null;
  payer: PersonRef | null;
  bookingId: string | null;
  /** The last gateway event applied. */
  event: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  review: ReviewRecord | null;
};

export function paymentRow(id: string, data: Record<string, unknown>, payerName: string | null): AdminPaymentRow {
  const uid = str(data.uid);
  const review = reviewRecord(data.review);
  return {
    id,
    purpose: str(data.purpose),
    amountMinor: num(data.amountMinor) ?? 0,
    currency: "GMD",
    status: oneOfOr(data.status, ["pending", "succeeded", "failed"] as const, "pending"),
    fulfilled: data.fulfilled === true,
    needsReview: data.needsReview === true,
    reviewReason: str(data.reviewReason),
    refunded: review?.decision === "refunded",
    paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods.filter((m): m is string => typeof m === "string") : [],
    customerEmail: str(data.customerEmail),
    payer: uid ? { uid, name: payerName } : null,
    bookingId: str(data.bookingId),
    event: str(data.event),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
    review,
  };
}

export function paymentMatches(
  data: Record<string, unknown>,
  filter: { status?: PaymentFilter; purpose?: PaymentPurpose },
): boolean {
  if (filter.purpose && data.purpose !== filter.purpose) return false;
  switch (filter.status) {
    case undefined:
      return true;
    case "needs_review":
      return data.needsReview === true;
    case "refunded":
      return reviewRecord(data.review)?.decision === "refunded";
    default:
      return data.status === filter.status;
  }
}

export const PAYOUT_STATUSES = ["initiating", "pending", "uncertain", "completed", "failed", "reversed"] as const satisfies readonly PayoutStatus[];
export const PAYOUT_FILTERS = [...PAYOUT_STATUSES, "needs_review"] as const;
export type PayoutFilter = (typeof PAYOUT_FILTERS)[number];

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  initiating: "Sending",
  pending: "On its way",
  uncertain: "Not confirmed",
  completed: "Paid out",
  failed: "Did not go",
  reversed: "Came back",
};

/** One payout. The wallet number is masked — the full one never leaves the server. */
export type AdminPayoutRow = {
  id: string;
  provider: PersonRef;
  amountMinor: number;
  sessionCount: number;
  bookingIds: string[];
  network: string | null;
  accountHint: string | null;
  beneficiaryName: string | null;
  status: PayoutStatus;
  needsReview: boolean;
  reviewReason: string | null;
  failureReason: string | null;
  transferReference: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  review: ReviewRecord | null;
};

export function payoutRow(id: string, data: Record<string, unknown>, providerName: string | null): AdminPayoutRow {
  const bookingIds = Array.isArray(data.bookingIds) ? data.bookingIds.filter((b): b is string => typeof b === "string") : [];
  return {
    id,
    provider: { uid: str(data.providerId) ?? "", name: providerName },
    amountMinor: num(data.amountMinor) ?? 0,
    sessionCount: bookingIds.length,
    bookingIds,
    network: str(data.network),
    accountHint: str(data.accountHint),
    beneficiaryName: str(data.beneficiaryName),
    status: oneOfOr(data.status, PAYOUT_STATUSES, "pending"),
    needsReview: data.needsReview === true,
    reviewReason: str(data.reviewReason),
    failureReason: str(data.failureReason),
    transferReference: str(data.transferReference) ?? str(data.transferId),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
    review: reviewRecord(data.review),
  };
}

export function payoutMatches(data: Record<string, unknown>, status: PayoutFilter | undefined): boolean {
  if (!status) return true;
  return status === "needs_review" ? data.needsReview === true : data.status === status;
}

/** The money figures for a range. */
export type PaymentTotals = {
  /** Everything received: payments the gateway says went through. */
  collectedMinor: number;
  /** Of that, for sessions with providers. */
  sessionFeesMinor: number;
  /** Of that, for conversations with TALK. */
  consultationsMinor: number;
  /** Given back: payments refunded, and sessions decided as not having happened. */
  refundedMinor: number;
  /** Sent to providers and arrived. */
  paidOutMinor: number;
  /** TALK's share of the session fees collected — the same per-session rounding as a payout. */
  platformFeeMinor: number;
  payments: number;
  refunds: number;
  payouts: number;
};

export function summariseMoney(
  input: {
    payments: { status?: unknown; amountMinor?: unknown; purpose?: unknown }[];
    refunds: { amountMinor?: unknown }[];
    payouts: { status?: unknown; amountMinor?: unknown }[];
  },
  platformFee: (amountMinor: number) => number,
): PaymentTotals {
  const totals: PaymentTotals = {
    collectedMinor: 0,
    sessionFeesMinor: 0,
    consultationsMinor: 0,
    refundedMinor: 0,
    paidOutMinor: 0,
    platformFeeMinor: 0,
    payments: 0,
    refunds: 0,
    payouts: 0,
  };
  for (const p of input.payments) {
    const amount = num(p.amountMinor);
    if (p.status !== "succeeded" || amount === null || amount <= 0) continue;
    totals.collectedMinor += amount;
    totals.payments += 1;
    if (p.purpose === "session_fee") {
      totals.sessionFeesMinor += amount;
      totals.platformFeeMinor += platformFee(amount);
    } else if (p.purpose === "ai_initial" || p.purpose === "ai_extended") {
      totals.consultationsMinor += amount;
    }
  }
  for (const r of input.refunds) {
    const amount = num(r.amountMinor);
    if (amount === null || amount <= 0) continue;
    totals.refundedMinor += amount;
    totals.refunds += 1;
  }
  for (const p of input.payouts) {
    const amount = num(p.amountMinor);
    if (p.status !== "completed" || amount === null || amount <= 0) continue;
    totals.paidOutMinor += amount;
    totals.payouts += 1;
  }
  return totals;
}

// ------------------------------------------------------------------- support

/** "new" is how the contact form files a request; staff move it on from there. */
export const SUPPORT_STATUSES = ["new", "open", "in_progress", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_SETTABLE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportSettableStatus = (typeof SUPPORT_SETTABLE_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "New",
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

/** The inbox's filter: one status, or everything not yet resolved. */
export type SupportFilter = SupportStatus | "unresolved";

export const SUPPORT_TOPICS = Object.keys(SUPPORT_TOPIC_LABELS) as SupportTopic[];
export const SUPPORT_NOTE_MAX = 2000;

/** A note staff keep on a request. Never shown to the person who sent it. */
export type SupportNote = { id: string; by: string; byName: string | null; body: string; at: number };

export type AdminSupportRow = {
  id: string;
  name: string | null;
  email: string | null;
  topic: SupportTopic;
  message: string;
  /** Null when sent by somebody not signed in. */
  userId: string | null;
  status: SupportStatus;
  createdAt: number | null;
  updatedAt: number | null;
  assignee: PersonRef | null;
  notes: SupportNote[];
  resolvedAt: number | null;
  resolvedBy: string | null;
};

export function supportRow(id: string, data: Record<string, unknown>): AdminSupportRow {
  const assigneeId = str(data.assigneeId);
  const notes = Array.isArray(data.notes) ? data.notes : [];
  return {
    id,
    name: str(data.name),
    email: str(data.email),
    topic: oneOfOr(data.topic, SUPPORT_TOPICS, "general"),
    message: typeof data.message === "string" ? data.message : "",
    userId: str(data.userId),
    status: oneOfOr(data.status, SUPPORT_STATUSES, "new"),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt) ?? toMillis(data.createdAt),
    assignee: assigneeId ? { uid: assigneeId, name: str(data.assigneeName) } : null,
    notes: notes
      .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === "object")
      .map((n) => ({
        id: str(n.id) ?? "",
        by: str(n.by) ?? "",
        byName: str(n.byName),
        body: typeof n.body === "string" ? n.body : "",
        at: num(n.at) ?? 0,
      }))
      .sort((a, b) => a.at - b.at),
    resolvedAt: toMillis(data.resolvedAt),
    resolvedBy: str(data.resolvedBy),
  };
}

/**
 * Where a request goes on an update: where staff put it, or — when they only
 * gave it to somebody — out of "new", which means nobody has picked it up.
 * Null when it stays where it is.
 */
export function supportStatusAfter(
  current: SupportStatus,
  asked: SupportSettableStatus | undefined,
  givenTo: string | null | undefined,
): SupportStatus | null {
  const next = asked ?? (givenTo && current === "new" ? "open" : undefined);
  return next && next !== current ? next : null;
}

export function supportMatches(
  data: Record<string, unknown>,
  filter: { status?: SupportFilter; topic?: SupportTopic },
): boolean {
  if (filter.topic && data.topic !== filter.topic) return false;
  const status = oneOfOr(data.status, SUPPORT_STATUSES, "new");
  if (!filter.status) return true;
  return filter.status === "unresolved" ? status !== "resolved" : status === filter.status;
}

// ----------------------------------------------------------------- audit log

/** What the ops functions and scripts/grant-admin.mjs write as `action`. */
export const OPS_ACTIONS = {
  setRole: "user.set_role",
  disable: "user.disable",
  enable: "user.enable",
  adminClaim: "user.admin_claim",
  support: "support.update",
} as const;

/** The audit log in plain words. Anything not named here is shown as written. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [OPS_ACTIONS.setRole]: "Changed a role",
  [OPS_ACTIONS.disable]: "Turned off an account",
  [OPS_ACTIONS.enable]: "Turned an account back on",
  [OPS_ACTIONS.adminClaim]: "Updated staff access on a sign-in",
  [OPS_ACTIONS.support]: "Updated a support request",
  "provider_application.submit": "Sent a provider application",
  "provider_application.resubmit": "Sent a provider application back with changes",
  "provider_application.start_review": "Started reviewing an application",
  "provider_application.request_changes": "Asked for changes to an application",
  "provider_application.approve": "Approved a provider",
  "provider_application.reject": "Turned down an application",
  "provider_application.suspend": "Paused a provider",
  "provider_application.reinstate": "Put a provider back live",
  "site_content.publish": "Published a page of the site",
  "site_content.revert": "Put back an earlier version of a page",
  "site_media.register": "Added a picture to the media library",
  "site_media.update": "Changed a picture's details",
  "site_media.delete": "Removed a picture from the media library",
  "review.payment": "Decided on a held payment",
  "review.payout": "Dealt with a flagged payout",
  "review.session": "Decided on a disputed session",
  "account.deleted": "Cleared up after a deleted account",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

/** "script" is the actor for changes made from scripts/, not by a signed-in person. */
export const SCRIPT_ACTOR = "script";

/**
 * "system" is TALK itself, for what happens on its own: clearing up after a
 * deleted account (functions/src/accountDeletion.ts). Nobody to link to.
 */
export const SYSTEM_ACTOR = "system";

type MetaValue = string | number | boolean | null;

/**
 * An audit entry's details, made safe to show: plain values and short lists
 * only, every string cut short. Entries never carry clinical text (see
 * auditEntry in functions/src/staff.ts); this keeps a malformed one from
 * putting anything large or nested on a staff page.
 */
export function auditMetadata(raw: unknown): Record<string, MetaValue | MetaValue[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const plain = (v: unknown): MetaValue | undefined =>
    v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))
      ? (v as MetaValue)
      : typeof v === "string"
        ? v.slice(0, 300)
        : undefined;
  const out: Record<string, MetaValue | MetaValue[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (CLINICAL_KEYS.includes(key as (typeof CLINICAL_KEYS)[number])) continue;
    if (Array.isArray(value)) {
      const list = value.slice(0, 20).map(plain);
      if (list.every((v) => v !== undefined)) out[key] = list as MetaValue[];
      continue;
    }
    const v = plain(value);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** An action filter matches itself and everything under it: "user" finds "user.disable". */
export function actionMatches(action: unknown, filter: string | undefined): boolean {
  if (!filter) return true;
  if (typeof action !== "string") return false;
  return action === filter || action.startsWith(`${filter.replace(/\.$/, "")}.`);
}

/**
 * A target filter is a whole path and what lies under it — "users/abc" finds
 * that account, never "users/abcd" — or a collection: "supportRequests" or
 * "supportRequests/" finds every request.
 */
export function targetMatches(target: unknown, filter: string | undefined): boolean {
  if (!filter) return true;
  if (typeof target !== "string") return false;
  const base = filter.replace(/\/+$/, "");
  return target === base || target.startsWith(`${base}/`);
}

export type AdminAuditRow = {
  id: string;
  actorId: string;
  /** The actor's name now, or "Script", or "TALK" for SYSTEM_ACTOR. */
  actorName: string | null;
  action: string;
  actionLabel: string;
  targetPath: string;
  metadata: Record<string, MetaValue | MetaValue[]>;
  createdAt: number | null;
};

export function auditRow(id: string, data: Record<string, unknown>, actorName: string | null): AdminAuditRow {
  const actorId = str(data.actorId) ?? "";
  const action = str(data.action) ?? "";
  return {
    id,
    actorId,
    actorName: actorId === SCRIPT_ACTOR ? "Script" : actorId === SYSTEM_ACTOR ? "TALK" : actorName,
    action,
    actionLabel: auditActionLabel(action),
    targetPath: str(data.targetPath) ?? "",
    metadata: auditMetadata(data.metadata),
    createdAt: toMillis(data.createdAt),
  };
}

// ----------------------------------------------------------- one person, whole

export type AuthSummary = {
  createdAt: number | null;
  lastSignInAt: number | null;
  /** Last time their app refreshed its sign-in — the nearest thing to "last seen". */
  lastRefreshAt: number | null;
  signInMethods: string[];
  disabled: boolean;
  emailVerified: boolean;
  claims: KnownClaims;
};

export type AdminUserDetail = {
  uid: string;
  /** Null for a sign-in account that never made a TALK profile. */
  profile: SafeUserProfile | null;
  /** Null for a profile whose sign-in account has been deleted. */
  auth: AuthSummary | null;
  lastSeenAt: number | null;
  entitlement: EntitlementSummary | null;
  bookings: {
    total: number;
    upcoming: number;
    past: number;
    cancelled: number;
    disputed: number;
    /** The most recent first. */
    recent: AdminBookingRow[];
  };
  payments: { total: number; recent: AdminPaymentRow[] };
  support: AdminSupportRow[];
  /** Entries about this person, newest first. */
  audit: AdminAuditRow[];
  providerApplication: {
    status: ApplicationStatus;
    submittedAt: number | null;
    decidedAt: number | null;
    updatedAt: number | null;
  } | null;
};

// ------------------------------------------------------------ callable shapes

export type ListUsersInput = {
  /** A name or email prefix, an exact email, or an account id. */
  query?: string;
  role?: AppRole;
  status?: UserStatusFilter;
  cursor?: string | null;
  limit?: number;
};
export type GetUserInput = { uid: string };
export type SetRoleInput = { uid: string; role: SettableRole; reason?: string };
export type SetRoleResult = {
  role: AppRole;
  previousRole: AppRole | null;
  changed: boolean;
  /** Their provider listing was taken out of the directory with the change. */
  listingPaused: boolean;
};
export type SetDisabledInput = { uid: string; disabled: boolean; reason: string };
export type SetDisabledResult = { disabled: boolean; changed: boolean };
export type SyncAdminClaimResult = {
  admin: boolean;
  /** The claim on the account was changed by this call. */
  changed: boolean;
  /** The token the call was made with disagrees with the claim: get a fresh one. */
  refresh: boolean;
};

export type ListBookingsInput = {
  view?: BookingView;
  status?: BookingStatus;
  range?: DateRange;
  providerUid?: string;
  cursor?: string | null;
  limit?: number;
};
/** `counts` comes with the first page only, and ignores status and range. */
export type ListBookingsResult = Page<AdminBookingRow> & { counts: BookingCounts | null };

export type ListPaymentsInput = {
  status?: PaymentFilter;
  purpose?: PaymentPurpose;
  range?: DateRange;
  cursor?: string | null;
  limit?: number;
};
export type ListPayoutsInput = { status?: PayoutFilter; range?: DateRange; cursor?: string | null; limit?: number };
export type PaymentTotalsInput = { range?: DateRange };
export type PaymentTotalsResult = {
  range: DateRange;
  current: PaymentTotals;
  /** The same length of time just before, for the change shown on each figure. */
  previous: PaymentTotals | null;
  /** More payments than one call adds up: the figures are a floor. */
  truncated: boolean;
};

export type ListSupportInput = { status?: SupportFilter; topic?: SupportTopic; cursor?: string | null; limit?: number };
/** `counts` is per status, across every request. */
export type ListSupportResult = Page<AdminSupportRow> & { counts: Record<SupportStatus, number> };
export type UpdateSupportInput = {
  id: string;
  status?: SupportSettableStatus;
  /** Added to the request's internal notes. */
  note?: string;
  /** A staff member's uid, or null to unassign. Left out: unchanged. */
  assignee?: string | null;
};
export type UpdateSupportResult = { request: AdminSupportRow };

export type ListAuditInput = {
  /** A uid, or "script". */
  actor?: string;
  /** An action, or the start of one: "user" or "provider_application". */
  action?: string;
  /** The start of a target path: "users/<uid>", "supportRequests/". */
  target?: string;
  range?: DateRange;
  cursor?: string | null;
  limit?: number;
};
