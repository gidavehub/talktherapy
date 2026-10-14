/**
 * The content editor's side of the CMS, in the browser: watching what is
 * live and what is being drafted, saving drafts, publishing, putting an old
 * version back, and the media library.
 *
 * Drafts are written straight to siteContentDrafts (staff-only in
 * firestore.rules). Everything that changes the public site — publishing,
 * reverting, adding or removing an image — goes through the functions in
 * functions/src/content.ts, which check the caller is staff, validate with
 * the same ./validate, and write the audit log. After a publish the public
 * pages are refreshed through /api/revalidate, so the change shows at once.
 */

import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { deleteObject, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseConfigured, firebaseFunctions, firebaseStorage, firestore } from "../firebase";
import { ensureStaffFileAccess } from "../providerApplication-client";
import {
  BUILT_IN_IMAGES,
  CONTENT_COLLECTIONS,
  MEDIA_MAX_BYTES,
  MEDIA_SNIFF_BYTES,
  MEDIA_TYPES,
  SECTION_IDS,
  isMediaUsage,
  isSectionId,
  mediaTypeOf,
  type ContentOf,
  type ContentVersion,
  type MediaType,
  type SectionId,
  type SiteMedia,
} from "./schema";
import { shapeSection, type Issue } from "./validate";

// ------------------------------------------------------------------- types

export type PublishedState<S extends SectionId> = {
  data: ContentOf<S>;
  rev: number;
  publishedAt: number;
};

export type DraftState<S extends SectionId> = {
  data: ContentOf<S>;
  /** The published rev the draft started from. */
  baseRev: number;
  updatedAt: number;
  updatedBy: string;
};

/** One section's line on the editor's index: live or not, and any draft waiting. */
export type SectionStatus = {
  id: SectionId;
  /** Null while nothing has been published: the built-in defaults are showing. */
  rev: number | null;
  publishedAt: number | null;
  /**
   * The built-in words are showing: nothing published yet, or the original
   * put back from the history (published, but as "the defaults").
   */
  original: boolean;
  draft: { updatedAt: number; updatedBy: string; baseRev: number } | null;
};

/** What every change to the public site answers with. */
export type ContentResult<T = object> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      /** Problems by field, when the content itself was refused. Match on `key`. */
      issues: Issue[];
      /**
       * The callable's reason, without the "functions/" prefix: "aborted" when
       * somebody else published since the draft began. Null when not known.
       */
      code: string | null;
    };

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A callable's refusal as the editor shows it: its message, the problems by field, and its reason. */
export function failure(error: unknown, fallback: string): { ok: false; error: string; issues: Issue[]; code: string | null } {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message.replace(/^Firebase:\s*/, "")
      : "";
  const details = error && typeof error === "object" && "details" in error ? error.details : null;
  const issues =
    details && typeof details === "object" && "errors" in details && Array.isArray(details.errors)
      ? (details.errors as Issue[])
      : [];
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code.replace(/^functions\//, "")
      : null;
  return { ok: false, error: message || fallback, issues, code };
}

// ------------------------------------------------------------------ reading

/** The live content of one section, as the editor starts from it. Null while the defaults show. */
export function watchPublished<S extends SectionId>(
  id: S,
  onChange: (published: PublishedState<S> | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), CONTENT_COLLECTIONS.published, id),
    (snap) => {
      const raw = snap.data();
      onChange(
        raw ? { data: shapeSection(id, raw.data), rev: num(raw.rev), publishedAt: num(raw.publishedAt) } : null,
      );
    },
    (error) => onError?.(error),
  );
}

/** The draft of one section, as it is saved — by this person or another member of staff. */
export function watchDraft<S extends SectionId>(
  id: S,
  onChange: (draft: DraftState<S> | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), CONTENT_COLLECTIONS.drafts, id),
    (snap) => {
      const raw = snap.data();
      onChange(
        raw
          ? {
              data: shapeSection(id, raw.data),
              baseRev: num(raw.baseRev),
              updatedAt: num(raw.updatedAt),
              updatedBy: str(raw.updatedBy),
            }
          : null,
      );
    },
    (error) => onError?.(error),
  );
}

