/**
 * Review a provider and put them in the directory.
 *
 *   node scripts/verify-provider.mjs --list
 *   node scripts/verify-provider.mjs <uid>
 *   node scripts/verify-provider.mjs <uid> --suspend
 *
 * There is no admin screen yet, and without this a provider can sign up,
 * fill in their listing, and then wait for ever: going live takes TWO flags
 * in two collections, and a provider can write neither of them.
 *
 *   providerProfiles/{uid}.status  — what the public directory filters on.
 *   users/{uid}.verified           — what decides where they land when they
 *                                    sign in, and what `isVerifiedProvider`
 *                                    in firestore.rules will check.
 *
 * Both are set together here, because a provider with one and not the other
 * is in a state nothing in the product knows how to explain.
 *
 * Admin SDK, so it bypasses firestore.rules entirely. That is the point —
 * those rules exist to stop a provider doing this for themselves.
 *
 * THIS IS A REVIEW STEP, NOT A FORMALITY. "Verified" tells someone in
 * distress that their qualifications were checked by a person. Read the
 * listing this prints before you type y.
 */

import { createInterface } from "node:readline/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

const db = getFirestore(initializeApp({ credential: cert(KEY), projectId: PROJECT }, "verify"));

const args = process.argv.slice(2);
const suspend = args.includes("--suspend");
const uid = args.find((a) => !a.startsWith("--")) ?? null;

function describe(uid, data) {
  const lines = [
    `  uid           ${uid}`,
    `  name          ${data.displayName ?? "(none)"}`,
    `  status        ${data.status ?? "(none)"}`,
    `  headline      ${data.headline || "(none)"}`,
    `  services      ${(data.services ?? []).join(", ") || "(none)"}`,
    `  languages     ${(data.languages ?? []).join(", ") || "(none)"}`,
    `  works with    ${(data.specializations ?? []).join(", ") || "(none)"}`,
    `  where         ${data.location ?? "(not saying)"}`,
    `  experience    ${data.yearsExperience ?? 0} years`,
    `  fee           D${((data.sessionRateMinor ?? 0) / 100).toFixed(2)} per session`,
    `  qualifications`,
    ...(data.qualifications ?? []).map((q) => `                - ${q}`),
  ];
  if ((data.qualifications ?? []).length === 0) lines.push("                (none listed)");
  if (data.sample) lines.push("  NOTE          this is a seeded sample, not a real person");
  return lines.join("\n");
}

async function list() {
  const snap = await db.collection("providerProfiles").get();
  const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const waiting = rows.filter((r) => r.status !== "verified");

  console.log(`${rows.length} listings, ${waiting.length} waiting to be checked.\n`);
  for (const row of waiting) {
    console.log(describe(row.uid, row));
    console.log("");
  }
  if (waiting.length === 0) console.log("Nothing waiting.");
}

async function apply(uid) {
  const ref = db.collection("providerProfiles").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No listing for ${uid}. They may not have filled the form in yet.`);
    process.exitCode = 1;
    return;
  }

  const data = snap.data() ?? {};
  console.log(`${suspend ? "Suspending" : "Verifying"}:\n`);
  console.log(describe(uid, data));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(
      suspend
        ? "\nTake this provider out of the directory? [y/N] "
        : "\nHave these qualifications actually been checked by a person? [y/N] ",
    )
  ).trim().toLowerCase();
  rl.close();

  if (answer !== "y" && answer !== "yes") {
    console.log("Nothing changed.");
    return;
  }

  const status = suspend ? "suspended" : "verified";
  const now = Date.now();

  // One batch: a provider listed in the directory whose account does not say
  // verified — or the reverse — is a state the product has no story for.
  const batch = db.batch();
  batch.update(ref, { status, updatedAt: now });
  batch.set(
    db.collection("users").doc(uid),
    { verified: !suspend, updatedAt: now },
    { merge: true },
  );
  await batch.commit();

  console.log(
    suspend
      ? `\n${data.displayName ?? uid} is no longer shown in the directory.`
      : `\n${data.displayName ?? uid} is live. Talk can now suggest them to someone who matches.`,
  );
}

if (!uid) {
  await list();
} else {
  await apply(uid);
}
