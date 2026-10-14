/**
 * The browser's side of a provider application: reading and saving the
 * draft, uploading the photo and documents, sending it — and, for staff,
 * reading applications and recording what they make of them.
 *
 * What the application may contain and when it is complete lives in
 * ./providerApplication, shared with the functions. This file only moves it.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getBlob, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, firebaseFunctions, firebaseStorage, firestore } from "./firebase";
import { fileToCompressedDataUrl } from "./base64";
import { areaOf, type Area } from "./matching";
import { HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR, type Locale } from "./models";
import {
  EMPTY_SECTIONS,
  toApplication,
  type ApplicationDocument,
  type ApplicationSections,
  type DocType,
  type ProviderApplication,
  type StepId,
} from "./providerApplication";

const APPLICATIONS = "providerApplications";
const REVIEWS = "providerReviews";

function appRef(uid: string) {
  return doc(firestore(), APPLICATIONS, uid);
}

/** A short random id for a document, a qualification or a stretch of hours. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}${random}`;
}

// ------------------------------------------------------------------ reading

/** The applicant's own application, live. Null when they have not started one. */
export function watchApplication(
  uid: string,
  onChange: (app: ProviderApplication | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    appRef(uid),
    (snap) => onChange(snap.exists() ? toApplication(snap.id, snap.data()) : null),
    (error) => onError?.(error),
  );
}

// ------------------------------------------------------------------ writing

/**
 * Start an application, if there is not one already.
 *
 * Seeded with what we already know, so nobody types their name twice: the
 * account's name, and — for a provider who filled in the old profile form
 * before applications existed — everything that form held.
 */
export async function startApplication(uid: string, accountName: string | null): Promise<void> {
  const ref = appRef(uid);
  if ((await getDoc(ref)).exists()) return;

  const sections: ApplicationSections = structuredClone(EMPTY_SECTIONS);
  sections.personal.displayName = (accountName ?? "").trim().slice(0, 60);
  sections.personal.legalName = (accountName ?? "").trim().slice(0, 100);

  try {
    const old = await getDoc(doc(firestore(), "providerProfiles", uid));
    const data = old.exists() ? old.data() : null;
    if (data) {
      const town = typeof data.location === "string" ? data.location : "";
      sections.personal.displayName = String(data.displayName ?? sections.personal.displayName).slice(0, 60);
      sections.personal.gender = data.gender === "woman" || data.gender === "man" ? data.gender : null;
      sections.personal.town = town;
      sections.personal.area = (areaOf(town) as Area | null) ?? null;
      sections.professional.services = Array.isArray(data.services) ? data.services : [];
      sections.professional.languages = Array.isArray(data.languages) ? (data.languages as Locale[]) : [];
      sections.professional.specializations = Array.isArray(data.specializations) ? data.specializations : [];
      sections.professional.yearsExperience = typeof data.yearsExperience === "number" ? data.yearsExperience : null;
      sections.practice.headline = String(data.headline ?? "").slice(0, 80);
      sections.practice.bio = String(data.bio ?? "").slice(0, 600);
      const fee = typeof data.sessionRateMinor === "number" ? data.sessionRateMinor : null;
      sections.fee.sessionRateMinor =
        fee != null && fee >= HUMAN_RATE_MIN_MINOR && fee <= HUMAN_RATE_MAX_MINOR ? fee : null;
    }
  } catch {
    // An unreadable old listing is not a reason to stop somebody applying.
  }

  const now = Date.now();
  await setDoc(ref, {
    uid,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    lastStep: "personal" satisfies StepId,
    ...sections,
  });
}

/**
 * Save sections of the application in one write. Rules allow it only while
 * the application is a draft or has been sent back for changes.
 */
export async function saveSections(
  uid: string,
  sections: Partial<ApplicationSections>,
  lastStep: StepId,
): Promise<void> {
  await updateDoc(appRef(uid), { ...sections, lastStep, updatedAt: Date.now() });
}

/** Remember where they got to, so "continue" opens the right step. */
export async function saveLastStep(uid: string, lastStep: StepId): Promise<void> {
  await updateDoc(appRef(uid), { lastStep, updatedAt: Date.now() });
}

// ------------------------------------------------------------------- files

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload one document. Resolves with the line to add to the application —
 * which the caller saves, so a file is only ever listed once it has arrived.
 */
export function uploadDocument(
  uid: string,
  file: File,
  type: DocType,
  onProgress: (fraction: number) => void,
): Promise<ApplicationDocument> {
  const id = newId("d");
  const path = `provider-credentials/${uid}/${id}.${EXTENSIONS[file.type] ?? "bin"}`;
  const task = uploadBytesResumable(storageRef(firebaseStorage(), path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () =>
        resolve({
          id,
          type,
          name: file.name.slice(0, 200),
          path,
          contentType: file.type,
          bytes: file.size,
          uploadedAt: Date.now(),
        }),
    );
  });
}

/**
 * The applicant's photo: squared up to a sensible size in the browser first
 * (a phone's 4 MB original is a slow upload on a Gambian connection, and
 * nobody needs it), then stored privately with the documents. It is copied to
 * the public directory only when the application is approved.
 */