/** Every section's status, for the editor's index. One listener on each collection. */
export function watchSectionStatuses(
  onChange: (statuses: Record<SectionId, SectionStatus>) => void,
  onError?: (error: Error) => void,
): () => void {
  const statuses = Object.fromEntries(
    SECTION_IDS.map((id) => [id, { id, rev: null, publishedAt: null, original: true, draft: null }]),
  ) as Record<SectionId, SectionStatus>;
  if (!firebaseConfigured()) {
    onChange(statuses);
    return () => {};
  }

  let published = false;
  let drafts = false;
  const emit = () => {
    // Both halves first: a page of "nothing published" that then fills in
    // would be a flash of wrong answers.
    if (published && drafts) onChange({ ...statuses });
  };

  const stopPublished = onSnapshot(
    collection(firestore(), CONTENT_COLLECTIONS.published),
    (snap) => {
      for (const id of SECTION_IDS) statuses[id] = { ...statuses[id], rev: null, publishedAt: null, original: true };
      snap.forEach((d) => {
        if (!isSectionId(d.id)) return;
        const raw = d.data();
        statuses[d.id] = {
          ...statuses[d.id],
          rev: num(raw.rev),
          publishedAt: num(raw.publishedAt),
          original: raw.data == null,
        };
      });
      published = true;
      emit();
    },
    (error) => onError?.(error),
  );
  const stopDrafts = onSnapshot(
    collection(firestore(), CONTENT_COLLECTIONS.drafts),
    (snap) => {
      for (const id of SECTION_IDS) statuses[id] = { ...statuses[id], draft: null };
      snap.forEach((d) => {
        if (!isSectionId(d.id)) return;
        const raw = d.data();
        statuses[d.id] = {
          ...statuses[d.id],
          draft: { updatedAt: num(raw.updatedAt), updatedBy: str(raw.updatedBy), baseRev: num(raw.baseRev) },
        };
      });
      drafts = true;
      emit();
    },
    (error) => onError?.(error),
  );
  return () => {
    stopPublished();
    stopDrafts();
  };
}

/**
 * What a section showed before each change to it, newest first: the things
 * "Put this back" can restore. Sorted here rather than by the query, so the
 * query needs no composite index.
 */
export function watchVersions(
  id: SectionId,
  onChange: (versions: ContentVersion[]) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), CONTENT_COLLECTIONS.versions), where("sectionId", "==", id)),
    (snap) => {
      const versions = snap.docs.map((d): ContentVersion => {
        const raw = d.data();
        return {
          id: d.id,
          sectionId: id,
          data: raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : null,
          rev: num(raw.rev),
          publishedAt: typeof raw.publishedAt === "number" ? raw.publishedAt : null,
          replacedAt: num(raw.replacedAt),
          replacedBy: str(raw.replacedBy),
          action: raw.action === "revert" ? "revert" : "publish",
          note: typeof raw.note === "string" ? raw.note : null,
        };
      });
      onChange(versions.sort((a, b) => b.replacedAt - a.replacedAt));
    },
    (error) => onError?.(error),
  );
}

/** The latest change to a section: who made it, when, and what they said about it. */
export type LastChange = {
  at: number;
  by: string;
  action: ContentVersion["action"];
  note: string | null;
};

/** How far back the editor's index looks for who changed each section. */
const RECENT_CHANGES = 100;

/**
 * Who last published (or put back) each section, for the editor's index. A
 * published document holds no names — it is public — so this is read from
 * the versions, where each change is recorded by whoever made it. Only the
 * latest hundred changes are read; a section changed longer ago than that
 * has no entry, and the index shows its time alone.
 */
export function watchRecentChanges(
  onChange: (changes: Partial<Record<SectionId, LastChange>>) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange({});
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), CONTENT_COLLECTIONS.versions), orderBy("replacedAt", "desc"), limit(RECENT_CHANGES)),
    (snap) => {
      const latest: Partial<Record<SectionId, LastChange>> = {};
      snap.forEach((d) => {
        const raw = d.data();
        const id = raw.sectionId;
        // Newest first, so the first one seen for a section is its latest.
        if (!isSectionId(id) || latest[id]) return;
        latest[id] = {
          at: num(raw.replacedAt),
          by: str(raw.replacedBy),
          action: raw.action === "revert" ? "revert" : "publish",
          note: typeof raw.note === "string" ? raw.note : null,
        };
      });
      onChange(latest);
    },
    (error) => onError?.(error),
  );
}

const names = new Map<string, Promise<string>>();

/**
 * Staff members' names, by uid, for "published by" and "saved by". Each is
 * looked up once a session. Someone with no name on their account, or whose
 * account cannot be read, is "a member of staff".
 */
export async function staffNames(uids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(uids.filter((uid) => /^[A-Za-z0-9_-]{1,128}$/.test(uid)))];
  const found = await Promise.all(
    wanted.map((uid) => {
      let name = names.get(uid);
      if (!name) {
        name = getDoc(doc(firestore(), "users", uid))
          .then((snap) => str(snap.data()?.displayName).trim() || "A member of staff")
          .catch(() => {
            // Not kept: a failure on a bad connection should be asked again later.
            names.delete(uid);
            return "A member of staff";
          });
        names.set(uid, name);
      }
      return name;
    }),
  );
  return Object.fromEntries(wanted.map((uid, i) => [uid, found[i]]));
}

// ------------------------------------------------------------------ preview

