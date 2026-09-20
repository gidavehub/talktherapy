/**
 * Proves the two service accounts have exactly the reach they are supposed to
 * have — and, just as importantly, that the AI account does NOT have database
 * access.
 *
 *   node scripts/verify-service-accounts.mjs
 *
 * The negative test is the point of this file. Splitting credentials only buys
 * anything if the split is real, and an IAM binding that silently grants more
 * than intended looks identical to a correct one until someone leaks a key.
 */

import { GoogleAuth } from "google-auth-library";
// firebase-admin v14 does not expose the legacy `admin.*` namespace through
// its ESM default export — the modular entry points are the supported shape.
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const AI_KEY = process.env.TALK_AI_CREDENTIALS || "./secrets/talk-ai-sa.json";
const ADMIN_KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";

const ok = (m) => console.log(`  [32m✓[0m ${m}`);
const bad = (m) => console.log(`  [31m✗[0m ${m}`);

let failures = 0;
async function check(name, fn) {
  try {
    const detail = await fn();
    ok(`${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    bad(`${name} — ${e.message}`);
    failures += 1;
  }
}

function loadKey(path) {
  const key = JSON.parse(readFileSync(path, "utf8"));
  if (key.type !== "service_account") throw new Error(`${path} is not a service account key`);
  return key;
}

async function tokenFor(path) {
  const auth = new GoogleAuth({
    keyFile: path,
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  return (await (await auth.getClient()).getAccessToken()).token;
}

async function main() {
  console.log("[1mService account verification[0m");
  console.log(`project: ${PROJECT}\n`);

  const aiKey = loadKey(AI_KEY);
  const adminKey = loadKey(ADMIN_KEY);
  console.log(`  ai    : ${aiKey.client_email}`);
  console.log(`  admin : ${adminKey.client_email}\n`);

  // -- talk-ai: should reach Vertex ----------------------------------------
  console.log("[1mtalk-ai — should reach Vertex[0m");
  await check("calls gemini via Vertex", async () => {
    const res = await fetch(
      `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global` +
        `/publishers/google/models/${TEXT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await tokenFor(AI_KEY)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2000 },
        }),
      },
    );
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!out) throw new Error("empty response");
    return `responded "${out}"`;
  });

  // -- talk-ai: must NOT reach Firestore -----------------------------------
  console.log("\n[1mtalk-ai — must NOT reach the database[0m");
  await check("Firestore read is denied", async () => {
    const app = initializeApp({ credential: cert(aiKey), projectId: PROJECT }, "ai-probe");
    try {
      await getFirestore(app).collection("users").limit(1).get();
    } catch (e) {
      // The Firestore client surfaces gRPC status codes numerically, so 7 is
      // PERMISSION_DENIED. Matched exactly rather than by substring: a loose
      // /7/ would also match "unavailable" retry text and turn a broken
      // network into a passing isolation test.
      const GRPC_PERMISSION_DENIED = 7;
      const denied =
        e.code === GRPC_PERMISSION_DENIED ||
        e.code === "permission-denied" ||
        /PERMISSION_DENIED/i.test(String(e.message || ""));
      if (denied) return `denied (gRPC ${e.code}), as intended`;
      throw new Error(`denied but with an unexpected error: ${e.code} ${e.message}`);
    } finally {
      await deleteApp(app);
    }
    // Reaching here means the read SUCCEEDED, which is a real misconfiguration.
    throw new Error("READ SUCCEEDED — the AI key can read user data. Revoke and re-grant roles.");
  });

  // -- talk-admin: should reach Firestore and Auth --------------------------
  console.log("\n[1mtalk-admin — should reach the data plane[0m");
  const adminApp = initializeApp(
    { credential: cert(adminKey), projectId: PROJECT },
    "admin-probe",
  );

  await check("Firestore read", async () => {
    const snap = await getFirestore(adminApp).collection("users").limit(1).get();
    return `${snap.size} doc(s) visible`;
  });

  await check("Firestore write + delete", async () => {
    const ref = getFirestore(adminApp).collection("_probe").doc("sa-verify");
    await ref.set({ at: FieldValue.serverTimestamp(), by: adminKey.client_email });
    await ref.delete();
    return "round-tripped and cleaned up";
  });

  await check("Auth admin (list users)", async () => {
    const r = await getAuth(adminApp).listUsers(1);
    return `${r.users.length} user(s) visible`;
  });

  await deleteApp(adminApp);

  console.log(
    failures === 0
      ? "\n[32m[1mBOTH ACCOUNTS CORRECT[0m — AI key is confined to Vertex.\n"
      : `\n[31m[1m${failures} CHECK(S) FAILED[0m\n`,
  );
  // exitCode, not exit(): letting the loop drain avoids a libuv assertion
  // on Windows when gRPC/auth handles are still closing.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("[31mFATAL:[0m", e.message);
  process.exitCode = 1;
});
