/**
 * Mood check-ins and journal entries.
 *
 * Both live in subcollections under the owning user — `users/{uid}/moodEntries`
 * and `users/{uid}/journalEntries` — which makes the security rule a single uid
 * comparison with no lookups. That placement is the whole privacy story for
 * this data: there is no query that can reach another person's journal, not
 * because we filter it out but because the path does not resolve.
 *
 * Queries here are ordered on one field only, so Firestore's automatic
 * single-field indexes cover them. No composite index, no deploy step.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";
import {
  COLLECTIONS,
  type Consents,
  type JournalEntry,
  type MoodEntry,
  type MoodScore,
} from "./models";

function millis(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number") return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

function moodPath(uid: string) {
  return collection(firestore(), COLLECTIONS.users, uid, COLLECTIONS.moodEntries);
}

function journalPath(uid: string) {
  return collection(firestore(), COLLECTIONS.users, uid, COLLECTIONS.journalEntries);
}

// ------------------------------------------------------------------- mood

/** Tags offered on the check-in. Kept short — a long list becomes a survey. */
export const MOOD_TAGS = [
  "work",
  "study",
  "family",
  "money",
  "health",
  "sleep",
  "relationships",
  "loneliness",
  "faith",
] as const;

export type MoodTag = (typeof MOOD_TAGS)[number];

export async function saveMoodEntry(
  uid: string,
  input: { score: MoodScore; tags: string[]; note: string },
): Promise<void> {
  await addDoc(moodPath(uid), {
    score: input.score,
    tags: input.tags,
    note: input.note.trim(),
    recordedAt: serverTimestamp(),
  });
}

function toMoodEntry(id: string, data: Record<string, unknown>): MoodEntry {
  return {
    id,
    score: (data.score as MoodScore) ?? 3,
    tags: (data.tags as string[]) ?? [],
    note: (data.note as string) ?? "",
    recordedAt: millis(data.recordedAt),
  };
}

/**
 * Live subscription to recent check-ins.
 *
 * Bounded with `limit` deliberately — an unbounded `onSnapshot` on a growing
 * collection re-reads every document on every change and will burn through the
 * free-tier read quota surprisingly fast.
 */
export function watchMoodEntries(
  uid: string,
  cb: (entries: MoodEntry[]) => void,
  max = 60,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(moodPath(uid), orderBy("recordedAt", "desc"), fsLimit(max)),
    (snap) => cb(snap.docs.map((d) => toMoodEntry(d.id, d.data()))),
    () => cb([]),
  );
}

export async function deleteMoodEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(doc(firestore(), COLLECTIONS.users, uid, COLLECTIONS.moodEntries, entryId));
}

/** Local-date key (not UTC) so "today" matches the user's actual day. */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function hasCheckedInToday(entries: MoodEntry[]): boolean {
  const today = dayKey(Date.now());
  return entries.some((e) => dayKey(e.recordedAt) === today);
}

/**
 * Consecutive days ending today or yesterday.
 *
 * Yesterday still counts so that opening the app in the morning does not show
 * a streak already broken — punishing someone for not having checked in yet
 * today is precisely the wrong nudge for this product.
 */