/**
 * The preview's switches, one after another: an "off" from a closing editor
 * must not land after the "on" from the next one, or its preview would show
 * the live site instead of the drafts.
 */
let previewQueue: Promise<unknown> = Promise.resolve();

/** A sign-in with less than this left is renewed before the preview is started on it. */
const PREVIEW_FRESH_MS = 15 * 60_000;

function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = previewQueue.then(task, task);
  previewQueue = run.catch(() => undefined);
  return run;
}

/**
 * Turn on the editor's preview for this browser: the public pages, opened
 * here, show the drafts (see app/api/preview). Resolves with when it stops
 * working — the sign-in it rests on lasts an hour — or null if it was refused.
 */
export function startPreview(): Promise<number | null> {
  return queued(async () => {
    const user = firebaseAuth().currentUser;
    if (!user) return null;
    try {
      // The preview lasts as long as the sign-in handed to it. One with only
      // minutes left would stop working almost at once, so take a fresh one.
      const current = await user.getIdTokenResult();
      const ending = Date.parse(current.expirationTime) - Date.now() < PREVIEW_FRESH_MS;
      const token = ending ? await user.getIdToken(true) : current.token;
      const res = await fetch("/api/preview", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const body = (await res.json()) as { expiresAt?: unknown };
      return typeof body.expiresAt === "number" ? body.expiresAt : null;
    } catch {
      return null;
    }
  });
}

async function previewOff(): Promise<void> {
  try {
    // keepalive: this is sent as the editor closes, and must outlive it.
    await fetch("/api/preview", { method: "DELETE", keepalive: true });
  } catch {
    // The sign-in in the cookie stops working within the hour regardless.
  }
}

/**
 * Turn the preview off, so the public pages in this browser show what
 * visitors see. `now` sends it at once rather than after any switch still on
 * its way — for a tab that is closing, which will not wait.
 */
export function endPreview(now = false): Promise<void> {
  return now ? previewOff() : queued(previewOff);
}

// ------------------------------------------------------------------- drafts

/**
 * Save the draft of a section. Call it as people type (debounced); it
 * overwrites the whole draft, so the last save is the draft.
 */
export async function saveDraft<S extends SectionId>(id: S, data: ContentOf<S>, baseRev: number): Promise<void> {
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save.");
  await setDoc(doc(firestore(), CONTENT_COLLECTIONS.drafts, id), {
    data,
    baseRev,
    updatedAt: Date.now(),
    updatedBy: uid,
  });
}

/** Throw the draft away; the editor goes back to what is live. */
export async function discardDraft(id: SectionId): Promise<void> {
  await deleteDoc(doc(firestore(), CONTENT_COLLECTIONS.drafts, id));
}

// ---------------------------------------------------------- the public site

/**
 * Make the public pages show what was just published, now rather than within
 * five minutes. False if it did not go through — the change still appears on
 * its own within five minutes.
 */
export async function refreshPublicSite(sections: SectionId[]): Promise<boolean> {
  const token = await firebaseAuth().currentUser?.getIdToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/revalidate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Publish a section. The function validates it again and refuses it with the
 * problems by field (`issues`); `expectedRev` refuses it if somebody else
 * published since this person started. The draft is cleared on success.
 * `refreshed` is false when the public pages will take up to five minutes.
 */
export async function publishSection<S extends SectionId>(
  id: S,
  data: ContentOf<S>,
  options: { note?: string; expectedRev?: number } = {},
): Promise<ContentResult<{ rev: number; publishedAt: number; refreshed: boolean }>> {
  try {
    const result = await httpsCallable<
      { sectionId: SectionId; data: ContentOf<S>; note?: string; expectedRev?: number },
      { rev: number; publishedAt: number }
    >(firebaseFunctions(), "publishContent")({ sectionId: id, data, ...options });
    const refreshed = await refreshPublicSite([id]);
    return { ok: true, rev: result.data.rev, publishedAt: result.data.publishedAt, refreshed };
  } catch (error) {
    return failure(error, "It did not publish. Check your connection and try again.");
  }
}

/** Put back what a section showed before a change (a version from watchVersions). */
export async function revertSection(
  id: SectionId,
  versionId: string,
): Promise<ContentResult<{ rev: number; refreshed: boolean }>> {
  try {
    const result = await httpsCallable<{ sectionId: SectionId; versionId: string }, { rev: number }>(
      firebaseFunctions(),
      "revertContent",
    )({ sectionId: id, versionId });
    const refreshed = await refreshPublicSite([id]);
    return { ok: true, rev: result.data.rev, refreshed };
  } catch (error) {
    return failure(error, "That version was not put back. Try again.");
  }
}

// -------------------------------------------------------------------- media

function toMedia(id: string, raw: Record<string, unknown>): SiteMedia {
  return {
    id,
    url: str(raw.url),
    path: str(raw.path),
    alt: str(raw.alt),
    width: num(raw.width),
    height: num(raw.height),
    bytes: num(raw.bytes),
    type: (str(raw.type) || "image/webp") as MediaType,
    uploadedBy: str(raw.uploadedBy),
    createdAt: num(raw.createdAt),
    usage: Array.isArray(raw.usage) ? raw.usage.filter(isMediaUsage) : [],
  };
}

/** The media library, newest first. */
export function watchMedia(onChange: (media: SiteMedia[]) => void, onError?: (error: Error) => void): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), CONTENT_COLLECTIONS.media), orderBy("createdAt", "desc")),
    (snap) => onChange(snap.docs.map((d) => toMedia(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

/** One picture as the MediaLibrary picker (app/components/ui/MediaLibrary) takes it. */
export type PickerItem = { id: string; src: string; alt: string; width?: number; height?: number };

/** The uploaded pictures in the shape the MediaLibrary picker takes. */
export function mediaItems(media: SiteMedia[]): PickerItem[] {
  return media.map((m) => ({ id: m.id, src: m.url, alt: m.alt, width: m.width, height: m.height }));
}

/**
 * Everything an image field may show: the uploads, newest first, then the
 * pictures that ship with the site. A built-in picture's id is its address,
 * and it has no stored description — the field keeps its own.
 */
export function pickerItems(media: SiteMedia[]): PickerItem[] {
  return [...mediaItems(media), ...BUILT_IN_IMAGES.map((src) => ({ id: src, src, alt: "" }))];
}

/** Why a file cannot be uploaded to the library, or null. */
export function checkMediaFile(file: File): string | null {
  if (!(file.type in MEDIA_TYPES)) return "Use a JPG, PNG, WebP or AVIF picture.";
  if (file.size === 0) return "That file is empty. Choose the picture again.";
  if (file.size > MEDIA_MAX_BYTES) return "That picture is over 8 MB. Make it smaller and try again.";
  return null;
}

async function dimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Upload a picture to the library and register it. A new name every time, so
 * an address that is on the site never starts showing a different picture.
 */
export async function uploadMedia(
  file: File,
  alt: string,
  onProgress: (fraction: number) => void = () => {},
): Promise<ContentResult<{ media: SiteMedia }>> {
  const problem = checkMediaFile(file);
  if (problem) return { ok: false, error: problem, issues: [], code: null };
  // storage.rules lets staff upload by the admin claim on their sign-in.
  if (!(await ensureStaffFileAccess())) {
    return {
      ok: false,
      error: "Your sign-in could not be confirmed as staff. Sign out and in again.",
      issues: [],
      code: "permission-denied",
    };
  }

  const type = file.type as MediaType;
  // The function checks the file's own first bytes after the upload; asking
  // here first spares sending 8 MB only to have it refused.
  const head = new Uint8Array(await file.slice(0, MEDIA_SNIFF_BYTES).arrayBuffer());
  if (mediaTypeOf(head) !== type) {
    return {
      ok: false,
      error: "That file is not the kind of picture its name says. Save it again as a JPG, PNG, WebP or AVIF.",
      issues: [],
      code: null,
    };
  }
  const id = crypto.randomUUID().replace(/-/g, "");
  const path = `site-media/${id}.${MEDIA_TYPES[type][0]}`;
  const ref = storageRef(firebaseStorage(), path);

  try {
    const { width, height } = await dimensions(file);
    const task = uploadBytesResumable(ref, file, {
      contentType: type,
      // The name never changes what it holds, so browsers may keep it for good.
      cacheControl: "public, max-age=31536000, immutable",
    });
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
        reject,
        () => resolve(),
      );
    });
    const result = await httpsCallable<
      { path: string; alt: string; width: number; height: number },
      { media: SiteMedia }
    >(firebaseFunctions(), "registerSiteMedia")({ path, alt, width, height });
    return { ok: true, media: result.data.media };
  } catch (error) {
    // A file that is not in the library is a file nobody can find to delete.
    await deleteObject(ref).catch(() => undefined);
    return failure(error, "The picture did not upload. Check your connection and try again.");
  }
}

/** Change a picture's description in the library. Pages that show it keep their own. */
export async function updateMediaAlt(id: string, alt: string): Promise<ContentResult> {
  try {
    await httpsCallable(firebaseFunctions(), "updateSiteMedia")({ id, alt });
    return { ok: true };
  } catch (error) {
    return failure(error, "The description was not saved. Try again.");
  }
}

/** Delete a picture. Refused while a published section shows it. */
export async function deleteMedia(id: string): Promise<ContentResult> {
  try {
    await httpsCallable(firebaseFunctions(), "deleteSiteMedia")({ id });
    return { ok: true };
  } catch (error) {
    return failure(error, "The picture was not deleted. Try again.");
  }
}
