/**
 * Staff operations: the day-to-day work on people, sessions, payments and
 * support that must run with admin rights (track: ops). Exported from
 * index.ts.
 *
 *   adminListUsers / adminGetUser        who is here, and one person whole
 *   adminSetRole / adminSetDisabled      the two changes made to an account
 *   syncAdminClaim                       the caller's own staff claim, made to match their role
 *   adminListBookings                    sessions, by tab
 *   adminListPayments / adminListPayouts / adminPaymentTotals
 *   adminListSupport / adminUpdateSupport
 *   adminListAudit
 *
 * Every one checks the caller is staff from users/{uid} (requireStaff), and
 * every change writes an audit entry. Decisions on held payments, payouts and
 * disputed sessions stay with resolveReview in index.ts.
 *
 * What staff are sent is built by app/lib/adminOps.ts from named fields only.
 * Where a document holds anything private — a person's intake, their goals, a
 * note to their provider — it is read with a field mask, so those fields
 * never even reach this function.
 *
 * The lists need no composite indexes. Each is read in order of one field (a
 * time), within the range asked for, and any other filter is applied as the
 * documents are read; a page that has read MAX_SCAN documents stops and hands
 * back a cursor, so "Load more" carries on from there. At TALK's size that is
 * a handful of reads; if a filtered list ever gets slow, an index for it is
 * the fix, and nothing here has to change shape.
 */

import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  FieldPath,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { db } from "./payments";
import { AUDIT_LOGS, CALLABLE, FieldValue, USERS, audit, auditEntry, requireStaff, setAdminClaim, signedIn } from "./staff";
import { normaliseRole } from "../../app/lib/models";
import { platformFeeMinor } from "../../app/lib/money";
import type { ApplicationStatus, HistoryEvent } from "../../app/lib/providerApplication";
import {
  APP_ROLES,
  BOOKING_FIELDS,
  BOOKING_STATUSES,
  BOOKING_VIEWS,
  OPEN_SESSION_REACH_MS,
  OPS_ACTIONS,
  PAYMENT_FILTERS,
  PAYMENT_PURPOSES,
  PAYOUT_FILTERS,
  SAFE_USER_FIELDS,
  SUPPORT_NOTE_MAX,
  SUPPORT_SETTABLE_STATUSES,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  USER_STATUSES,
  actionMatches,
  auditRow,
  banjulDay,
  bookingInView,
  bookingRow,
  bookingWindow,
  countBookingViews,
  decodeCursor,
  deriveBookingCounts,
  encodeCursor,
  entitlementSummary,
  firstName,
  inRange,
  isSettableRole,
  knownClaims,
  latest,
  looksLikeUid,
  nameSearchVariants,
  pageAfter,
  pageLimit,
  parseRange,
  paymentMatches,
  paymentRow,
  payoutMatches,
  payoutRow,
  previousRange,
  reviewRecord,
  safeUser,
  signInMethodLabel,
  summariseMoney,
  supportMatches,
  supportRow,
  supportStatusAfter,
  targetMatches,
  toMillis,
  userMatchesStatus,
  userRow,
  verifiedForRole,
  wouldLeaveNoAdmin,
  type AdminAuditRow,
  type AdminBookingRow,
  type AdminUserDetail,
  type AdminUserRow,
  type BookingCounts,
  type CursorPosition,
  type DateRange,
  type ListBookingsResult,
  type Page,
  type PaymentTotalsResult,
  type SafeUserProfile,
  type SetDisabledResult,
  type SetRoleResult,
  type SupportFilter,
  type SyncAdminClaimResult,
  type UpdateSupportResult,
  type ListSupportResult,
  type AdminPaymentRow,
  type AdminPayoutRow,
  type AdminSupportRow,
} from "../../app/lib/adminOps";

const BOOKINGS = "bookings";
const PAYMENTS = "payments";
const PAYOUTS = "payouts";
const SUPPORT = "supportRequests";
const ENTITLEMENTS = "entitlements";
const PRESENCE = "presence";
const APPLICATIONS = "providerApplications";
const PROFILES = "providerProfiles";

/** Documents one page may read before it stops and hands back a cursor. */
const MAX_SCAN = 600;
/** The small sets read whole by one equality: disputes, payments held for review. */
const EQUALITY_MAX = 500;
/** One person's sessions or payments, for their page and their counts. */
const PERSON_MAX = 1000;
/** Sessions from shortly before today onwards, for the tab counts. */
const WINDOW_MAX = 2000;
/** Payments one call adds up for the money figures. */
const TOTALS_MAX = 10_000;

// ------------------------------------------------------------------- input

function idFrom(raw: unknown, what: string): string {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || id.length > 128 || id.includes("/")) throw new HttpsError("invalid-argument", `Which ${what}?`);
  return id;
}

function optionalId(raw: unknown, what: string): string | undefined {
  return raw == null || raw === "" ? undefined : idFrom(raw, what);
}

function optionalOneOf<T extends string>(raw: unknown, options: readonly T[], what: string): T | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "string" && (options as readonly string[]).includes(raw)) return raw as T;
  throw new HttpsError("invalid-argument", `Unknown ${what}.`);
}

function optionalText(raw: unknown, max: number): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "Filters are text.");
  return raw.trim().slice(0, max) || undefined;
}

function cursorFrom(raw: unknown): CursorPosition | null {
  if (raw == null || raw === "") return null;
  const cursor = decodeCursor(raw);
  if (!cursor) throw new HttpsError("invalid-argument", "That list has moved on. Start again from the top.");
  return cursor;
}

