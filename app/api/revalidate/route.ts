/**
 * POST /api/revalidate — show freshly published content now, not in five
 * minutes. Called by the content editor straight after publishContent.
 *
 *   Authorization: Bearer <the staff member's Firebase ID token>
 *   { "sections": ["home", "theme"] }
 *
 * "resources" refreshes the whole resource centre — the page around the
 * library and every article in it, /resources/{slug} included — because the
 * articles are cached under the same tag as their page (RESOURCES_TAG in
 * @/lib/content/resources). The article editor sends it after each change.
 *
 * The host holds no secret for this: the caller is checked by asking
 * Firestore for their own users/{uid} document with their own token (see
 * isStaffToken in @/lib/content/staffToken).
 *
 * All it can do is expire cached copies of the public content, so the worst a
 * caller could do with it is make the next page load a little slower.
 */

import { revalidateTag } from "next/cache";
import { RESOURCES_TAG } from "@/lib/content/resources";
import { contentTag, isSectionId, type SectionId } from "@/lib/content/schema";
import { bearerToken, isStaffToken } from "@/lib/content/staffToken";

function sectionsFrom(body: unknown): SectionId[] | null {
  if (!body || typeof body !== "object" || !("sections" in body) || !Array.isArray(body.sections)) return null;
  const sections: unknown[] = body.sections;
  if (sections.length === 0 || sections.length > 32 || !sections.every(isSectionId)) return null;
  return [...new Set(sections as SectionId[])];
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await isStaffToken(token))) return Response.json({ error: "Staff only." }, { status: 403 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Read as no sections, below.
  }
  const sections = sectionsFrom(body);
  if (!sections) return Response.json({ error: "Say which sections to refresh." }, { status: 400 });

  // Expired outright, not marked stale: the person who just published is about
  // to look, and should see what they published, not the version before it.
  const tags = new Set(sections.map(contentTag));
  // The articles' tag, named rather than assumed to be the page's.
  if (sections.includes("resources")) tags.add(RESOURCES_TAG);
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: sections });
}
