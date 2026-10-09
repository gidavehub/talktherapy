/**
 * Reach the DEPLOYED companion functions the way the browser does.
 *
 *   import { BASE, authHeader } from "./lib/functions.mjs";
 *
 * A function will not answer without a Firebase ID token, and a script cannot
 * sign in through the UI — but it can mint a custom token with the admin key
 * and exchange it for one. The token is for a fixed test uid, `smoke-tests`,
 * which has no profile and no data: it exists only in Firebase Auth.
 *
 * This is the test that would have caught companionTurn failing on every
 * deployed request while the brain-only tests (scripts/lib/talk.mjs) passed:
 * those load .env.local, and the function's runtime is not .env.local.
 */

import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

/** Same default as app/lib/ai/endpoints.ts. */
export const BASE = (
  process.env.FUNCTIONS_BASE_URL ||
  env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  "https://us-east4-talk-therapy-509209.cloudfunctions.net"
).replace(/\/+$/, "");

const KEY = process.env.TALK_ADMIN_CREDENTIALS || env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, "utf8"))) });

const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: await getAuth().createCustomToken("smoke-tests"), returnSecureToken: true }),
  },
);
const { idToken, error } = await res.json();
if (!idToken) throw new Error(`Could not get an ID token: ${JSON.stringify(error)}`);

export const authHeader = { Authorization: `Bearer ${idToken}` };