function rangeFrom(raw: unknown): DateRange {
  const range = parseRange(raw);
  if (!range) throw new HttpsError("invalid-argument", "That date range is not one we can use.");
  return range;
}

function authCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

// -------------------------------------------------------------------- reading

/**
 * Only what falls inside `range`. For the collections the functions write,
 * whose times are numbers; a range is never applied to users or support
 * requests, which carry Firestore timestamps.
 */
function within(query: Query, field: string, range: DateRange): Query {
  let q = query;
  if (range.from !== null) q = q.where(field, ">=", range.from);
  if (range.to !== null) q = q.where(field, "<=", range.to);
  return q;
}

function positionOf(doc: DocumentSnapshot, field: string): CursorPosition | null {
  const value = doc.get(field);
  if (typeof value === "number" && Number.isFinite(value)) return { kind: "number", value, id: doc.id };
  if (value instanceof Timestamp) return { kind: "timestamp", seconds: value.seconds, nanos: value.nanoseconds, id: doc.id };
  return null;
}

/** A document whose field is missing sorts first, as a number would. */
const positionOrStart = (field: string) => (doc: DocumentSnapshot) =>
  positionOf(doc, field) ?? ({ kind: "number", value: 0, id: doc.id } as const);

const cursorValue = (p: CursorPosition) => (p.kind === "number" ? p.value : new Timestamp(p.seconds, p.nanos));

/**
 * One page of a list read in `field` order, keeping the documents `keep`
 * accepts. Reads in batches until the page is full, the list ends, or
 * MAX_SCAN documents have been read — then the cursor says where the next
 * call carries on, even if this page came back short.
 */
async function scanPage(input: {
  base: Query;
  field: string;
  direction?: "asc" | "desc";
  cursor: CursorPosition | null;
  limit: number;
  keep?: (docs: QueryDocumentSnapshot[]) => boolean[] | Promise<boolean[]>;
}): Promise<{ docs: QueryDocumentSnapshot[]; nextCursor: string | null }> {
  const { base, field, direction = "desc", limit, keep } = input;
  // Unfiltered, one more than the page: whether that extra document exists
  // is what says there is a next page, so "Load more" never opens onto nothing.
  const batchSize = keep ? Math.min(Math.max(limit * 2, 50), 200) : limit + 1;
  const kept: QueryDocumentSnapshot[] = [];
  let after = input.cursor;
  let scanned = 0;
  for (;;) {
    let query = base.orderBy(field, direction).orderBy(FieldPath.documentId(), direction);
    if (after) query = query.startAfter(cursorValue(after), after.id);
    const snap = await query.limit(batchSize).get();
    const verdicts = keep ? await keep(snap.docs) : snap.docs.map(() => true);
    for (let i = 0; i < snap.docs.length; i += 1) {
      if (verdicts[i]) kept.push(snap.docs[i]);
      if (kept.length === limit) {
        // Full. The next page starts straight after this document; the rest
        // of this batch is read again then.
        const more = i < snap.docs.length - 1 || snap.docs.length === batchSize;
        const position = positionOf(snap.docs[i], field);
        return { docs: kept, nextCursor: more && position ? encodeCursor(position) : null };
      }
    }
    scanned += snap.docs.length;
    if (snap.docs.length < batchSize) return { docs: kept, nextCursor: null };
    after = positionOf(snap.docs[snap.docs.length - 1], field);
    if (!after) return { docs: kept, nextCursor: null };
    if (scanned >= MAX_SCAN) return { docs: kept, nextCursor: encodeCursor(after) };
  }
}

/** Display names for a set of people. Providers go by their listing's name, which is what patients see. */
async function namesFor(uids: Iterable<unknown>, { listings = false } = {}): Promise<Map<string, string | null>> {
  const ids = [...new Set([...uids].filter((u): u is string => typeof u === "string" && u.length > 0))];
  const names = new Map<string, string | null>();
  if (!ids.length) return names;
  const read = (collection: string) =>
    db().getAll(...ids.map((id) => db().collection(collection).doc(id)), { fieldMask: ["displayName"] });
  const [users, profiles] = await Promise.all([read(USERS), listings ? read(PROFILES) : Promise.resolve([])]);
  const nameOf = (snap: DocumentSnapshot) => {
    const name = snap.get("displayName");
    return typeof name === "string" && name.trim() ? name : null;
  };
  for (const snap of users) names.set(snap.id, nameOf(snap));
  for (const snap of profiles) if (nameOf(snap)) names.set(snap.id, nameOf(snap));
  return names;
}

async function bookingRows(docs: DocumentSnapshot[]): Promise<AdminBookingRow[]> {
  const [patients, providers] = await Promise.all([
    namesFor(docs.map((d) => d.get("patientId"))),
    namesFor(docs.map((d) => d.get("providerId")), { listings: true }),
  ]);
  return docs.map((d) => {
    const data = d.data() ?? {};
    return bookingRow(d.id, data, {
      patientFirstName: firstName(patients.get(String(data.patientId)) ?? null),
      providerName: providers.get(String(data.providerId)) ?? null,
    });
  });
}

// -------------------------------------------------------------------- people

/** Sign-in accounts, fetched a hundred at a time and remembered for the call. */
type AuthCache = Map<string, UserRecord | null>;

async function authRecords(uids: string[], cache: AuthCache): Promise<void> {
  const missing = [...new Set(uids)].filter((uid) => !cache.has(uid));
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const { users } = await getAuth().getUsers(chunk.map((uid) => ({ uid })));
    const found = new Map(users.map((u) => [u.uid, u]));
    for (const uid of chunk) cache.set(uid, found.get(uid) ?? null);
  }
}

