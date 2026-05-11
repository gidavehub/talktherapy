/**
 * Firebase client (browser-side singletons).
 *
 * Free-tier stack: Auth + Firestore + Realtime Database (+ optional Analytics).
 * We deliberately avoid Storage — user media is stored as base64 in Firestore
 * via `app/lib/base64.ts` and `app/lib/media.ts`.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

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
