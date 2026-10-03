/**
 * The privileged Firebase app: Firestore and Auth with the `talk-admin`
 * service account.
 *
 * Kept well away from `requireUser.ts`, which verifies ID tokens with no
 * credentials at all. That separation is the whole point of the two service
 * accounts described in .env.example: the AI routes can spend Vertex budget
 * but cannot read a single journal entry, and only the code that genuinely
 * needs database authority — the payment webhook — loads this key.
 *
 * Admin writes bypass firestore.rules entirely. Everything written through
 * here must therefore be checked in code, because no rule will catch it.
 */

import "server-only";
import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const APP_NAME = "talk-admin";

function credential() {
  // Inline JSON where the host has no filesystem for secrets (Vercel, App
  // Hosting); a key file locally. Same convention as TALK_AI_CREDENTIALS.
  const inline = process.env.TALK_ADMIN_CREDENTIALS_JSON;
  if (inline) return cert(JSON.parse(inline));

  const keyFile = process.env.TALK_ADMIN_CREDENTIALS;
  if (keyFile) return cert(keyFile);

  throw new Error(
    "No admin credentials — set TALK_ADMIN_CREDENTIALS or TALK_ADMIN_CREDENTIALS_JSON (see .env.example)",
  );
}

function adminApp(): App {
  // Env is read here rather than at module scope: Next 16 inlines build-time
  // `process.env` reads, so a top-level read would bake the build machine's
  // (empty) value into the deployment.
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("No Firebase project ID configured");

  return initializeApp({ credential: credential(), projectId }, APP_NAME);
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}