function lastSeenOf(presence: DocumentSnapshot | undefined, record: UserRecord | null | undefined): number | null {
  return latest(
    toMillis(presence?.get("lastSeenAt")),
    toMillis(record?.metadata.lastRefreshTime ?? null),
    toMillis(record?.metadata.lastSignInTime ?? null),
  );
}

async function userRows(
  entries: { uid: string; profile: SafeUserProfile | null }[],
  cache: AuthCache,
  now: number,
): Promise<AdminUserRow[]> {
  if (!entries.length) return [];
  const uids = entries.map((e) => e.uid);
  await authRecords(uids, cache);
  const [presence, entitlements, counts] = await Promise.all([
    db().getAll(...uids.map((uid) => db().collection(PRESENCE).doc(uid)), { fieldMask: ["lastSeenAt"] }),
    db().getAll(...uids.map((uid) => db().collection(ENTITLEMENTS).doc(uid))),
    Promise.all(
      uids.map((uid) =>
        Promise.all([
          db().collection(BOOKINGS).where("participants", "array-contains", uid).count().get(),
          db().collection(PAYMENTS).where("uid", "==", uid).count().get(),
        ]),
      ),
    ),
  ]);
  return entries.map(({ uid, profile }, i) => {
    const record = cache.get(uid) ?? null;
    return userRow(uid, profile, {
      authEmail: record?.email ?? null,
      authName: record?.displayName ?? null,
      authCreatedAt: toMillis(record?.metadata.creationTime ?? null),
      disabled: record?.disabled === true,
      lastSeenAt: lastSeenOf(presence[i], record),
      entitlement: entitlementSummary(entitlements[i].data(), now),
      bookingCount: counts[i][0].data().count,
      paymentCount: counts[i][1].data().count,
    });
  });
}

/**
 * Who a search names: an account id pasted in, a sign-in found by its exact
 * email (even one that never made a TALK profile), and profiles whose email
 * or name starts with what was typed.
 */
async function searchUsers(
  query: string,
  limit: number,
  cache: AuthCache,
): Promise<{ uid: string; profile: SafeUserProfile | null }[]> {
  const users = db().collection(USERS);
  const order: string[] = [];
  const profiles = new Map<string, SafeUserProfile | null>();
  const add = (uid: string, profile: SafeUserProfile | null) => {
    if (!profiles.has(uid)) order.push(uid);
    if (profile || !profiles.has(uid)) profiles.set(uid, profile);
  };

  if (looksLikeUid(query)) add(query.trim(), null);
  if (query.includes("@")) {
    try {
      const record = await getAuth().getUserByEmail(query.toLowerCase());
      cache.set(record.uid, record);
      add(record.uid, null);
    } catch (error) {
      if (authCode(error) !== "auth/user-not-found" && authCode(error) !== "auth/invalid-email") throw error;
    }
  }

  // U+F8FF sorts after every character a name or email holds, so this is
  // "everything that starts with value".
  const prefix = (field: string, value: string) =>
    users.where(field, ">=", value).where(field, "<=", `${value}\uf8ff`).select(...SAFE_USER_FIELDS).limit(limit).get();
  const lookups = [
    prefix("email", query.toLowerCase()),
    ...(query.includes("@") ? [] : nameSearchVariants(query).map((v) => prefix("displayName", v))),
  ];
  for (const snap of await Promise.all(lookups)) {
    for (const doc of snap.docs) add(doc.id, safeUser(doc.id, doc.data()));
  }

  const unread = order.filter((uid) => !profiles.get(uid));
  if (unread.length) {
    const snaps = await db().getAll(...unread.map((uid) => users.doc(uid)), { fieldMask: [...SAFE_USER_FIELDS] });
    for (const snap of snaps) if (snap.exists) profiles.set(snap.id, safeUser(snap.id, snap.data() ?? {}));
    await authRecords(unread, cache);
  }
  // An id that matched neither a profile nor a sign-in names nobody.
  return order
    .filter((uid) => profiles.get(uid) || cache.get(uid))
    .map((uid) => ({ uid, profile: profiles.get(uid) ?? null }));
}

export const adminListUsers = onCall(CALLABLE, async (request): Promise<Page<AdminUserRow>> => {
  await requireStaff(request);
  const query = optionalText(request.data?.query, 120);
  const role = optionalOneOf(request.data?.role, APP_ROLES, "role");
  const status = optionalOneOf(request.data?.status, USER_STATUSES, "status");
  const limit = pageLimit(request.data?.limit);
  const now = Date.now();
  const cache: AuthCache = new Map();

  const matches = (uid: string, profile: SafeUserProfile | null) => {
    if (role && profile?.role !== role) return false;
    if (!status) return true;
    return userMatchesStatus(
      {
        disabled: cache.get(uid)?.disabled === true,
        role: profile?.role ?? null,
        verified: profile?.verified ?? false,
        onboarded: profile?.onboarded ?? false,
      },
      status,
    );
  };

  // A search returns its best matches, one page of them.
  if (query) {
    const found = await searchUsers(query, limit, cache);
    await authRecords(found.map((f) => f.uid), cache);
    const kept = found.filter((f) => matches(f.uid, f.profile)).slice(0, limit);
    return { items: await userRows(kept, cache, now), nextCursor: null };
  }

  const { docs, nextCursor } = await scanPage({
    base: db().collection(USERS).select(...SAFE_USER_FIELDS),
    field: "createdAt",
    cursor: cursorFrom(request.data?.cursor),
    limit,
    keep:
      role || status
        ? async (batch) => {
            // Turned off lives in Auth, not the profile.
            if (status) await authRecords(batch.map((d) => d.id), cache);
            return batch.map((d) => matches(d.id, safeUser(d.id, d.data())));
          }
        : undefined,
  });
  const entries = docs.map((d) => ({ uid: d.id, profile: safeUser(d.id, d.data()) }));
  return { items: await userRows(entries, cache, now), nextCursor };
});

