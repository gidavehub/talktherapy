/**
 * Site content: publishing the public site's words, pictures and colours
 * (track: content). Exported from index.ts.
 *
 *   publishContent     staff: a section's content goes live
 *   revertContent      staff: what a section showed before a change goes back
 *   publishResource    staff: an article in the resource centre goes live
 *   unpublishResource  staff: an article comes off the site
 *   revertResource     staff: what an article showed before a change goes back
 *   registerSiteMedia  staff: an uploaded picture joins the media library
 *   updateSiteMedia    staff: a library picture's description changes
 *   deleteSiteMedia    staff: a picture leaves the library, if nothing shows it
 *
 * The public site reads siteContent/{sectionId} and resources/{id} with no
 * credentials (they are public-read), so this is the only way anything
 * reaches it: the caller is checked against users/{uid} on every call, the
 * content is validated with the same app/lib/content code the editor uses,
 * what it replaces is kept as a version so it can be put back, and every
 * change is audited.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import type { DocumentReference, DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { db } from "./payments";
import { AUDIT_LOGS, BUCKET, CALLABLE, FieldValue, auditEntry, requireStaff } from "./staff";
import {
  CONTENT_COLLECTIONS,
  MEDIA_MAX_BYTES,
  MEDIA_PATH,
  MEDIA_SNIFF_BYTES,
  MEDIA_TYPES,
  SECTIONS,
  isSectionId,
  mediaIdFromUrl,
  mediaTypeOf,
  resourceUsage,
  siteMediaUrl,
  type ContentVersion,
  type MediaType,
  type SectionId,
  type SiteMedia,
} from "../../app/lib/content/schema";
import { checkCopy, mediaIdsIn, mergeSection, validateSection, type Issue } from "../../app/lib/content/validate";
import {
  RESOURCE_COLLECTIONS,
  coverMediaId,
  isResourceId,
  seedById,
  seedContent,
  shapeResource,
  storedResource,
  validateResource,
  type ResourceContent,
  type ResourceDraftDoc,
  type ResourceVersion,
} from "../../app/lib/content/resources";

const PUBLISHED = CONTENT_COLLECTIONS.published;
const DRAFTS = CONTENT_COLLECTIONS.drafts;
const VERSIONS = CONTENT_COLLECTIONS.versions;
const MEDIA = CONTENT_COLLECTIONS.media;
const RESOURCES = RESOURCE_COLLECTIONS.published;
const RESOURCE_DRAFTS = RESOURCE_COLLECTIONS.drafts;
const RESOURCE_VERSIONS = RESOURCE_COLLECTIONS.versions;

const MEDIA_ID = /^[A-Za-z0-9_-]{6,64}$/;
const VERSION_ID = /^[A-Za-z0-9]{1,64}$/;

function input(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

function sectionFrom(value: unknown): SectionId {
  if (!isSectionId(value)) throw new HttpsError("invalid-argument", "Say which part of the site this is.");
  return value;
}

/** A note for the history: one line, at most 300 characters, or null. */
function noteFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, 300) : null;
}

/** The rev the caller's draft started from, to refuse a change made over somebody else's. */
function expectedRevFrom(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpsError("invalid-argument", "expectedRev must be a whole number.");
  }
  return value;
}

function versionFrom(value: unknown): string {
  if (typeof value !== "string" || !VERSION_ID.test(value)) throw new HttpsError("invalid-argument", "Say which version to put back.");
  return value;
}

/** A refusal that carries the problems by field, for the editor to point at. */
function refused(errors: Issue[], lead: string): HttpsError {
  const first = errors[0];
  const where = first?.key ? ` (${first.key})` : "";
  return new HttpsError("invalid-argument", first ? `${lead} ${first.message}${where}` : lead, { errors });
}

/** A picture's description: what the library keeps and suggests when it is chosen. */
function altFrom(value: unknown): string {
  const alt = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!alt) throw new HttpsError("invalid-argument", "Describe the picture for people who cannot see it.");
  if (alt.length > 200) throw new HttpsError("invalid-argument", "Keep the description to 200 characters.");
  const problem = checkCopy(alt);
  if (problem) throw new HttpsError("invalid-argument", problem);
  return alt;
}

/** The media ids a published document shows, read through the same merge the site uses. */
function mediaShownBy(id: SectionId, stored: Record<string, unknown> | undefined): string[] {
  return stored ? mediaIdsIn(id, mergeSection(id, stored.data)) : [];
}

/**
 * Put new content live, inside a transaction the caller has opened: keep
 * what it replaces as a version, clear the draft, keep each picture's list of
 * the pages it is on, and audit it. Shared by publish and revert, which
 * differ only in where the new content comes from.
 */
