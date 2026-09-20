/**
 * Counsellor directory queries.
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
  where,
} from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";
import {
  COLLECTIONS,
  type CounsellorProfile,
  type Locale,
} from "./models";

/** Specialisations offered in the directory filters. */
export const SPECIALIZATIONS = [
  "anxiety",
  "depression",
  "grief",
  "trauma",
  "relationships",
  "family",
  "workplace",
  "academic",
  "self-esteem",
  "substance",
  "youth",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const SPECIALIZATION_LABELS: Record<Specialization, string> = {
  anxiety: "Anxiety",
  depression: "Depression",
  grief: "Grief & loss",
  trauma: "Trauma",
  relationships: "Relationships",
  family: "Family",
  workplace: "Workplace stress",
  academic: "Academic pressure",
  "self-esteem": "Self-esteem",
  substance: "Substance use",
  youth: "Young people",
};

function toProfile(uid: string, data: Record<string, unknown>): CounsellorProfile {
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
    status: (data.status as CounsellorProfile["status"]) ?? "draft",
    photoPath: (data.photoPath as string) ?? null,
    ratingAvg: (data.ratingAvg as number) ?? 0,
    ratingCount: (data.ratingCount as number) ?? 0,
    timezone: (data.timezone as string) ?? "Africa/Banjul",
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
 * Every publicly visible counsellor.
 *
 * The `status == 'verified'` predicate is not a convenience — it mirrors the
 * read rule in firestore.rules, so an unverified profile is not merely hidden
 * from this list, it is unreadable.
 */
export async function listVerifiedCounsellors(): Promise<CounsellorProfile[]> {
  if (!firebaseConfigured()) return [];

  try {
    // Single equality predicate only — no orderBy. Adding `orderBy('ratingAvg')`
    // turns this into a composite-index query, which fails with
    // `failed-precondition` until that index is deployed and built. Since the
    // whole list is fetched and filtered in memory anyway, sorting here costs
    // nothing and removes a deploy step between code and a working directory.
    const snap = await getDocs(
      query(
        collection(firestore(), COLLECTIONS.counsellorProfiles),
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
      console.error(`[counsellors] ${classified.kind}: ${classified.message}`, error);
    }
    throw classified;
  }
}

/**
 * One profile by uid.
 *
 * Returns null both when the document is absent and when rules refuse the
 * read — an unverified counsellor is genuinely unreadable to the public, so
 * "not found" is the honest answer either way.
 */
export async function getCounsellor(uid: string): Promise<CounsellorProfile | null> {
  if (!firebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(firestore(), COLLECTIONS.counsellorProfiles, uid));
    if (!snap.exists()) return null;
    const profile = toProfile(snap.id, snap.data());
    return profile.status === "verified" ? profile : null;
  } catch {
    return null;
  }
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

export function filterCounsellors(
  profiles: CounsellorProfile[],
  filters: DirectoryFilters,
): CounsellorProfile[] {
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
