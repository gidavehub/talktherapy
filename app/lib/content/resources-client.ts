/**
 * The article editor in the browser: watching an article, its draft and its
 * history, saving, publishing, taking down and putting back. (What the
 * dashboard reads — the published articles — is ./resources-feed, kept apart
 * so the patient's home screen does not carry the editor's code.)
 *
 * Drafts are written straight to resourceDrafts (staff-only in
 * firestore.rules). Everything that changes the public site goes through
 * publishResource, unpublishResource and revertResource in
 * functions/src/content.ts, which check the caller is staff, validate with
 * the same ./resources and write the audit log; the public pages are then
 * refreshed through /api/revalidate.
 */

import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { ResourceTopic } from "../models";
import { firebaseAuth, firebaseConfigured, firebaseFunctions, firestore } from "../firebase";
import { failure, refreshPublicSite, type ContentResult } from "./client";
import {
  RESOURCE_COLLECTIONS,
  SEED_IDS,
  isResourceId,
  seedById,
  seedContent,
  shapeResource,
  type EditableFormat,
  type ResourceContent,
  type ResourceDraftDoc,
  type ResourceVersion,
} from "./resources";

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" ? v : "");

// ------------------------------------------------------------------- types

/** resources/{id} as the editor reads it. Null: no document — a starter article from code, or a new one. */
export type ResourceLive =
  | { status: "published"; data: ResourceContent; rev: number; publishedAt: number; updatedAt: number }
  | { status: "withdrawn" | "original"; rev: number; updatedAt: number };

export type ResourceDraftState = ResourceDraftDoc;

/** One article's line in the editor's list. */
export type ResourceRow = {
  id: string;
  title: string;
  slug: string;
  format: EditableFormat;
  topics: ResourceTopic[];
  readingMinutes: number;
  cover: string;
  /** On the public site now. */
  live: boolean;
  /** The address it is live at — taken, for every other article — or null while it is not live. */
  liveSlug: string | null;
  /** A starter article still showing its words from code. */
  original: boolean;
  draft: { updatedAt: number; updatedBy: string } | null;
  /** When what is live went live, or null while it is not. */
  publishedAt: number | null;
  /** The latest change of any kind: a save, a publish, a take-down. */
  changedAt: number;
};

/** A new article's id: chosen in the browser, so its first draft can be saved straight away. */
export function newResourceId(): string {
  return doc(collection(firestore(), RESOURCE_COLLECTIONS.drafts)).id;
}

function toLive(raw: Record<string, unknown>): ResourceLive | null {
  if (raw.status === "published") {
    return {
      status: "published",
      data: shapeResource(raw),
      rev: num(raw.rev),
      publishedAt: num(raw.publishedAt),
      updatedAt: num(raw.updatedAt),
    };
  }
  if (raw.status === "withdrawn" || raw.status === "original") {
    return { status: raw.status, rev: num(raw.rev), updatedAt: num(raw.updatedAt) };
  }
  return null;
}

function toDraft(raw: Record<string, unknown>): ResourceDraftState {
  return { data: shapeResource(raw.data), baseRev: num(raw.baseRev), updatedAt: num(raw.updatedAt), updatedBy: str(raw.updatedBy) };
}

// ------------------------------------------------------------------ reading

/** What the site shows for one article, as stored. Null when it has no document. */
export function watchResource(
  id: string,
  onChange: (live: ResourceLive | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), RESOURCE_COLLECTIONS.published, id),
    (snap) => {
      const raw = snap.data();
      onChange(raw ? toLive(raw) : null);
    },
    (error) => onError?.(error),
  );
}

/** One article's draft, as saved — by this person or another member of staff. */
export function watchResourceDraft(
  id: string,
  onChange: (draft: ResourceDraftState | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), RESOURCE_COLLECTIONS.drafts, id),
    (snap) => {
      const raw = snap.data();
      onChange(raw ? toDraft(raw) : null);
    },
    (error) => onError?.(error),
  );
}

/** What each change to an article replaced, newest first. Sorted here, so the query needs no index. */
export function watchResourceVersions(
  id: string,
  onChange: (versions: ResourceVersion[]) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), RESOURCE_COLLECTIONS.versions), where("resourceId", "==", id)),
    (snap) => {
      const versions = snap.docs.map((d): ResourceVersion => {
        const raw = d.data();
        return {
          id: d.id,
          resourceId: id,
          live: raw.live === true,
          data: raw.data && typeof raw.data === "object" ? shapeResource(raw.data) : null,
          title: str(raw.title),
          rev: num(raw.rev),
          publishedAt: typeof raw.publishedAt === "number" ? raw.publishedAt : null,
          replacedAt: num(raw.replacedAt),
          replacedBy: str(raw.replacedBy),
          action: raw.action === "unpublish" || raw.action === "revert" ? raw.action : "publish",
          note: typeof raw.note === "string" ? raw.note : null,
        };
      });
      onChange(versions.sort((a, b) => b.replacedAt - a.replacedAt));
    },
    (error) => onError?.(error),
  );
}

/**
 * Every article for the editor's list: the starter set, everything stored,
 * every draft. A new article whose draft was thrown away before it was ever
 * published is gone, and is not listed.
 */
