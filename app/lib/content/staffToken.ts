/**
 * Is this Firebase ID token a member of staff's? Answered without any secret
 * on the web host, for the two routes the content editor calls:
 * /api/revalidate (refresh the public pages after a publish) and
 * /api/preview (show drafts in the editor's preview).
 *
 * Firestore is asked for the caller's own users/{uid} document with the
 * caller's own token. Firestore verifies the token (signature, project,
 * expiry) and its rules let a person read only their own document — so a
 * role of "admin" coming back is the truth, read the same way requireStaff
 * reads it in the functions. A forged or expired token gets nothing back.
 */

import "server-only";
import { FIREBASE_PROJECT_ID } from "./schema";

const USERS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/`;

/**
 * The cookie that carries a staff member's ID token while the editor's
 * preview is on (see /api/preview), so the server can read the drafts with
 * it. httpOnly: no script on the page can read it back.
 */
export const PREVIEW_COOKIE = "talk_content_preview";

/** The claims inside an ID token, read without checking it — Firestore checks it when it is used. */
function claimsOf(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The uid an ID token names. Only used to name the document to ask for. */
function uidOf(token: string): string | null {
  const claims = claimsOf(token);
  const uid = claims?.user_id ?? claims?.sub;
  return typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null;
}

/** When the token stops working, in ms, or null when it does not say. */
export function tokenExpiresAt(token: string): number | null {
  const exp = claimsOf(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}

/** The token from an "Authorization: Bearer …" header, or null. */
export function bearerToken(request: Request): string | null {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

export async function isStaffToken(token: string): Promise<boolean> {
  const uid = uidOf(token);
  if (!uid) return false;
  try {
    const res = await fetch(`${USERS_URL}${uid}?mask.fieldPaths=role`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { fields?: { role?: { stringValue?: string } } };
    return body.fields?.role?.stringValue === "admin";
  } catch {
    return false;
  }
}
