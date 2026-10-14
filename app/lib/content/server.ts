/**
 * The public site's content, read on the server.
 *
 * Published sections are public-read in firestore.rules, so they are read
 * over Firestore's REST API with no credentials at all — the site's host
 * holds no secret for this, and the rules decide exactly as they would for a
 * visitor's browser. No API key either: Firestore answers public reads
 * without one, and a second copy of the key here would be one more place to
 * change when it is rotated.
 *
 * One request fetches every published section. It is cached by Next for
 * five minutes and tagged "content" and "content:<section>", so publishing
 * (via /api/revalidate) refreshes it at once and the five minutes is only a
 * safety net. React's cache() shares it between the layout, the page and
 * generateMetadata in one render.
 *
 * Nothing here throws. Firestore unreachable, a document unreadable, a field
 * that fails its checks — each shows the default instead, so a bad day for
 * the database is never a broken page.
 *
 * The resource centre's articles are read the same way (getResources), with
 * the starter set in code shown until staff change it — see ./resources.
 *
 * The content editor's preview is the one exception to "published only".
 * When /api/preview has turned on draft mode for a staff member's browser,
 * the drafts are read too — with that staff member's own ID token, from the
 * cookie the route set, so Firestore's rules decide as they do in the editor
 * — and a section with a draft shows the draft. Never the colours: a draft
 * palette would restyle the editor itself, so the theme editor previews its
 * colours on its own page.
 */

import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { cookies, draftMode } from "next/headers";
import { decodeFields, documentId, type RestDocument } from "./firestoreRest";
import { RESOURCES_TAG, RESOURCE_COLLECTIONS, resourceCatalogue, type PublicResource } from "./resources";
import {
  CONTENT_COLLECTIONS,
  FIREBASE_PROJECT_ID,
  SECTION_IDS,
  contentTag,
  isSectionId,
  type ContentOf,
  type SectionId,
  type SeoPageId,
} from "./schema";
import { PREVIEW_COOKIE } from "./staffToken";
import { themeCss } from "./theme";
import { fillContent } from "./tokens";
import { mergeSection } from "./validate";

/** How long a page may show content before checking for a newer version, in seconds. */
export const CONTENT_REVALIDATE_SECONDS = 300;

/** The tag on every content read, for refreshing everything at once. */
export const ALL_CONTENT_TAG = "content";

const LIST_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
  `${CONTENT_COLLECTIONS.published}?pageSize=100`;