async function goLive(
  tx: Transaction,
  args: {
    uid: string;
    sectionId: SectionId;
    data: Record<string, unknown> | null;
    action: ContentVersion["action"];
    note: string | null;
    expectedRev?: number;
    audit: Record<string, unknown>;
  },
): Promise<{ rev: number; publishedAt: number; versionId: string }> {
  const { uid, sectionId, data, action, note } = args;
  const liveRef = db().collection(PUBLISHED).doc(sectionId);
  const live = await tx.get(liveRef);
  const previous = live.data();
  const previousRev = typeof previous?.rev === "number" ? previous.rev : 0;
  if (args.expectedRev !== undefined && args.expectedRev !== previousRev) {
    throw new HttpsError(
      "aborted",
      "Somebody else published this part of the site since you started. Look at what is live now, then publish again.",
    );
  }

  // Every picture the new content shows must still be in the library, and
  // every picture involved has its list of pages kept up to date.
  const showing = data ? mediaIdsIn(sectionId, mergeSection(sectionId, data)) : [];
  const shown = mediaShownBy(sectionId, previous);
  const involved = [...new Set([...showing, ...shown])];
  const refs = involved.map((id) => db().collection(MEDIA).doc(id));
  const snaps: DocumentSnapshot[] = refs.length ? await tx.getAll(...refs) : [];
  const exists = new Map(involved.map((id, i) => [id, snaps[i].exists]));
  if (showing.some((id) => !exists.get(id))) {
    throw new HttpsError(
      "failed-precondition",
      "A picture on this page is no longer in the media library. Choose another picture, then publish again.",
    );
  }

  const now = Date.now();
  const rev = previousRev + 1;
  const versionRef = db().collection(VERSIONS).doc();
  tx.set(versionRef, {
    sectionId,
    // Null when the built-in defaults were showing: putting this back puts them back.
    data: previous?.data ?? null,
    rev: previousRev,
    publishedAt: typeof previous?.publishedAt === "number" ? previous.publishedAt : null,
    replacedAt: now,
    replacedBy: uid,
    action,
    note,
  } satisfies Omit<ContentVersion, "id">);
  tx.set(liveRef, { data, rev, publishedAt: now });
  tx.delete(db().collection(DRAFTS).doc(sectionId));

  for (const id of involved) {
    if (!exists.get(id)) continue;
    const ref = refs[involved.indexOf(id)] as DocumentReference;
    if (showing.includes(id) && !shown.includes(id)) tx.update(ref, { usage: FieldValue.arrayUnion(sectionId) });
    if (!showing.includes(id) && shown.includes(id)) tx.update(ref, { usage: FieldValue.arrayRemove(sectionId) });
  }

  tx.set(
    db().collection(AUDIT_LOGS).doc(),
    auditEntry(uid, `site_content.${action}`, `${PUBLISHED}/${sectionId}`, {
      ...args.audit,
      sectionId,
      rev,
      versionId: versionRef.id,
    }),
  );
  return { rev, publishedAt: now, versionId: versionRef.id };
}

// ------------------------------------------------------------------ publish

export const publishContent = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const sectionId = sectionFrom(body.sectionId);
  const note = noteFrom(body.note);
  const expectedRev = expectedRevFrom(body.expectedRev);

  // The same checks the editor runs, with the same code. A browser that
  // skipped them gets the same answer here.
  const result = validateSection(sectionId, body.data);
  if (!result.ok) throw refused(result.errors, "This cannot be published yet.");

  const out = await db().runTransaction((tx) =>
    goLive(tx, {
      uid,
      sectionId,
      data: result.value as Record<string, unknown>,
      action: "publish",
      note,
      expectedRev,
      audit: { note },
    }),
  );
  return { rev: out.rev, publishedAt: out.publishedAt, versionId: out.versionId };
});

// ------------------------------------------------------------------- revert

export const revertContent = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const sectionId = sectionFrom(body.sectionId);
  const versionId = versionFrom(body.versionId);

  const version = (await db().collection(VERSIONS).doc(versionId).get()).data();
  if (!version || version.sectionId !== sectionId) {
    throw new HttpsError("not-found", "That version is not one of this page's.");
  }

  // A version from before the page changed shape may not fit it any more.
  // It is checked like anything else being published, not trusted for its age.
  let data: Record<string, unknown> | null = null;
  if (version.data != null) {
    const result = validateSection(sectionId, version.data);
    if (!result.ok) {
      throw refused(result.errors, "That version no longer fits this page. Open it in the editor and publish it from there.");
    }
    data = result.value as Record<string, unknown>;
  }

  const out = await db().runTransaction((tx) =>
    goLive(tx, {
      uid,
      sectionId,
      data,
      action: "revert",
      note: null,
      audit: { restoredFrom: versionId, restoredRev: typeof version.rev === "number" ? version.rev : null },
    }),
  );
  return { rev: out.rev, publishedAt: out.publishedAt, versionId: out.versionId };
});

