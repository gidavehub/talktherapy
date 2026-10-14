/**
 * What every staff-only function needs: knowing the caller really is staff,
 * writing down what they did, and telling somebody about it.
 *
 * The role is read from users/{uid} on every call, never taken from the
 * request or from a custom claim alone. A claim is set when the role changes
 * and lives in the caller's ID token for up to an hour after it is taken away;
 * the user document is the truth the moment it changes.
 */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./payments";

export const USERS = "users";
export const AUDIT_LOGS = "auditLogs";
export const NOTIFICATIONS = "notifications";

/**
 * Callables are invoked by the public internet — the browser calls them, and
 * the function checks the caller's ID token itself. Stated on every function
 * for the reason given beside CALLABLE in index.ts.
 */
export const CALLABLE = { region: "us-east4", invoker: "public" as const };

/** The default Storage bucket. initializeApp is given only the project, so it is named here. */
export const BUCKET = process.env.STORAGE_BUCKET || "talk-therapy-509209.firebasestorage.app";

/** The caller's uid, or a refusal. */
export function signedIn(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return uid;
}

/** The caller's uid if they are staff right now, or a refusal. */
export async function requireStaff(request: CallableRequest): Promise<string> {
  const uid = signedIn(request);
  const role = (await db().collection(USERS).doc(uid).get()).data()?.role;
  if (role !== "admin") throw new HttpsError("permission-denied", "Staff only.");
  return uid;
}

/**
 * One line in the audit log. Written for every staff action, so "who did
 * this, and when" always has an answer. Never carries clinical text: the
 * metadata is the decision and its reason, not anything a person disclosed.
 */
export function auditEntry(
  actorId: string,
  action: string,
  targetPath: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    actorId,
    action,
    targetPath,
    metadata,
    createdAt: Date.now(),
  };
}

export async function audit(
  actorId: string,
  action: string,
  targetPath: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db().collection(AUDIT_LOGS).add(auditEntry(actorId, action, targetPath, metadata));
}

/**
 * Something for a person to see in the app. `to` is a uid, or "staff" for
 * everyone on the staff side (read by role in firestore.rules).
 */
export function notification(to: string, title: string, body: string, href: string | null) {
  return { to, title, body, href, createdAt: Date.now(), readAt: null };
}

/**
 * Set or clear the `admin` custom claim, keeping every other claim.
 *
 * setCustomUserClaims REPLACES the whole set, and the set carries the paid
 * TALK conversation (aiTier, aiExpiresAt, aiEndsAt) — dropping those would
 * end somebody's conversation. Returns whether anything changed, so the
 * caller knows to refresh its token.
 */
export async function setAdminClaim(uid: string, admin: boolean): Promise<boolean> {
  const user = await getAuth().getUser(uid);
  const claims = { ...((user.customClaims ?? {}) as Record<string, unknown>) };
  const had = claims.admin === true;
  if (had === admin) return false;
  if (admin) claims.admin = true;
  else delete claims.admin;
  await getAuth().setCustomUserClaims(uid, claims);
  return true;
}

export { FieldValue };