const loadPublished = cache(async (): Promise<Map<SectionId, unknown>> => {
  const published = new Map<SectionId, unknown>();
  try {
    const res = await fetch(LIST_URL, {
      next: { revalidate: CONTENT_REVALIDATE_SECONDS, tags: [ALL_CONTENT_TAG, ...SECTION_IDS.map(contentTag)] },
      // A hung connection must not hold a page: after this, the defaults show.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return published;
    const body = (await res.json()) as { documents?: RestDocument[] };
    for (const doc of body.documents ?? []) {
      const id = documentId(doc);
      if (isSectionId(id)) published.set(id, decodeFields(doc.fields).data);
    }
  } catch {
    // Unreachable or unreadable: every section shows its defaults.
  }
  return published;
});

const DRAFTS_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
  `${CONTENT_COLLECTIONS.drafts}?pageSize=100`;

/** Every draft, read with the previewing staff member's token. Empty when there is none or it is refused. */
const loadDrafts = cache(async (token: string): Promise<Map<SectionId, unknown>> => {
  const drafts = new Map<SectionId, unknown>();
  try {
    const res = await fetch(DRAFTS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return drafts;
    const body = (await res.json()) as { documents?: RestDocument[] };
    for (const doc of body.documents ?? []) {
      const id = documentId(doc);
      if (isSectionId(id)) drafts.set(id, decodeFields(doc.fields).data);
    }
  } catch {
    // Unreachable or refused: the preview shows what is published.
  }
  return drafts;
});

/** The previewing staff member's token, while the editor's preview is on for this request; otherwise null. */
async function previewToken(): Promise<string | null> {
  try {
    // Off for every visitor, and while pages are built: no cookie is read then.
    if (!(await draftMode()).isEnabled) return null;
    return (await cookies()).get(PREVIEW_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** The drafts, while the editor's preview is on for this request; otherwise none. */
async function previewDrafts(): Promise<Map<SectionId, unknown> | null> {
  const token = await previewToken();
  return token ? loadDrafts(token) : null;
}

/**
 * A section's content as the site shows it: published values over the
 * defaults, placeholders filled in with today's prices. In the editor's
 * preview, a section with a draft shows the draft instead.
 */
export async function getContent<S extends SectionId>(id: S): Promise<ContentOf<S>> {
  // The colours never come from a draft, so they never wait on one: the root
  // layout reads them on every page, the editor's own included.
  const [published, drafts] = await Promise.all([loadPublished(), id === "theme" ? null : previewDrafts()]);
  const stored = drafts?.has(id) ? drafts.get(id) : published.get(id);
  return fillContent(mergeSection(id, stored));
}

/** The root layout's metadata: the front page's title as the default, and the template that brands the rest. */
export async function siteMetadata(): Promise<Pick<Metadata, "title" | "description">> {
  const { home } = await getContent("seo");
  return {
    title: { default: home.title, template: "%s · TALK" },
    description: home.description,
  };
}

/** A page's title and description, for its generateMetadata. The layout's template adds "· TALK". */
export async function pageMetadata(page: Exclude<SeoPageId, "home">): Promise<Pick<Metadata, "title" | "description">> {
  const seo = await getContent("seo");
  return { title: seo[page].title, description: seo[page].description };
}

/** The style rule for the published palette, or "" while it is the original. */
export async function getThemeCss(): Promise<string> {
  const { colors } = await getContent("theme");
  return themeCss(colors);
}

// ---------------------------------------------------------------- resources

const QUERY_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

/**
 * The resource centre's documents with one status. Asked as a query because
 * the rules let the public read exactly these and nothing else, and Firestore
 * refuses a list it cannot prove keeps to that. A POST, so it is cached by
 * its body as well as its address: one cache entry per status.
 */
async function resourcesWithStatus(status: "published" | "withdrawn"): Promise<RestDocument[] | null> {
  try {
    const res = await fetch(QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: RESOURCE_COLLECTIONS.published }],
          where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: status } } },
          limit: 500,
        },
      }),
      next: { revalidate: CONTENT_REVALIDATE_SECONDS, tags: [ALL_CONTENT_TAG, RESOURCES_TAG] },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { document?: RestDocument }[];
    return Array.isArray(rows) ? rows.flatMap((row) => (row.document ? [row.document] : [])) : null;
  } catch {
    return null;
  }
}

/**
 * Every published or withdrawn article document, by id — or null when either
 * half could not be read, and the starter articles show as they ship. Half
 * would be worse than neither: without the withdrawn ones, an article staff
 * took down would come back.
 */
const loadResources = cache(async (): Promise<Map<string, unknown> | null> => {
  const [published, withdrawn] = await Promise.all([resourcesWithStatus("published"), resourcesWithStatus("withdrawn")]);
  if (!published || !withdrawn) return null;
  const stored = new Map<string, unknown>();
  for (const doc of [...published, ...withdrawn]) {
    const id = documentId(doc);
    if (id) stored.set(id, decodeFields(doc.fields));
  }
  return stored;
});

const RESOURCE_DRAFTS_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
  `${RESOURCE_COLLECTIONS.drafts}?pageSize=300`;

/** Every article draft, read with the previewing staff member's token. Empty when refused. */
const loadResourceDrafts = cache(async (token: string): Promise<Map<string, unknown>> => {
  const drafts = new Map<string, unknown>();
  try {
    const res = await fetch(RESOURCE_DRAFTS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return drafts;
    const body = (await res.json()) as { documents?: RestDocument[] };
    for (const doc of body.documents ?? []) {
      const id = documentId(doc);
      if (id) drafts.set(id, decodeFields(doc.fields));
    }
  } catch {
    // Refused or unreachable: the preview shows what is published.
  }
  return drafts;
});

/**
 * The resource centre's articles, newest first, as the site shows them:
 * published ones, and the starter articles nobody has changed or taken down.
 * In the editor's preview, each article with a draft shows the draft.
 */
export async function getResources(): Promise<PublicResource[]> {
  const token = await previewToken();
  const [stored, drafts] = await Promise.all([loadResources(), token ? loadResourceDrafts(token) : null]);
  return resourceCatalogue(stored, drafts);
}

/** One article by its address, or null when no article lives there. */
export async function getResource(slug: string): Promise<PublicResource | null> {
  return (await getResources()).find((resource) => resource.slug === slug) ?? null;
}