// ---------------------------------------------------------------- resources

function resourceFrom(value: unknown): string {
  if (!isResourceId(value)) throw new HttpsError("invalid-argument", "Say which article.");
  return value;
}

/** A starter article showing its words from code: no document yet, or put back to them. */
const ORIGINAL = "original" as const;

/**
 * Change what the site shows for one article, inside a transaction the
 * caller has opened: new words, a starter article's own words (ORIGINAL), or
 * nothing (null: taken off the site). What it replaces is kept as a version,
 * each cover picture's list of where it is used is kept up to date, and the
 * change is audited. Shared by publish, unpublish and put back.
 *
 * Going live clears the draft: it is what went live, or what was put back
 * replaced it. Coming off keeps the words to hand as the draft — the one
 * being worked on, if there is one, which is newer; otherwise what was
 * showing — so the article stays in the editor's list to publish again.
 */
async function changeResource(
  tx: Transaction,
  args: {
    uid: string;
    id: string;
    next: ResourceContent | typeof ORIGINAL | null;
    action: ResourceVersion["action"];
    note: string | null;
    expectedRev?: number;
    audit: Record<string, unknown>;
  },
): Promise<{ rev: number; versionId: string }> {
  const { uid, id, next, action, note } = args;
  const seed = seedById(id);
  const ref = db().collection(RESOURCES).doc(id);
  const draftRef = db().collection(RESOURCE_DRAFTS).doc(id);

  // Every read before any write, as a transaction requires.
  const stored = (await tx.get(ref)).data();
  const previousRev = typeof stored?.rev === "number" ? stored.rev : 0;
  if (args.expectedRev !== undefined && args.expectedRev !== previousRev) {
    throw new HttpsError(
      "aborted",
      "Somebody else changed this article since you started. Look at what is live now, then try again.",
    );
  }

  const status = stored?.status;
  const wasPublished = status === "published";
  // A starter article is live until it is taken down.
  const wasLive = wasPublished || (seed !== null && (stored === undefined || status === ORIGINAL));
  const before = wasPublished ? shapeResource(stored) : null;
  if (next === null && !wasLive) {
    throw new HttpsError("failed-precondition", "It is not on the site, so there is nothing to take down.");
  }
  if (next === ORIGINAL && !seed) {
    throw new HttpsError("failed-precondition", "Only a starter article has original words to put back.");
  }
  const going = next === ORIGINAL ? (seed ? seedContent(seed) : null) : next;

  // Its address must be free. checkSlug has kept it off the starter
  // articles' addresses; this keeps it off every other published one.
  if (next && next !== ORIGINAL) {
    const same = await tx.get(db().collection(RESOURCES).where("slug", "==", next.slug).limit(10));
    if (same.docs.some((d) => d.id !== id && d.data().status === "published")) {
      const message = "Another article is published at this address. Choose another.";
      throw new HttpsError("already-exists", message, { errors: [{ path: ["slug"], key: "slug", message }] });
    }
  }

  const showing = coverMediaId(going);
  const shown = coverMediaId(before);
  const involved = [...new Set([showing, shown].filter((m): m is string => m !== null))];
  const mediaRefs = involved.map((m) => db().collection(MEDIA).doc(m));
  const mediaSnaps: DocumentSnapshot[] = mediaRefs.length ? await tx.getAll(...mediaRefs) : [];
  const exists = new Map(involved.map((m, i) => [m, mediaSnaps[i].exists]));
  if (showing && !exists.get(showing)) {
    throw new HttpsError(
      "failed-precondition",
      "The cover picture is no longer in the media library. Choose another, then publish again.",
    );
  }
  const draftExists = next === null ? (await tx.get(draftRef)).exists : false;

  const now = Date.now();
  const rev = previousRev + 1;
  const versionRef = db().collection(RESOURCE_VERSIONS).doc();
  tx.set(versionRef, {
    resourceId: id,
    live: wasLive,
    // Null while live: the starter article's words from code were showing.
    data: before,
    title: before?.title ?? seed?.title ?? going?.title ?? "",
    rev: previousRev,
    publishedAt: wasPublished
      ? typeof stored?.publishedAt === "number"
        ? stored.publishedAt
        : null
      : wasLive && seed
        ? seed.publishedAt
        : null,
    replacedAt: now,
    replacedBy: uid,
    action,
    note,
  } satisfies Omit<ResourceVersion, "id">);

  if (next === null) {
    // No words in it: the bare fact, public so a starter article stops showing.
    tx.set(ref, { status: "withdrawn", rev, updatedAt: now });
  } else if (next === ORIGINAL) {
    tx.set(ref, { status: ORIGINAL, rev, updatedAt: now });
  } else {
    // The library lists newest first, by when an article first went live.
    const publishedAt = seed
      ? seed.publishedAt
      : wasPublished && typeof stored?.publishedAt === "number"
        ? stored.publishedAt
        : now;
    tx.set(ref, storedResource(id, next, { rev, publishedAt, updatedAt: now }));
  }

  if (next !== null) {
    tx.delete(draftRef);
  } else if (draftExists) {
    // Still the draft of this article, now of its newer rev.
    tx.update(draftRef, { baseRev: rev });
  } else {
    const kept = before ?? (seed ? seedContent(seed) : null);
    if (kept) tx.set(draftRef, { data: kept, baseRev: rev, updatedAt: now, updatedBy: uid } satisfies ResourceDraftDoc);
  }

  const usage = resourceUsage(id);
  for (const media of involved) {
    if (!exists.get(media)) continue;
    const mediaRef = mediaRefs[involved.indexOf(media)] as DocumentReference;
    if (media === showing && media !== shown) tx.update(mediaRef, { usage: FieldValue.arrayUnion(usage) });
    if (media === shown && media !== showing) tx.update(mediaRef, { usage: FieldValue.arrayRemove(usage) });
  }

  tx.set(
    db().collection(AUDIT_LOGS).doc(),
    auditEntry(uid, `resource.${action}`, `${RESOURCES}/${id}`, {
      ...args.audit,
      slug: going?.slug ?? before?.slug ?? seed?.slug ?? null,
      rev,
      versionId: versionRef.id,
    }),
  );
  return { rev, versionId: versionRef.id };
}

