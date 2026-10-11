/**
 * Firebase client (browser-side singletons).
 *
 * Free-tier stack: Auth + Firestore + Realtime Database + Storage (+ optional
 * Analytics).
 *
 * Small user media — avatars — is still base64 in Firestore via
 * `app/lib/base64.ts` and `app/lib/media.ts`, because a 20KB thumbnail is
 * cheaper as a field than as an object with its own round trip. Anything that
 * can be large goes to Storage instead: a one-minute voice note is roughly
 * 120KB of Opus, and base64 inflates by a third against a 1MB hard ceiling on
 * a Firestore document. Chat media is the first of those — see
 * `app/lib/chat.ts` and the `chat-media/` block in storage.rules.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";

/**
 * Talk's Firebase project: the PUBLIC web config — exactly what every
 * visitor's browser receives in the page anyway. None of it is a secret;
 * what protects the data is firestore.rules and the Cloud Functions.
 *
 * Pinned here, not left to the host's NEXT_PUBLIC_FIREBASE_* variables alone,
 * because the live site was once built with ANOTHER project's values
 * (talktherapy-1f581). Everything then quietly pointed at the wrong project:
 * Google sign-in checked that project's authorized domains ("unauthorized
 * domain" on www.talktherapy.gm, though it was on talk-therapy-509209's
 * list), accounts and data went to the wrong database, and the Cloud
 * Functions — which belong to talk-therapy-509209 — refused its sign-ins.
 *
 * The host's values are still used, but only when they are for THIS project.
 */
const PROJECT = {
  apiKey: "AIzaSyDjSiKg6fjzJ4JTEviu7IT5lb7wL7itfQE",
  authDomain: "talk-therapy-509209.firebaseapp.com",
  projectId: "talk-therapy-509209",
  storageBucket: "talk-therapy-509209.firebasestorage.app",
  messagingSenderId: "566898355406",
  appId: "1:566898355406:web:04cad649164149b513349f",
  measurementId: "G-KRQVWG8ZXJ",
};

const fromHost = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const hostIsThisProject = fromHost.projectId === PROJECT.projectId && Boolean(fromHost.apiKey);

const config: typeof fromHost = hostIsThisProject
  ? { ...PROJECT, databaseURL: undefined, ...Object.fromEntries(Object.entries(fromHost).filter(([, v]) => v)) }
  : { ...PROJECT, databaseURL: undefined };

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "Firebase config missing. Set NEXT_PUBLIC_FIREBASE_* in .env.local.",
    );
  }
  app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function firestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function realtimeDb(): Database {
  return getDatabase(getFirebaseApp());
}

export function firebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

/**
 * Callable Cloud Functions, in the region they are deployed to.
 *
 * The region is not optional: a callable looks for the function in
 * us-central1 unless told otherwise, and would quietly 404 against functions
 * that live in us-east4 — which is where this account's functions are.
 *
 * Anything holding a merchant key or writing with admin rights runs there,
 * never in the web app. This is how the browser reaches it.
 */
export function firebaseFunctions(): Functions {
  return getFunctions(getFirebaseApp(), "us-east4");
}

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId);
}

/**
 * Initialise Analytics only in the browser and only when the device supports
 * it. Called from a client component after mount — safe to no-op on SSR or
 * when the user has analytics blocked.
 */
export async function initAnalyticsIfSupported(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!config.measurementId) return;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) {
      getAnalytics(getFirebaseApp());
    }
  } catch {
    // Analytics is optional — never let it break the app
  }
}
