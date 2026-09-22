/**
 * Auth helpers. Wraps Firebase Auth so the rest of the app never imports it
 * directly, and owns the shape of `users/{uid}`.
 *
 * Role handling is deliberately one-directional here: sign-up may request
 * `patient` or `counsellor`, and that is all the client can ever set.
 * `verified` and any promotion to `admin` are refused by firestore.rules —
 * see the privilege-escalation guard in that file. Do not add a client path
 * that writes either field.
 */

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseAuth, firebaseConfigured, firestore } from "./firebase";
import { cleanIntake } from "./matching";
import { LANGUAGES } from "./ai/protocol";
import {
  COLLECTIONS,
  DEFAULT_CONSENTS,
  normaliseRole,
  type AppRole,
  type Consents,
  type Locale,
  type UserDoc,
} from "./models";

/** Roles a person may choose for themselves at sign-up. */
export type SignUpRole = Extract<AppRole, "patient" | "counsellor">;

export type AppUser = UserDoc;

/**
 * Firestore timestamps arrive as `Timestamp | null` (null in the brief window
 * between a local write and the server round-trip), so every read goes through
 * this rather than trusting `.toMillis()` to exist.
 */
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

/** Normalise a raw Firestore document into a UserDoc. */
export function toUserDoc(uid: string, data: Record<string, unknown>): UserDoc {
  const createdAt = millis(data.createdAt);
  return {
    uid,
    email: (data.email as string) ?? null,
    displayName: (data.displayName as string) ?? null,
    photoURL: (data.photoURL as string) ?? null,
    role: normaliseRole(data.role as string),
    verified: Boolean(data.verified),
    locale: ((data.locale as Locale) ?? "en") as Locale,
    onboarded: Boolean(data.onboarded),
    goals: (data.goals as string[]) ?? [],
    consents: { ...DEFAULT_CONSENTS, ...((data.consents as Consents) ?? {}) },
    intake: data.intake ? cleanIntake(data.intake, LANGUAGES) : null,
    orgId: (data.orgId as string) ?? null,
    createdAt,
    updatedAt: millis(data.updatedAt, createdAt),
  };
}

async function ensureUserDoc(user: User, role: SignUpRole): Promise<UserDoc> {
  const ref = doc(firestore(), COLLECTIONS.users, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = toUserDoc(user.uid, snap.data());
    // Keep the auth profile and the Firestore mirror in step — the user may
    // have changed their Google photo or name since last sign-in. Role and
    // verified are untouched on purpose.
    if (
      existing.photoURL !== user.photoURL ||
      existing.displayName !== user.displayName
    ) {
      await updateDoc(ref, {
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      });
      return { ...existing, displayName: user.displayName, photoURL: user.photoURL };
    }
    return existing;
  }

  // `verified` is meaningless for patients, so it is set true to keep the
  // field non-null. Counsellors start false and can only be flipped by an
  // admin through the verification queue.
  const verified = role === "patient";

  await setDoc(ref, {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role,
    verified,
    locale: "en",
    onboarded: false,
    goals: [],
    consents: DEFAULT_CONSENTS,
    intake: null,
    orgId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const now = Date.now();
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role,
    verified,
    locale: "en",
    onboarded: false,
    goals: [],
    consents: DEFAULT_CONSENTS,
    intake: null,
    orgId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function signInWithGoogle(
  role: SignUpRole = "patient",
): Promise<AppUser> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(firebaseAuth(), provider);
  return ensureUserDoc(cred.user, role);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role: SignUpRole = "patient",
): Promise<AppUser> {
  const cred = await createUserWithEmailAndPassword(firebaseAuth(), email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return ensureUserDoc(cred.user, role);
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
  // Role is only consulted if the document does not exist yet (an account
  // created out-of-band). An existing doc keeps whatever role it already has.
  return ensureUserDoc(cred.user, "patient");
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email);
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

export function watchAuthState(
  cb: (user: User | null) => void,
): () => void {
  // Runs from the root layout, so a throw here takes down every page —
  // including the marketing pages that never touch auth. With no env config
  // there is no app to watch: report "signed out" and let callers settle.
  if (!firebaseConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[auth] Firebase is not configured — running signed-out. " +
          "Set NEXT_PUBLIC_FIREBASE_* in .env.local to enable sign-in.",
      );
    }
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth(), cb);
}

/**
 * Live subscription to `users/{uid}`.
 *
 * A snapshot listener rather than a one-shot read so that an admin verifying a
 * counsellor, or the user completing onboarding in another tab, updates the UI
 * without a reload. `cb(null)` means "no document yet" — the caller decides
 * whether that is a loading state or a missing profile.
 */
export function watchUserDoc(
  uid: string,
  cb: (profile: UserDoc | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!firebaseConfigured()) {
    cb(null);
    return () => {};
  }

  return onSnapshot(
    doc(firestore(), COLLECTIONS.users, uid),
    (snap) => cb(snap.exists() ? toUserDoc(uid, snap.data()) : null),
    (error) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[auth] user document subscription failed:", error);
      }
      onError?.(error);
      cb(null);
    },
  );
}

/** Patch the caller's own profile. Role and verified are rejected by rules. */
export async function updateUserProfile(
  uid: string,
  patch: Partial<
    Pick<
      UserDoc,
      "displayName" | "photoURL" | "locale" | "onboarded" | "goals" | "consents" | "intake"
    >
  >,
): Promise<void> {
  await updateDoc(doc(firestore(), COLLECTIONS.users, uid), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Permanently delete the signed-in account.
 *
 * Order matters and is not interchangeable. Firestore does not cascade, so the
 * subcollections must be cleared *before* the parent document, and the parent
 * document before the auth user — once the auth user is gone the security
 * rules no longer authorise deleting anything that is left, and the data is
 * stranded in the database forever.
 *
 * `clearData` is injected rather than imported so this module stays free of a
 * dependency on the wellbeing layer.
 */
export class RecentLoginRequiredError extends Error {
  constructor() {
    super(
      "For your security, please sign out and sign back in before deleting your account.",
    );
    this.name = "RecentLoginRequiredError";
  }
}

export async function deleteAccount(
  clearData: (uid: string) => Promise<void>,
): Promise<void> {
  const current = firebaseAuth().currentUser;
  if (!current) throw new Error("You are not signed in.");

  const uid = current.uid;

  await clearData(uid);
  await deleteDoc(doc(firestore(), COLLECTIONS.users, uid));

  try {
    await deleteUser(current);
  } catch (error) {
    // Firebase requires a recent credential for destructive account changes.
    // The Firestore data is already gone at this point, which is the right
    // trade: a stranded auth record is recoverable, stranded journal entries
    // are a privacy failure.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String((error as { code: unknown }).code).includes("requires-recent-login")
    ) {
      throw new RecentLoginRequiredError();
    }
    throw error;
  }
}
