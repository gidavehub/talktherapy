/**
 * The content editor's preview: the real public pages, showing the drafts.
 *
 *   POST   Authorization: Bearer <staff ID token>   preview on, for this browser
 *   DELETE                                          preview off
 *
 * On, it turns on Next's draft mode for this browser — every cache is
 * skipped, so each page is drawn fresh — and keeps the caller's ID token in
 * an httpOnly cookie. The server reader (@/lib/content/server) then reads the
 * drafts from Firestore with that token, so the drafts are read exactly as
 * the staff member could read them and no secret lives on the host. Anyone
 * else's browser is untouched, and a cookie without a staff token in it
 * shows nothing but what is published.
 *
 * The editor turns it off when it closes, and the token in the cookie stops
 * working within the hour anyway, so a staff member who later browses the
 * site in another tab sees it as visitors do.
 */

import { cookies, draftMode } from "next/headers";
import { PREVIEW_COOKIE, bearerToken, isStaffToken, tokenExpiresAt } from "@/lib/content/staffToken";

/** An ID token lasts an hour; the cookie never outlives it. */
const MAX_AGE_SECONDS = 3600;

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await isStaffToken(token))) return Response.json({ error: "Staff only." }, { status: 403 });

  const expiresAt = tokenExpiresAt(token) ?? Date.now() + MAX_AGE_SECONDS * 1000;
  const maxAge = Math.max(0, Math.min(MAX_AGE_SECONDS, Math.floor((expiresAt - Date.now()) / 1000)));
  (await draftMode()).enable();
  (await cookies()).set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    // The preview is a frame of this same site, so a strict cookie still goes with it.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return Response.json({ expiresAt: Date.now() + maxAge * 1000 });
}

export async function DELETE() {
  (await draftMode()).disable();
  (await cookies()).delete(PREVIEW_COOKIE);
  return Response.json({ ok: true });
}