export const publishResource = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const id = resourceFrom(body.id);
  const note = noteFrom(body.note);
  const expectedRev = expectedRevFrom(body.expectedRev);

  // The editor's own checks, run again: a browser that skipped them gets the same answer.
  const result = validateResource(id, body.data);
  if (!result.ok) throw refused(result.errors, "This cannot be published yet.");

  return db().runTransaction((tx) =>
    changeResource(tx, {
      uid,
      id,
      next: result.value,
      action: "publish",
      note,
      expectedRev,
      audit: { note },
    }),
  );
});

export const unpublishResource = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const id = resourceFrom(body.id);
  const note = noteFrom(body.note);
  const expectedRev = expectedRevFrom(body.expectedRev);

  return db().runTransaction((tx) =>
    changeResource(tx, { uid, id, next: null, action: "unpublish", note, expectedRev, audit: { note } }),
  );
});

export const revertResource = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const id = resourceFrom(body.id);
  const versionId = versionFrom(body.versionId);

  const version = (await db().collection(RESOURCE_VERSIONS).doc(versionId).get()).data();
  if (!version || version.resourceId !== id) throw new HttpsError("not-found", "That version is not one of this article's.");

  // What the article showed then: words (checked like anything else being
  // published, not trusted for their age), a starter article's own, or nothing.
  let next: ResourceContent | typeof ORIGINAL | null = null;
  if (version.live === true && version.data != null) {
    const result = validateResource(id, version.data);
    if (!result.ok) {
      throw refused(result.errors, "That version no longer fits. Open it in the editor and publish it from there.");
    }
    next = result.value;
  } else if (version.live === true) {
    next = ORIGINAL;
  }

  return db().runTransaction((tx) =>
    changeResource(tx, {
      uid,
      id,
      next,
      action: "revert",
      note: null,
      audit: { restoredFrom: versionId, restoredRev: typeof version.rev === "number" ? version.rev : null },
    }),
  );
});

// -------------------------------------------------------------------- media

/**
 * After the browser has uploaded a picture to site-media/{id}.{ext}, add it
 * to the library. The object itself is checked — it is there, it is one of
 * the four image types by its own first bytes as well as by what it was
 * declared as, it is within the size limit — because storage.rules can only
 * see the upload's declared type, not its contents or whether it finished.
 */
