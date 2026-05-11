/**
 * Auth helpers. Pure functions — call from client components or routes.
 * Wraps Firebase Auth so the rest of the app doesn't import it directly.
 */

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase";

export type AppRole = "patient" | "therapist";

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: AppRole;
  verified: boolean;
  createdAt: number;
};

const USERS_COLLECTION = "users";

async function ensureUserDoc(user: User, role: AppRole): Promise<AppUser> {
  const ref = doc(firestore(), USERS_COLLECTION, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: (data.role as AppRole) ?? role,
      verified: Boolean(data.verified),
      createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    };
  }
  await setDoc(ref, {
    email: user.email,
    displayName: user.displayName,
    role,
    verified: role === "patient", // therapists must be verified by admin
    createdAt: serverTimestamp(),
  });
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role,
    verified: role === "patient",
    createdAt: Date.now(),
  };
}

export async function signInWithGoogle(role: AppRole = "patient"): Promise<AppUser> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(firebaseAuth(), provider);
  return ensureUserDoc(cred.user, role);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role: AppRole = "patient",
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
  return ensureUserDoc(cred.user, "patient");
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

export function watchAuthState(
  cb: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(firebaseAuth(), cb);
}