/** Where audit entries about one person point. */
const aboutPaths = (uid: string) => [
  `${USERS}/${uid}`,
  `${APPLICATIONS}/${uid}`,
  `${ENTITLEMENTS}/${uid}`,
  `payoutAccounts/${uid}`,
];

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
];

export const adminGetUser = onCall(CALLABLE, async (request): Promise<AdminUserDetail> => {
  await requireStaff(request);
  const uid = idFrom(request.data?.uid, "person");
  const now = Date.now();

  const [[userSnap], record, [presence], entitlement, [application]] = await Promise.all([
    db().getAll(db().collection(USERS).doc(uid), { fieldMask: [...SAFE_USER_FIELDS] }),
    getAuth()
      .getUser(uid)
      .catch((error: unknown) => {
        // An id Auth could never have issued names no sign-in, as much as a deleted one.
        if (authCode(error) === "auth/user-not-found" || authCode(error) === "auth/invalid-uid") return null;
        throw error;
      }),
    db().getAll(db().collection(PRESENCE).doc(uid), { fieldMask: ["lastSeenAt"] }),
    db().collection(ENTITLEMENTS).doc(uid).get(),
    db().getAll(db().collection(APPLICATIONS).doc(uid), { fieldMask: ["status", "submittedAt", "decidedAt", "updatedAt"] }),
  ]);
  if (!userSnap.exists && !record) throw new HttpsError("not-found", "No account with that id.");
  const profile = userSnap.exists ? safeUser(uid, userSnap.data() ?? {}) : null;
  // The profile's address and the sign-in's, which can differ — and, from a
  // form typed by hand, as typed as well as in lower case.
  const emails = [
    ...new Set(
      [profile?.email, record?.email].flatMap((e) => (e ? [e, e.toLowerCase()] : [])),
    ),
  ];

  const theirBookings = db().collection(BOOKINGS).where("participants", "array-contains", uid);
  const theirPayments = db().collection(PAYMENTS).where("uid", "==", uid);
  const [bookingSnap, bookingTotal, paymentSnap, paymentTotal, supportById, supportByEmail, auditSnap] =
    await Promise.all([
      theirBookings.orderBy("startsAt", "desc").select(...BOOKING_FIELDS).limit(PERSON_MAX).get(),
      theirBookings.count().get(),
      theirPayments.limit(PERSON_MAX).get(),
      theirPayments.count().get(),
      db().collection(SUPPORT).where("userId", "==", uid).limit(20).get(),
      // Sent before they had an account, or while signed out.
      emails.length ? db().collection(SUPPORT).where("email", "in", emails).limit(20).get() : null,
      db().collection(AUDIT_LOGS).where("targetPath", "in", aboutPaths(uid)).limit(100).get(),
    ]);

  const sessions = countBookingViews(bookingSnap.docs.map((d) => d.data()), now);
  const recentBookings = await bookingRows(bookingSnap.docs.slice(0, 20));

  const payments = paymentSnap.docs
    .map((d) => paymentRow(d.id, d.data(), profile?.displayName ?? record?.displayName ?? null))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const support = new Map<string, AdminSupportRow>();
  for (const doc of [...supportById.docs, ...(supportByEmail?.docs ?? [])]) support.set(doc.id, supportRow(doc.id, doc.data()));

  const auditDocs = auditSnap.docs
    .sort((a, b) => (toMillis(b.get("createdAt")) ?? 0) - (toMillis(a.get("createdAt")) ?? 0))
    .slice(0, 50);

  const applicationStatus = application.exists ? application.get("status") : null;

  return {
    uid,
    profile,
    auth: record
      ? {
          createdAt: toMillis(record.metadata.creationTime),
          lastSignInAt: toMillis(record.metadata.lastSignInTime ?? null),
          lastRefreshAt: toMillis(record.metadata.lastRefreshTime ?? null),
          signInMethods: record.providerData.map((p) => signInMethodLabel(p.providerId)),
          disabled: record.disabled,
          emailVerified: record.emailVerified,
          claims: knownClaims(record.customClaims),
        }
      : null,
    lastSeenAt: lastSeenOf(presence, record),
    entitlement: entitlementSummary(entitlement.data(), now),
    bookings: {
      total: bookingTotal.data().count,
      upcoming: sessions.upcoming,
      past: sessions.past,
      cancelled: sessions.cancelled,
      disputed: sessions.disputed,
      recent: recentBookings,
    },
    payments: { total: paymentTotal.data().count, recent: payments.slice(0, 20) },
    support: [...support.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    audit: await auditRows(auditDocs),
    providerApplication:
      typeof applicationStatus === "string" && (APPLICATION_STATUSES as string[]).includes(applicationStatus)
        ? {
            status: applicationStatus as ApplicationStatus,
            submittedAt: toMillis(application.get("submittedAt")),
            decidedAt: toMillis(application.get("decidedAt")),
            updatedAt: toMillis(application.get("updatedAt")),
          }
        : null,
  };
});

/**
 * Make the `admin` claim match the role. A missing sign-in account has no
 * token to carry a claim, which is fine; anything else is surfaced, because
 * a claim left on a demoted account keeps their staff access to Storage.
 */
async function claimToMatch(uid: string, admin: boolean): Promise<boolean> {
  try {
    return await setAdminClaim(uid, admin);
  } catch (error) {
    if (authCode(error) === "auth/user-not-found") return false;
    console.error(`adminOps: could not ${admin ? "set" : "clear"} the admin claim for ${uid}`, error);
    throw new HttpsError(
      "unavailable",
      admin
        ? "The role changed, but their sign-in has not caught up yet. Try again — it is safe to repeat."
        : "The role changed, but their staff access is still on their sign-in. Try again — it is safe to repeat.",
    );
  }
}

/** What the applicant's status page says when their account stops being a provider's. */
const PAUSED_WITH_ROLE =
  "Your account is no longer set up as a provider, so your profile has been taken out of the directory. Contact us if this is a mistake.";

export const adminSetRole = onCall(CALLABLE, async (request): Promise<SetRoleResult> => {
  const staffUid = await requireStaff(request);
  const uid = idFrom(request.data?.uid, "person");
  const role = request.data?.role;
  if (!isSettableRole(role)) throw new HttpsError("invalid-argument", "Choose patient, provider or staff.");
  const reason = String(request.data?.reason ?? "").trim().slice(0, 500);
  if (uid === staffUid) {
    throw new HttpsError("failed-precondition", "You cannot change your own role. Ask another member of staff.");
  }

  const userRef = db().collection(USERS).doc(uid);
  const listingRef = db().collection(PROFILES).doc(uid);
  const applicationRef = db().collection(APPLICATIONS).doc(uid);
  const now = Date.now();

  const outcome = await db().runTransaction(async (tx) => {
    const [caller, target, admins, [listing, application]] = await Promise.all([
      tx.get(db().collection(USERS).doc(staffUid)),
      tx.get(userRef),
      tx.get(db().collection(USERS).where("role", "==", "admin").select()),
      tx.getAll(listingRef, applicationRef, { fieldMask: ["status"] }),
    ]);
    // Again inside the transaction: two staff demoting each other at the
    // same moment must not both win and leave nobody.
    if (caller.get("role") !== "admin") throw new HttpsError("permission-denied", "Staff only.");
    if (!target.exists) throw new HttpsError("not-found", "That account has no TALK profile yet.");

    const from = normaliseRole(target.get("role"));
    const stored = target.get("previousRole");
    if (from === role) {
      return { changed: false, from, previousRole: typeof stored === "string" ? normaliseRole(stored) : null, listingPaused: false };
    }
    if (wouldLeaveNoAdmin(admins.docs.map((d) => d.id), uid, role)) {
      throw new HttpsError("failed-precondition", "TALK needs at least one member of staff.");
    }

    const listingLive = listing.exists && listing.get("status") === "verified";
    // Somebody who is no longer a provider must not stay bookable. Their
    // listing and their application are paused together — exactly what
    // suspending them on the providers page does — so bringing them back is
    // that page's "Reinstate", not a guess made here.
    const pause = from === "provider" && role !== "provider" && listingLive;

    tx.update(userRef, {
      role,
      previousRole: from,
      roleChangedAt: now,
      roleChangedBy: staffUid,
      verified: verifiedForRole(role, listingLive),
      updatedAt: now,
    });
    if (pause) {
      tx.update(listingRef, { status: "suspended", updatedAt: now });
      if (application.exists && application.get("status") === "approved") {
        const event: HistoryEvent = { at: now, type: "suspended", by: staffUid, message: PAUSED_WITH_ROLE };
        tx.update(applicationRef, {
          status: "suspended" satisfies ApplicationStatus,
          decidedAt: now,
          decidedBy: staffUid,
          message: PAUSED_WITH_ROLE,
          updatedAt: now,
          history: FieldValue.arrayUnion(event),
        });
      }
    }
    tx.set(
      db().collection(AUDIT_LOGS).doc(),
      auditEntry(staffUid, OPS_ACTIONS.setRole, `${USERS}/${uid}`, {
        from,
        to: role,
        ...(reason ? { reason } : {}),
        ...(pause ? { listingPaused: true } : {}),
      }),
    );
    return { changed: true, from, previousRole: from, listingPaused: pause };
  });

  // Every time, including when the role was already right — so repeating a
  // call whose claim step failed is how it is repaired.
  await claimToMatch(uid, role === "admin");

  return {
    role: outcome.changed ? role : outcome.from,
    previousRole: outcome.previousRole,
    changed: outcome.changed,
    listingPaused: outcome.listingPaused,
  };
});

export const adminSetDisabled = onCall(CALLABLE, async (request): Promise<SetDisabledResult> => {
  const staffUid = await requireStaff(request);
  const uid = idFrom(request.data?.uid, "person");
  const disabled = request.data?.disabled;
  if (typeof disabled !== "boolean") throw new HttpsError("invalid-argument", "Turn the account off or on?");
  const reason = String(request.data?.reason ?? "").trim().slice(0, 500);
  if (uid === staffUid) throw new HttpsError("failed-precondition", "You cannot turn off your own account.");
  if (disabled && reason.length < 5) {
    throw new HttpsError("invalid-argument", "Say why, in a few words. It is kept in the audit log.");
  }

  const record = await getAuth()
    .getUser(uid)
    .catch((error: unknown) => {
      if (authCode(error) === "auth/user-not-found" || authCode(error) === "auth/invalid-uid") {
        throw new HttpsError("not-found", "No sign-in account with that id.");
      }
      throw error;
    });
  if (record.disabled === disabled) return { disabled, changed: false };

  await getAuth().updateUser(uid, { disabled });
  // A refresh token outlives the switch otherwise: revoking it signs them
  // out everywhere as soon as their current token runs out.
  if (disabled) await getAuth().revokeRefreshTokens(uid);
  await audit(staffUid, disabled ? OPS_ACTIONS.disable : OPS_ACTIONS.enable, `${USERS}/${uid}`, reason ? { reason } : {});
  return { disabled, changed: true };
});

/**
 * The caller's own `admin` claim, made to match their role. Any signed-in
 * person may ask: it can only ever make the claim agree with users/{uid},
 * which they cannot write. The staff pages call it once a session when the
 * token lacks the claim, and refresh the token when told to — Storage rules
 * (provider documents, site media) read the claim, not the document.
 */
export const syncAdminClaim = onCall(CALLABLE, async (request): Promise<SyncAdminClaimResult> => {
  const uid = signedIn(request);
  const admin = (await db().collection(USERS).doc(uid).get()).get("role") === "admin";
  const changed = await setAdminClaim(uid, admin);
  if (changed) await audit(uid, OPS_ACTIONS.adminClaim, `${USERS}/${uid}`, { admin });
  // The token this call came with may predate the claim even when nothing
  // changed now — grant-admin, or another member of staff, set it while they
  // were signed in. Whether it agrees is what decides a refresh.
  const tokenSaysAdmin = request.auth?.token.admin === true;
  return { admin, changed, refresh: tokenSaysAdmin !== admin };
});

// ------------------------------------------------------------------ sessions

async function bookingCounts(providerUid: string | undefined, now: number): Promise<BookingCounts> {
  const bookings = db().collection(BOOKINGS);
  const fields = ["providerId", "startsAt", "endsAt", "status", "disputed"];
  if (providerUid) {
    // One provider's whole history is small enough to count as it is read.
    const snap = await bookings.where("participants", "array-contains", providerUid).select(...fields).limit(PERSON_MAX).get();
    return countBookingViews(snap.docs.map((d) => d.data()).filter((d) => d.providerId === providerUid), now);
  }
  const [window, ended, cancelled, disputed] = await Promise.all([
    bookings.where("startsAt", ">=", banjulDay(now).start - OPEN_SESSION_REACH_MS).select(...fields).limit(WINDOW_MAX).get(),
    bookings.where("endsAt", "<", now).count().get(),
    bookings.where("status", "==", "cancelled").count().get(),
    bookings.where("disputed", "==", true).count().get(),
  ]);
  return deriveBookingCounts({
    window: window.docs.map((d) => d.data()),
    now,
    endedTotal: ended.data().count,
    cancelledTotal: cancelled.data().count,
    disputedTotal: disputed.data().count,
  });
}

export const adminListBookings = onCall(CALLABLE, async (request): Promise<ListBookingsResult> => {
  await requireStaff(request);
  const view = optionalOneOf(request.data?.view, BOOKING_VIEWS, "tab") ?? "all";
  const status = optionalOneOf(request.data?.status, BOOKING_STATUSES, "status");
  const range = rangeFrom(request.data?.range);
  const providerUid = optionalId(request.data?.providerUid, "provider");
  const cursor = cursorFrom(request.data?.cursor);
  const limit = pageLimit(request.data?.limit);
  const now = Date.now();

  const belongs = (d: DocumentData) =>
    (!providerUid || d.providerId === providerUid) &&
    (!status || d.status === status) &&
    inRange(typeof d.startsAt === "number" ? d.startsAt : null, range) &&
    bookingInView(d, view, now);

  let docs: DocumentSnapshot[] = [];
  let nextCursor: string | null = null;
  if (view === "disputed") {
    // Few, and a decision takes one out of the set: read whole, paged here.
    const snap = await db().collection(BOOKINGS).where("disputed", "==", true).select(...BOOKING_FIELDS).limit(EQUALITY_MAX).get();
    const page = pageAfter(snap.docs.filter((d) => belongs(d.data())), positionOrStart("startsAt"), "desc", cursor, limit);
    docs = page.items;
    nextCursor = page.next ? encodeCursor(page.next) : null;
  } else {
    const window = bookingWindow(view, range, now);
    if (window) {
      // A provider's sessions newest first come straight off the index the
      // apps already use; a forward-looking tab is a short stretch of time,
      // read in order and filtered.
      const byProvider = Boolean(providerUid) && window.direction === "desc";
      const base = byProvider
        ? db().collection(BOOKINGS).where("participants", "array-contains", providerUid)
        : db().collection(BOOKINGS);
      const page = await scanPage({
        base: within(base.select(...BOOKING_FIELDS), "startsAt", window.range),
        field: "startsAt",
        direction: window.direction,
        cursor,
        limit,
        keep: view === "all" && !status && !providerUid ? undefined : (batch) => batch.map((d) => belongs(d.data())),
      });
      docs = page.docs;
      nextCursor = page.nextCursor;
    }
  }

  const [items, counts] = await Promise.all([bookingRows(docs), cursor ? null : bookingCounts(providerUid, now)]);
  return { items, nextCursor, counts };
});

// ------------------------------------------------------------------ payments

export const adminListPayments = onCall(CALLABLE, async (request): Promise<Page<AdminPaymentRow>> => {
  await requireStaff(request);
  const status = optionalOneOf(request.data?.status, PAYMENT_FILTERS, "status");
  const purpose = optionalOneOf(request.data?.purpose, PAYMENT_PURPOSES, "purpose");
  const range = rangeFrom(request.data?.range);
  const cursor = cursorFrom(request.data?.cursor);
  const limit = pageLimit(request.data?.limit);
  const keep = (d: DocumentData) =>
    paymentMatches(d, { status, purpose }) && inRange(typeof d.createdAt === "number" ? d.createdAt : null, range);

  let docs: DocumentSnapshot[];
  let nextCursor: string | null;
  if (status === "needs_review") {
    // The review queue: small, and resolving one takes it out.
    const snap = await db().collection(PAYMENTS).where("needsReview", "==", true).limit(EQUALITY_MAX).get();
    const page = pageAfter(snap.docs.filter((d) => keep(d.data())), positionOrStart("createdAt"), "desc", cursor, limit);
    docs = page.items;
    nextCursor = page.next ? encodeCursor(page.next) : null;
  } else {
    const page = await scanPage({
      base: within(db().collection(PAYMENTS), "createdAt", range),
      field: "createdAt",
      cursor,
      limit,
      keep: status || purpose ? (batch) => batch.map((d) => keep(d.data())) : undefined,
    });
    docs = page.docs;
    nextCursor = page.nextCursor;
  }

  const names = await namesFor(docs.map((d) => d.get("uid")));
  return {
    items: docs.map((d) => paymentRow(d.id, d.data() ?? {}, names.get(String(d.get("uid"))) ?? null)),
    nextCursor,
  };
});

export const adminListPayouts = onCall(CALLABLE, async (request): Promise<Page<AdminPayoutRow>> => {
  await requireStaff(request);
  const status = optionalOneOf(request.data?.status, PAYOUT_FILTERS, "status");
  const range = rangeFrom(request.data?.range);
  const cursor = cursorFrom(request.data?.cursor);
  const limit = pageLimit(request.data?.limit);
  const keep = (d: DocumentData) =>
    payoutMatches(d, status) && inRange(typeof d.createdAt === "number" ? d.createdAt : null, range);

  // The full wallet number stays behind: only the masked hint is ever read.
  const fields = [
    "providerId",
    "amountMinor",
    "bookingIds",
    "network",
    "accountHint",
    "beneficiaryName",
    "status",
    "needsReview",
    "reviewReason",
    "failureReason",
    "transferReference",
    "transferId",
    "createdAt",
    "updatedAt",
    "review",
  ];
  let docs: DocumentSnapshot[];
  let nextCursor: string | null;
  if (status === "needs_review") {
    const snap = await db().collection(PAYOUTS).where("needsReview", "==", true).select(...fields).limit(EQUALITY_MAX).get();
    const page = pageAfter(snap.docs.filter((d) => keep(d.data())), positionOrStart("createdAt"), "desc", cursor, limit);
    docs = page.items;
    nextCursor = page.next ? encodeCursor(page.next) : null;
  } else {
    const page = await scanPage({
      base: within(db().collection(PAYOUTS).select(...fields), "createdAt", range),
      field: "createdAt",
      cursor,
      limit,
      keep: status ? (batch) => batch.map((d) => keep(d.data())) : undefined,
    });
    docs = page.docs;
    nextCursor = page.nextCursor;
  }

  const names = await namesFor(docs.map((d) => d.get("providerId")), { listings: true });
  return {
    items: docs.map((d) => payoutRow(d.id, d.data() ?? {}, names.get(String(d.get("providerId"))) ?? null)),
    nextCursor,
  };
});

/**
 * The money in a range: payments taken in it, refunds DECIDED in it (a
 * refund belongs to the day it was given, not the day of the payment), and
 * payouts sent in it.
 */
async function moneyIn(range: DateRange) {
  const decidedInRange = (doc: DocumentSnapshot) => inRange(reviewRecord(doc.get("review"))?.at ?? null, range);
  const [payments, refundedPayments, refundedSessions, payouts] = await Promise.all([
    within(db().collection(PAYMENTS), "createdAt", range).select("status", "amountMinor", "purpose").limit(TOTALS_MAX).get(),
    db().collection(PAYMENTS).where("review.decision", "==", "refunded").select("amountMinor", "review").limit(TOTALS_MAX).get(),
    db().collection(BOOKINGS).where("refundDue", "==", true).select("amountMinor", "review").limit(TOTALS_MAX).get(),
    within(db().collection(PAYOUTS), "createdAt", range).select("status", "amountMinor").limit(TOTALS_MAX).get(),
  ]);
  const totals = summariseMoney(
    {
      payments: payments.docs.map((d) => d.data()),
      refunds: [...refundedPayments.docs, ...refundedSessions.docs].filter(decidedInRange).map((d) => d.data()),
      payouts: payouts.docs.map((d) => d.data()),
    },
    platformFeeMinor,
  );
  const truncated = [payments, refundedPayments, refundedSessions, payouts].some((s) => s.size === TOTALS_MAX);
  return { totals, truncated };
}

export const adminPaymentTotals = onCall(CALLABLE, async (request): Promise<PaymentTotalsResult> => {
  await requireStaff(request);
  const range = rangeFrom(request.data?.range);
  const before = previousRange(range, Date.now());
  const [current, previous] = await Promise.all([moneyIn(range), before ? moneyIn(before) : Promise.resolve(null)]);
  return {
    range,
    current: current.totals,
    previous: previous?.totals ?? null,
    truncated: current.truncated || Boolean(previous?.truncated),
  };
});

// ------------------------------------------------------------------- support

export const adminListSupport = onCall(CALLABLE, async (request): Promise<ListSupportResult> => {
  await requireStaff(request);
  const status = optionalOneOf<SupportFilter>(request.data?.status, [...SUPPORT_STATUSES, "unresolved"], "status");
  const topic = optionalOneOf(request.data?.topic, SUPPORT_TOPICS, "topic");
  const limit = pageLimit(request.data?.limit);

  const support = db().collection(SUPPORT);
  const [page, counts] = await Promise.all([
    scanPage({
      base: support,
      field: "createdAt",
      cursor: cursorFrom(request.data?.cursor),
      limit,
      keep: status || topic ? (batch) => batch.map((d) => supportMatches(d.data(), { status, topic })) : undefined,
    }),
    Promise.all(SUPPORT_STATUSES.map((s) => support.where("status", "==", s).count().get())),
  ]);
  return {
    items: page.docs.map((d) => supportRow(d.id, d.data())),
    nextCursor: page.nextCursor,
    counts: Object.fromEntries(SUPPORT_STATUSES.map((s, i) => [s, counts[i].data().count])) as ListSupportResult["counts"],
  };
});

export const adminUpdateSupport = onCall(CALLABLE, async (request): Promise<UpdateSupportResult> => {
  const staffUid = await requireStaff(request);
  const id = idFrom(request.data?.id, "request");
  const status = optionalOneOf(request.data?.status, SUPPORT_SETTABLE_STATUSES, "status");
  const note = optionalText(request.data?.note, SUPPORT_NOTE_MAX);
  const rawAssignee = request.data?.assignee;
  const assignee = rawAssignee === undefined ? undefined : rawAssignee === null ? null : idFrom(rawAssignee, "member of staff");
  if (!status && !note && assignee === undefined) throw new HttpsError("invalid-argument", "Nothing to change.");

  const ref = db().collection(SUPPORT).doc(id);
  await db().runTransaction(async (tx) => {
    const someoneElse = assignee && assignee !== staffUid ? [db().collection(USERS).doc(assignee)] : [];
    const [current, [me, other]] = await Promise.all([
      tx.get(ref),
      tx.getAll(db().collection(USERS).doc(staffUid), ...someoneElse, { fieldMask: ["displayName", "role"] }),
    ]);
    const assigned = other ?? me;
    if (!current.exists) throw new HttpsError("not-found", "No such request.");
    if (assignee && assigned.get("role") !== "admin") {
      throw new HttpsError("invalid-argument", "Requests can only be given to a member of staff.");
    }

    const now = Date.now();
    const from = supportRow(id, current.data() ?? {});
    const patch: Record<string, unknown> = { updatedAt: now };
    const reassigned = assignee !== undefined && assignee !== (from.assignee?.uid ?? null);
    const to = supportStatusAfter(from.status, status, reassigned ? assignee : undefined);
    if (to) {
      patch.status = to;
      patch.statusChangedAt = now;
      patch.resolvedAt = to === "resolved" ? now : null;
      patch.resolvedBy = to === "resolved" ? staffUid : null;
    }
    if (reassigned) {
      patch.assigneeId = assignee;
      patch.assigneeName = assignee ? (assigned.get("displayName") ?? null) : null;
    }
    // Asked for what is already so: nothing to write, and nothing to log.
    if (!("status" in patch) && !reassigned && !note) return;
    if (note) {
      patch.notes = FieldValue.arrayUnion({
        id: randomUUID(),
        by: staffUid,
        byName: me.get("displayName") ?? null,
        body: note,
        at: now,
      });
    }
    tx.update(ref, patch);
    // What changed, never what the note says: the note can quote the person.
    tx.set(
      db().collection(AUDIT_LOGS).doc(),
      auditEntry(staffUid, OPS_ACTIONS.support, `${SUPPORT}/${id}`, {
        ...("status" in patch ? { from: from.status, to } : {}),
        ...("assigneeId" in patch ? { assignee } : {}),
        ...(note ? { noted: true } : {}),
      }),
    );
  });

  return { request: supportRow(id, (await ref.get()).data() ?? {}) };
});

// ----------------------------------------------------------------- audit log

async function auditRows(docs: DocumentSnapshot[]): Promise<AdminAuditRow[]> {
  const names = await namesFor(docs.map((d) => d.get("actorId")));
  return docs.map((d) => auditRow(d.id, d.data() ?? {}, names.get(String(d.get("actorId"))) ?? null));
}

export const adminListAudit = onCall(CALLABLE, async (request): Promise<Page<AdminAuditRow>> => {
  await requireStaff(request);
  const actor = optionalText(request.data?.actor, 128);
  const action = optionalText(request.data?.action, 100);
  const target = optionalText(request.data?.target, 300);
  const range = rangeFrom(request.data?.range);
  const filtered = Boolean(actor || action || target);

  const { docs, nextCursor } = await scanPage({
    base: within(db().collection(AUDIT_LOGS), "createdAt", range),
    field: "createdAt",
    cursor: cursorFrom(request.data?.cursor),
    limit: pageLimit(request.data?.limit),
    keep: filtered
      ? (batch) =>
          batch.map((d) => {
            const data = d.data();
            return (
              (!actor || data.actorId === actor) &&
              (!action || actionMatches(data.action, action)) &&
              (!target || targetMatches(data.targetPath, target))
            );
          })
      : undefined,
  });
  return { items: await auditRows(docs), nextCursor };
});