export function watchResourceIndex(onChange: (rows: ResourceRow[]) => void, onError?: (error: Error) => void): () => void {
  let stored: Map<string, Record<string, unknown>> | null = null;
  let drafts: Map<string, Record<string, unknown>> | null = null;

  const emit = () => {
    // Both halves first, so the list never shows a draft as an article that is not live.
    if (!stored || !drafts) return;
    const rows: ResourceRow[] = [];
    for (const id of new Set([...SEED_IDS, ...stored.keys(), ...drafts.keys()])) {
      const row = toRow(id, stored.get(id), drafts.get(id));
      if (row) rows.push(row);
    }
    onChange(rows);
  };

  if (!firebaseConfigured()) {
    stored = new Map();
    drafts = new Map();
    emit();
    return () => {};
  }

  const collect = (name: string, set: (docs: Map<string, Record<string, unknown>>) => void) =>
    onSnapshot(
      collection(firestore(), name),
      (snap) => {
        const docs = new Map<string, Record<string, unknown>>();
        snap.forEach((d) => {
          if (isResourceId(d.id)) docs.set(d.id, d.data());
        });
        set(docs);
        emit();
      },
      (error) => onError?.(error),
    );
  const stopStored = collect(RESOURCE_COLLECTIONS.published, (docs) => (stored = docs));
  const stopDrafts = collect(RESOURCE_COLLECTIONS.drafts, (docs) => (drafts = docs));
  return () => {
    stopStored();
    stopDrafts();
  };
}

function toRow(id: string, storedRaw: Record<string, unknown> | undefined, draftRaw: Record<string, unknown> | undefined): ResourceRow | null {
  const seed = seedById(id);
  const live = storedRaw ? toLive(storedRaw) : null;
  const draft = draftRaw ? toDraft(draftRaw) : null;
  const published = live?.status === "published" ? live : null;
  const original = Boolean(seed) && (!storedRaw || live?.status === "original");
  const isLive = Boolean(published) || original;
  if (!isLive && !draft && !seed) return null;

  const words = draft?.data ?? published?.data ?? (seed ? seedContent(seed) : null);
  if (!words) return null;
  return {
    id,
    title: words.title,
    slug: words.slug,
    format: words.format,
    topics: words.topics,
    readingMinutes: words.readingMinutes,
    cover: words.cover.src,
    live: isLive,
    liveSlug: published ? published.data.slug : original && seed ? seed.slug : null,
    original,
    draft: draft ? { updatedAt: draft.updatedAt, updatedBy: draft.updatedBy } : null,
    publishedAt: published ? published.publishedAt : original && seed ? seed.publishedAt : null,
    changedAt: Math.max(draft?.updatedAt ?? 0, live?.updatedAt ?? 0, seed && original ? seed.updatedAt : 0),
  };
}

// ------------------------------------------------------------------- drafts

/** Save an article's draft. Called as people type (debounced); the last save is the draft. */
export async function saveResourceDraft(id: string, data: ResourceContent, baseRev: number): Promise<void> {
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save.");
  await setDoc(doc(firestore(), RESOURCE_COLLECTIONS.drafts, id), {
    data,
    baseRev,
    updatedAt: Date.now(),
    updatedBy: uid,
  } satisfies ResourceDraftDoc);
}

/** Throw an article's draft away. */
export async function discardResourceDraft(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), RESOURCE_COLLECTIONS.drafts, id));
}

// ---------------------------------------------------------- the public site

type Changed = ContentResult<{ rev: number; refreshed: boolean }>;

/**
 * Publish an article. The function validates it again and refuses it with
 * the problems by field (`issues`); `expectedRev` refuses it when somebody
 * else changed the article since this draft began ("aborted").
 */
export async function publishResource(
  id: string,
  data: ResourceContent,
  options: { note?: string; expectedRev?: number } = {},
): Promise<Changed> {
  try {
    const result = await httpsCallable<
      { id: string; data: ResourceContent; note?: string; expectedRev?: number },
      { rev: number }
    >(firebaseFunctions(), "publishResource")({ id, data, ...options });
    return { ok: true, rev: result.data.rev, refreshed: await refreshPublicSite(["resources"]) };
  } catch (error) {
    return failure(error, "It did not publish. Check your connection and try again.");
  }
}

/** Take an article off the site. Its words stay, as a draft, to publish again. */
export async function unpublishResource(id: string, options: { note?: string; expectedRev?: number } = {}): Promise<Changed> {
  try {
    const result = await httpsCallable<{ id: string; note?: string; expectedRev?: number }, { rev: number }>(
      firebaseFunctions(),
      "unpublishResource",
    )({ id, ...options });
    return { ok: true, rev: result.data.rev, refreshed: await refreshPublicSite(["resources"]) };
  } catch (error) {
    return failure(error, "It was not taken down. Check your connection and try again.");
  }
}

/** Put back what an article showed before a change (a version from watchResourceVersions). */
export async function revertResource(id: string, versionId: string): Promise<Changed> {
  try {
    const result = await httpsCallable<{ id: string; versionId: string }, { rev: number }>(
      firebaseFunctions(),
      "revertResource",
    )({ id, versionId });
    return { ok: true, rev: result.data.rev, refreshed: await refreshPublicSite(["resources"]) };
  } catch (error) {
    return failure(error, "That version was not put back. Try again.");
  }
}
