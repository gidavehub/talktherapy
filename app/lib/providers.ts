/**
 * Provider directory queries.
 *
 * Search is deliberately client-side. With the size of the professional
 * network in The Gambia — realistically tens, not thousands — fetching the
 * verified profiles once and filtering in memory is faster than a paginated
 * multi-predicate Firestore query, costs a fraction of the reads, and avoids
 * standing up a search service for a list that fits on one screen.
 *
 * Revisit if the directory passes a few hundred profiles.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseConfigured, firebaseStorage, firestore } from "./firebase";
import { fileToCompressedDataUrl } from "./base64";
import {
  COLLECTIONS,
  type ProviderProfile,
  type Locale,
} from "./models";
import {
  SERVICES,
  SESSION_FORMATS,
  type Service,
  type SessionFormat,
  type Specialization,
} from "./matching";

// The vocabulary lives in ./matching so the AI route and tests can share it
// without pulling in the Firebase SDK. Re-exported for existing importers.
export { SPECIALIZATIONS, SPECIALIZATION_LABELS, type Specialization } from "./matching";

function toProfile(uid: string, data: Record<string, unknown>): ProviderProfile {
  return {
    uid,
    displayName: (data.displayName as string) ?? "",
    headline: (data.headline as string) ?? "",
    bio: (data.bio as string) ?? "",
    specializations: (data.specializations as string[]) ?? [],
    languages: (data.languages as Locale[]) ?? ["en"],
    qualifications: (data.qualifications as string[]) ?? [],
    yearsExperience: (data.yearsExperience as number) ?? 0,
    sessionRateMinor: (data.sessionRateMinor as number) ?? 0,
    status: (data.status as ProviderProfile["status"]) ?? "draft",
    photoPath: (data.photoPath as string) ?? null,
    ratingAvg: (data.ratingAvg as number) ?? 0,
    ratingCount: (data.ratingCount as number) ?? 0,
    timezone: (data.timezone as string) ?? "Africa/Banjul",
    services: ((data.services as string[]) ?? []).filter((s): s is Service => SERVICES.includes(s as Service)),
    gender: data.gender === "woman" || data.gender === "man" ? data.gender : null,
    formats: ((data.formats as string[]) ?? ["video"]).filter((f): f is SessionFormat =>
      SESSION_FORMATS.includes(f as SessionFormat),
    ),
    location: (data.location as string) ?? null,
    sample: data.sample === true,
    createdAt: (data.createdAt as number) ?? 0,
    updatedAt: (data.updatedAt as number) ?? 0,
  };
}

/**
 * Why a directory read failed.
 *
 * These three cases look identical to a user but mean completely different
 * things to whoever has to fix them, so they are kept apart rather than
 * collapsed into one "something went wrong":
 *
 *  - `permission`  — firestore.rules has not been deployed, or denies this read.
 *  - `index`       — the composite index in firestore.indexes.json is missing.
 *  - `unavailable` — offline, or Firestore unreachable.
 */
export type DirectoryErrorKind = "permission" | "index" | "unavailable" | "unknown";

export class DirectoryError extends Error {
  constructor(
    readonly kind: DirectoryErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DirectoryError";
  }
}

function classify(error: unknown): DirectoryError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code.includes("permission-denied")) {
    return new DirectoryError(
      "permission",
      "Firestore denied the read. Deploy firestore.rules: npx firebase-tools deploy --only firestore:rules",
      error,
    );
  }

  if (code.includes("failed-precondition")) {
    return new DirectoryError(
      "index",
      "Firestore is missing a composite index for this query. Deploy it: npx firebase-tools deploy --only firestore:indexes",
      error,
    );
  }

  if (code.includes("unavailable")) {
    return new DirectoryError("unavailable", "Could not reach Firestore.", error);
  }

  return new DirectoryError(
    "unknown",
    error instanceof Error ? error.message : String(error),
    error,
  );
}

/**
 * Every publicly visible provider.
 *
 * The `status == 'verified'` predicate is not a convenience — it mirrors the
 * read rule in firestore.rules, so an unverified profile is not merely hidden
 * from this list, it is unreadable.
 */
export async function listVerifiedProviders(): Promise<ProviderProfile[]> {
  if (!firebaseConfigured()) return [];

  try {
    // Single equality predicate only — no orderBy. Adding `orderBy('ratingAvg')`
    // turns this into a composite-index query, which fails with
    // `failed-precondition` until that index is deployed and built. Since the
    // whole list is fetched and filtered in memory anyway, sorting here costs
    // nothing and removes a deploy step between code and a working directory.
    const snap = await getDocs(
      query(
        collection(firestore(), COLLECTIONS.providerProfiles),
        where("status", "==", "verified"),
        limit(200),
      ),
    );

    return snap.docs
      .map((d) => toProfile(d.id, d.data()))
      .sort(
        (a, b) =>
          b.ratingAvg - a.ratingAvg ||
          b.ratingCount - a.ratingCount ||
          a.displayName.localeCompare(b.displayName),
      );
  } catch (error) {
    const classified = classify(error);
    if (process.env.NODE_ENV !== "production") {
      console.error(`[providers] ${classified.kind}: ${classified.message}`, error);
    }
    throw classified;
  }
}

/**
 * One profile by uid.
 *
 * Returns null both when the document is absent and when rules refuse the
 * read — an unverified provider is genuinely unreadable to the public, so
 * "not found" is the honest answer either way.
 */
export async function getProvider(uid: string): Promise<ProviderProfile | null> {
  if (!firebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(firestore(), COLLECTIONS.providerProfiles, uid));
    if (!snap.exists()) return null;
    const profile = toProfile(snap.id, snap.data());
    return profile.status === "verified" ? profile : null;
  } catch {
    return null;
  }
}

