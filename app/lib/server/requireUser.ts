import "server-only";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Who is calling an AI route.
 *
 * The AI endpoints spend real money on the project's Vertex billing, so they
 * are never open: a request must carry a Firebase ID token, verified here.
 *
 * Verification needs only the project ID — it checks the token's signature
 * against Google's public certificates. It deliberately does NOT load the
 * talk-admin key: the AI routes have no business holding database access.
 */

const APP_NAME = "talk-token-verify";

function verifier() {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return getAuth(existing);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("No Firebase project ID configured");
  return getAuth(initializeApp({ projectId }, APP_NAME));
}

export async function requireUser(req: Request): Promise<{ uid: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (token) {
    try {
      const decoded = await verifier().verifyIdToken(token);
      return { uid: decoded.uid };
    } catch {
      return null;
    }
  }

  // Local testing without signing in. Only honoured by `next dev` — NODE_ENV
  // is "production" in every build, so this can never open a deployed route
  // even if the variable is set there by mistake.
  if (process.env.NODE_ENV === "development" && process.env.TALK_DEV_ALLOW_ANON_AI === "1") {
    return { uid: "dev-anonymous" };
  }
  return null;
}

// ------------------------------------------------------------- rate limiting

/**
 * Per-user sliding window, in memory. Per server instance only, so it bounds a
 * runaway client or a stolen token rather than a determined attacker — App
 * Check and a shared store are the real answer before launch.
 */
const windows = new Map<string, number[]>();

export function allow(uid: string, bucket: string, limit: number, windowMs: number): boolean {
  const key = `${bucket}:${uid}`;
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 5000) {
    for (const [k, v] of windows) if (!v.some((t) => now - t < windowMs)) windows.delete(k);
  }
  return true;
}