export async function uploadApplicationPhoto(
  uid: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const dataUrl = await fileToCompressedDataUrl(file, { maxDimension: 800, quality: 0.86, mime: "image/jpeg" });
  const blob = await (await fetch(dataUrl)).blob();
  const path = `provider-credentials/${uid}/photo.jpg`;
  const task = uploadBytesResumable(storageRef(firebaseStorage(), path), blob, { contentType: "image/jpeg" });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () => resolve(),
    );
  });
  return path;
}

/** Remove a stored file. A file already gone is not an error. */
export async function deleteStoredFile(path: string): Promise<void> {
  try {
    await deleteObject(storageRef(firebaseStorage(), path));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (!code.includes("object-not-found")) throw error;
  }
}

/**
 * A private file, to show or open: fetched through the Storage rules (owner
 * or staff) and handed back as a local object URL. Never a download URL —
 * that is a link anyone it is forwarded to could open, for ever.
 */
export async function privateFileUrl(path: string): Promise<string> {
  const blob = await getBlob(storageRef(firebaseStorage(), path));
  return URL.createObjectURL(blob);
}

// ------------------------------------------------------------------ sending

function callableMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message.replace(/^Firebase:\s*/, "") || fallback;
  }
  return fallback;
}

/** Send the application to staff. The function checks everything again. */
export async function submitApplication(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await httpsCallable(firebaseFunctions(), "submitProviderApplication")({});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: callableMessage(error, "It did not send. Check your connection and try again.") };
  }
}

// -------------------------------------------------------------------- staff

/** Every application, newest activity first. Staff only (firestore.rules). */
export function watchApplications(
  onChange: (apps: ProviderApplication[]) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), APPLICATIONS), orderBy("updatedAt", "desc"), limit(500)),
    (snap) => onChange(snap.docs.map((d) => toApplication(d.id, d.data()))),
    (error) => onError?.(error),
  );
}

export type ReviewDecision = "start_review" | "request_changes" | "approve" | "reject" | "suspend" | "reinstate";

export async function decideApplication(
  uid: string,
  action: ReviewDecision,
  message = "",
): Promise<{ ok: true; slots: number } | { ok: false; error: string }> {
  try {
    const result = await httpsCallable<
      { uid: string; action: ReviewDecision; message: string },
      { status: string; slots: number }
    >(firebaseFunctions(), "reviewProviderApplication")({ uid, action, message });
    return { ok: true, slots: result.data.slots ?? 0 };
  } catch (error) {
    return { ok: false, error: callableMessage(error, "That did not go through. Try again.") };
  }
}

/** What staff checked on one application. Never readable by the applicant. */
export const REVIEW_CHECKS = [
  { id: "identity", label: "Identity matches the ID document" },
  { id: "qualifications", label: "Qualifications match the certificates" },
  { id: "registration", label: "Registration checked with the body named" },
  { id: "references", label: "References contacted, or not needed" },
  { id: "photo", label: "Photo is clear and suitable" },
  { id: "profile", label: "Profile words are accurate and appropriate" },
] as const;
export type ReviewCheckId = (typeof REVIEW_CHECKS)[number]["id"];

export type DocVerdict = "verified" | "unclear" | "missing";

export type StaffReview = {
  checks: Partial<Record<ReviewCheckId, boolean>>;
  documents: Record<string, DocVerdict>;
};

export function watchStaffReview(uid: string, onChange: (review: StaffReview) => void): () => void {
  return onSnapshot(doc(firestore(), REVIEWS, uid), (snap) => {
    const data = snap.data() ?? {};
    onChange({
      checks: (data.checks ?? {}) as StaffReview["checks"],
      documents: (data.documents ?? {}) as StaffReview["documents"],
    });
  });
}

export async function saveStaffReview(uid: string, patch: Partial<StaffReview>, by: string): Promise<void> {
  await setDoc(doc(firestore(), REVIEWS, uid), { ...patch, updatedAt: Date.now(), updatedBy: by }, { merge: true });
}

export type ReviewNote = { id: string; authorId: string; authorName: string; body: string; createdAt: number };

export function watchReviewNotes(uid: string, onChange: (notes: ReviewNote[]) => void): () => void {
  return onSnapshot(
    query(collection(firestore(), REVIEWS, uid, "notes"), orderBy("createdAt", "asc"), limit(200)),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: "estimate" });
          return {
            id: d.id,
            authorId: String(data.authorId ?? ""),
            authorName: String(data.authorName ?? "Staff"),
            body: String(data.body ?? ""),
            createdAt: typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : Date.now(),
          };
        }),
      ),
  );
}

export async function addReviewNote(uid: string, authorId: string, authorName: string, body: string): Promise<void> {
  await addDoc(collection(firestore(), REVIEWS, uid, "notes"), {
    authorId,
    authorName: authorName.slice(0, 80),
    body: body.trim().slice(0, 2000),
    createdAt: serverTimestamp(),
  });
}