export function moodStreak(entries: MoodEntry[]): number {
  if (entries.length === 0) return 0;

  const days = new Set(entries.map((e) => dayKey(e.recordedAt)));
  const cursor = new Date();

  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function averageMood(entries: MoodEntry[]): number | null {
  if (entries.length === 0) return null;
  return entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
}

// ---------------------------------------------------------------- journal

/** Prompts for people who want to write but do not know where to start. */
export const JOURNAL_PROMPTS = [
  { id: "today", text: "What happened today that is still sitting with you?" },
  { id: "carrying", text: "What are you carrying right now that nobody knows about?" },
  { id: "kind", text: "What would you say to a friend in your situation?" },
  { id: "small", text: "Name one small thing that went better than expected." },
  { id: "body", text: "Where in your body do you feel it, and what does it feel like?" },
  { id: "need", text: "What do you actually need right now — from yourself or someone else?" },
  { id: "dread", text: "What are you dreading, and what is the smallest first step?" },
  { id: "grateful", text: "Who or what made today more bearable?" },
];

function toJournalEntry(id: string, data: Record<string, unknown>): JournalEntry {
  const createdAt = millis(data.createdAt);
  return {
    id,
    title: (data.title as string) ?? "",
    body: (data.body as string) ?? "",
    promptId: (data.promptId as string) ?? null,
    createdAt,
    updatedAt: millis(data.updatedAt, createdAt),
  };
}

export async function createJournalEntry(
  uid: string,
  input: { title: string; body: string; promptId?: string | null },
): Promise<string> {
  const ref = await addDoc(journalPath(uid), {
    title: input.title.trim(),
    body: input.body,
    promptId: input.promptId ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateJournalEntry(
  uid: string,
  entryId: string,
  patch: { title?: string; body?: string },
): Promise<void> {
  await updateDoc(
    doc(firestore(), COLLECTIONS.users, uid, COLLECTIONS.journalEntries, entryId),
    { ...patch, updatedAt: serverTimestamp() },
  );
}

export async function getJournalEntry(
  uid: string,
  entryId: string,
): Promise<JournalEntry | null> {
  const snap = await getDoc(
    doc(firestore(), COLLECTIONS.users, uid, COLLECTIONS.journalEntries, entryId),
  );
  return snap.exists() ? toJournalEntry(snap.id, snap.data()) : null;
}

export function watchJournalEntries(
  uid: string,
  cb: (entries: JournalEntry[]) => void,
  max = 50,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(journalPath(uid), orderBy("createdAt", "desc"), fsLimit(max)),
    (snap) => cb(snap.docs.map((d) => toJournalEntry(d.id, d.data()))),
    () => cb([]),
  );
}

export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(
    doc(firestore(), COLLECTIONS.users, uid, COLLECTIONS.journalEntries, entryId),
  );
}

// ----------------------------------------------------------------- consent

/**
 * Record a consent decision.
 *
 * Writes the current state onto the user document AND appends to an immutable
 * ledger, because "what are they consenting to now" and "what did they agree
 * to, when" are different questions and the second one is the one that matters
 * if anybody ever asks.
 */
export async function recordConsent(
  uid: string,
  key: keyof Consents,
  granted: boolean,
  surface: string,
): Promise<void> {
  const userRef = doc(firestore(), COLLECTIONS.users, uid);

  await updateDoc(userRef, {
    [`consents.${key}`]: granted,
    updatedAt: serverTimestamp(),
  });

  await addDoc(
    collection(firestore(), COLLECTIONS.users, uid, COLLECTIONS.consentEvents),
    { key, granted, surface, recordedAt: serverTimestamp() },
  );
}

// ------------------------------------------------------------ data rights

export type ExportBundle = {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  moodEntries: MoodEntry[];
  journalEntries: JournalEntry[];
};

/**
 * Everything we hold about a user, as one JSON object.
 *
 * Reads are one-shot rather than live, and unbounded on purpose — an export
 * that silently truncated at 50 entries would be worse than no export at all.
 */
export async function exportUserData(uid: string): Promise<ExportBundle> {
  const [profileSnap, moodSnap, journalSnap] = await Promise.all([
    getDoc(doc(firestore(), COLLECTIONS.users, uid)),
    getDocs(query(moodPath(uid), orderBy("recordedAt", "desc"))),
    getDocs(query(journalPath(uid), orderBy("createdAt", "desc"))),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profileSnap.exists() ? profileSnap.data() : null,
    moodEntries: moodSnap.docs.map((d) => toMoodEntry(d.id, d.data())),
    journalEntries: journalSnap.docs.map((d) => toJournalEntry(d.id, d.data())),
  };
}

/**
 * Delete all wellbeing data, leaving the account itself intact.
 *
 * Firestore does not cascade — deleting `users/{uid}` orphans its
 * subcollections rather than removing them, so they must be cleared explicitly
 * and first. Getting this order wrong leaves journal entries in the database
 * belonging to an account that no longer exists.
 */
export async function deleteWellbeingData(uid: string): Promise<void> {
  const [moodSnap, journalSnap] = await Promise.all([
    getDocs(moodPath(uid)),
    getDocs(journalPath(uid)),
  ]);

  await Promise.all([
    ...moodSnap.docs.map((d) => deleteDoc(d.ref)),
    ...journalSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);
}