export const registerSiteMedia = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);

  const path = typeof body.path === "string" ? body.path : "";
  const match = MEDIA_PATH.exec(path);
  if (!match) throw new HttpsError("invalid-argument", "That is not a picture in the media library's folder.");
  const [, id, ext] = match;
  const alt = altFrom(body.alt);
  const width = body.width;
  const height = body.height;
  const sane = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 20000;
  if (!sane(width) || !sane(height)) throw new HttpsError("invalid-argument", "The picture's size did not come through.");

  const file = getStorage().bucket(BUCKET).file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "The upload did not finish. Try again.");
  const [meta] = await file.getMetadata();
  const type = String(meta.contentType ?? "") as MediaType;
  const bytes = Number(meta.size ?? 0);
  const extensions: readonly string[] | undefined = MEDIA_TYPES[type];
  // The declared type is what the uploading browser said; the file's own
  // first bytes must say the same.
  const head = bytes > 0 ? (await file.download({ start: 0, end: MEDIA_SNIFF_BYTES - 1 }))[0] : Buffer.alloc(0);
  if (
    !extensions ||
    !extensions.includes(ext) ||
    !(bytes > 0) ||
    bytes > MEDIA_MAX_BYTES ||
    mediaTypeOf(new Uint8Array(head)) !== type
  ) {
    // Not something the library can show; it should not stay in a public folder.
    await file.delete({ ignoreNotFound: true });
    throw new HttpsError("invalid-argument", "Use a JPG, PNG, WebP or AVIF picture of at most 8 MB.");
  }

  const media: SiteMedia = {
    id,
    url: siteMediaUrl(path),
    path,
    alt,
    width: width as number,
    height: height as number,
    bytes,
    type,
    uploadedBy: uid,
    createdAt: Date.now(),
    usage: [],
  };
  const batch = db().batch();
  batch.create(db().collection(MEDIA).doc(id), media);
  batch.set(db().collection(AUDIT_LOGS).doc(), auditEntry(uid, "site_media.register", `${MEDIA}/${id}`, { path, bytes, type }));
  try {
    await batch.commit();
  } catch (error) {
    // ALREADY_EXISTS: the same upload registered twice.
    if ((error as { code?: number }).code === 6) throw new HttpsError("already-exists", "This picture is already in the library.");
    throw error;
  }
  return { media };
});

export const updateSiteMedia = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const id = typeof body.id === "string" && MEDIA_ID.test(body.id) ? body.id : null;
  if (!id) throw new HttpsError("invalid-argument", "Say which picture.");
  const alt = altFrom(body.alt);

  const ref = db().collection(MEDIA).doc(id);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "That picture is not in the library.");
  const batch = db().batch();
  batch.update(ref, { alt });
  batch.set(db().collection(AUDIT_LOGS).doc(), auditEntry(uid, "site_media.update", `${MEDIA}/${id}`));
  await batch.commit();
  return { ok: true };
});

/**
 * Remove a picture from the library and from Storage — refused while any
 * published page or article shows it, so nobody deletes a picture out from
 * under the live site. The check and the delete share a transaction with the
 * published pages and articles, so a publish that starts showing it at the
 * same moment cannot slip between them.
 */
export const deleteSiteMedia = onCall(CALLABLE, async (request) => {
  const uid = await requireStaff(request);
  const body = input(request.data);
  const id = typeof body.id === "string" && MEDIA_ID.test(body.id) ? body.id : null;
  if (!id) throw new HttpsError("invalid-argument", "Say which picture.");

  const ref = db().collection(MEDIA).doc(id);
  const path = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That picture is not in the library.");
    const pages = await tx.get(db().collection(PUBLISHED));
    const articles = await tx.get(db().collection(RESOURCES).where("status", "==", "published"));
    const usedOn = [
      ...pages.docs
        .filter((d) => isSectionId(d.id) && mediaShownBy(d.id, d.data()).includes(id))
        .map((d) => SECTIONS[d.id as SectionId].label),
      ...articles.docs
        .filter((d) => {
          const src = d.data().cover?.src;
          return typeof src === "string" && mediaIdFromUrl(src) === id;
        })
        .map((d) => `the article “${String(d.data().title ?? "")}”`),
    ];
    if (usedOn.length) {
      throw new HttpsError(
        "failed-precondition",
        `This picture is on ${usedOn.join(", ")}. Choose another picture there and publish, then delete this one.`,
        { usedOn },
      );
    }
    tx.delete(ref);
    tx.set(db().collection(AUDIT_LOGS).doc(), auditEntry(uid, "site_media.delete", `${MEDIA}/${id}`));
    return String(snap.data()?.path ?? "");
  });

  // After the record: a file with no record is invisible; a record with no
  // file would be a broken picture in the library.
  if (MEDIA_PATH.test(path)) await getStorage().bucket(BUCKET).file(path).delete({ ignoreNotFound: true });
  return { ok: true };
});