/**
 * A provider's own profile, whatever state it is in.
 *
 * `getProvider` above deliberately hides anything not yet verified, because it
 * serves the public directory. A provider editing their own listing has to be
 * able to see it before an admin has approved it, which is every provider on
 * their first day.
 */
export async function getOwnProviderProfile(uid: string): Promise<ProviderProfile | null> {
  if (!firebaseConfigured()) return null;
  const snap = await getDoc(doc(firestore(), COLLECTIONS.providerProfiles, uid));
  return snap.exists() ? toProfile(snap.id, snap.data()) : null;
}

/**
 * Upload a provider's photo and return the Storage path to record on their
 * profile.
 *
 * Compressed to 512px JPEG before it leaves the browser, with the helper the
 * avatar flow already uses. A provider photographing themselves on a phone
 * produces a 4MB file; on a Gambian mobile connection that is a slow upload
 * for them and a slow page for everybody who ever sees them in a list.
 *
 * Goes under `avatars/{uid}`, which storage.rules already makes publicly
 * readable "because they appear in the provider directory, which is browsable
 * before sign-in" — exactly this case. A fixed filename, so re-uploading
 * replaces the old photo rather than leaving a litter of orphans nothing
 * points at.
 */
export async function uploadProviderPhoto(uid: string, file: File): Promise<string> {
  const dataUrl = await fileToCompressedDataUrl(file, {
    maxDimension: 512,
    quality: 0.82,
    mime: "image/jpeg",
  });
  const blob = await (await fetch(dataUrl)).blob();

  const path = `avatars/${uid}/provider.jpg`;
  await uploadBytes(storageRef(firebaseStorage(), path), blob, { contentType: "image/jpeg" });
  return path;
}

/** The fields a provider fills in. Everything else is set by us or by review. */
export type ProviderDraft = {
  displayName: string;
  headline: string;
  bio: string;
  services: Service[];
  languages: Locale[];
  specializations: Specialization[];
  qualifications: string[];
  yearsExperience: number;
  sessionRateMinor: number;
  gender: "woman" | "man" | null;
  /** A town from TOWNS_BY_AREA, lower-case, so matching can place it. */
  location: string | null;
  /** Storage path from uploadProviderPhoto, when they have set one. */
  photoPath?: string | null;
};

/**
 * Create or update a provider's own public listing.
 *
 * `status` is never in the draft, and that is the point. firestore.rules lets
 * a provider create their profile only as `draft` or `pending`, and lets an
 * update through only when the status is unchanged — so a provider cannot
 * approve themselves. A new profile is therefore created as `pending`, and an
 * update simply omits the field, which leaves whatever review decided.
 *
 * `formats` is always video: Talk's sessions happen in the app, and the type
 * keeps the other values only so the field does not need a migration when
 * that changes.
 */
export async function saveProviderProfile(uid: string, draft: ProviderDraft): Promise<void> {
  const ref = doc(firestore(), COLLECTIONS.providerProfiles, uid);
  const existing = await getDoc(ref);

  const fields = {
    displayName: draft.displayName.trim(),
    headline: draft.headline.trim(),
    bio: draft.bio.trim(),
    services: draft.services,
    languages: draft.languages,
    specializations: draft.specializations,
    qualifications: draft.qualifications.map((q) => q.trim()).filter(Boolean),
    yearsExperience: draft.yearsExperience,
    sessionRateMinor: draft.sessionRateMinor,
    gender: draft.gender,
    location: draft.location,
    // Only written when the form has one, so saving the rest of the profile
    // never clears a photo that is already there.
    ...(draft.photoPath !== undefined ? { photoPath: draft.photoPath } : {}),
    formats: ["video"] as SessionFormat[],
    updatedAt: serverTimestamp(),
  };

  if (existing.exists()) {
    await updateDoc(ref, fields);
    return;
  }

  await setDoc(ref, {
    ...fields,
    uid,
    // Straight to pending: there is no save-as-draft in the UI, so a profile
    // that exists is one its owner wants reviewed.
    status: "pending",
    photoPath: draft.photoPath ?? null,
    ratingAvg: 0,
    ratingCount: 0,
    timezone: "Africa/Banjul",
    // Never true from the app. Only the seed script writes sample profiles.
    sample: false,
    createdAt: serverTimestamp(),
  });
}

export type DirectoryFilters = {
  search: string;
  specializations: Specialization[];
  languages: Locale[];
  maxRateMinor: number | null;
};

export const EMPTY_FILTERS: DirectoryFilters = {
  search: "",
  specializations: [],
  languages: [],
  maxRateMinor: null,
};

export function filterProviders(
  profiles: ProviderProfile[],
  filters: DirectoryFilters,
): ProviderProfile[] {
  const term = filters.search.trim().toLowerCase();

  return profiles.filter((profile) => {
    if (term) {
      const haystack = [
        profile.displayName,
        profile.headline,
        profile.bio,
        ...profile.specializations,
        ...profile.qualifications,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    // Multi-select filters are OR within a facet, AND across facets — the
    // behaviour people expect from a directory without being told.
    if (
      filters.specializations.length &&
      !filters.specializations.some((s) => profile.specializations.includes(s))
    ) {
      return false;
    }

    if (
      filters.languages.length &&
      !filters.languages.some((l) => profile.languages.includes(l))
    ) {
      return false;
    }

    if (filters.maxRateMinor != null && profile.sessionRateMinor > filters.maxRateMinor) {
      return false;
    }

    return true;
  });
}
