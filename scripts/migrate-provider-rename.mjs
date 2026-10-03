/**
 * One-off migration: counsellor → provider.
 *
 *   node scripts/migrate-provider-rename.mjs --dry-run   # show what would change
 *   node scripts/migrate-provider-rename.mjs             # do it
 *
 * Moves `counsellorProfiles` to `providerProfiles` (mapping the old
 * `profession` to the new `services`), renames the role value and the intake
 * keys on every user, and copies any provider credential objects to the new
 * storage prefix. Safe to run twice: every step is a merge or a no-op.
 *
 * Reads and writes with the talk-admin service account (secrets/, gitignored).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const key = JSON.parse(readFileSync(KEY, "utf8"));
const app = initializeApp({ credential: cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });
const db = getFirestore(app);

const say = (...a) => console.log(DRY ? "[dry-run]" : "[migrate]", ...a);

/** The old profession list, mapped onto what that person actually offers. */
const PROFESSION_TO_SERVICES = {
  counsellor: ["mental-health-counselling"],
  therapist: ["therapy"],
  psychologist: ["therapy", "psychotherapy"],
  "social-worker": ["social-work", "psychosocial-support"],
  coach: ["psychosocial-support"],
  "psychiatric-nurse": ["mental-health-counselling", "therapy"],
};

const SUPPORT_TO_SERVICE = {
  therapy: "therapy",
  counselling: "mental-health-counselling",
  coaching: "psychosocial-support",
  "social-support": "psychosocial-support",
};

// ---------------------------------------------------------------- profiles

const oldProfiles = await db.collection("counsellorProfiles").get();
say(`counsellorProfiles: ${oldProfiles.size} document(s)`);
for (const doc of oldProfiles.docs) {
  const data = { ...doc.data() };
  if (!Array.isArray(data.services) || data.services.length === 0) {
    data.services = PROFESSION_TO_SERVICES[data.profession] ?? ["mental-health-counselling"];
  }
  delete data.profession;
  // Video only for now; the field keeps its shape for when the rest return.
  data.formats = ["video"];
  say(`  ${doc.id} → providerProfiles/${doc.id} (services: ${data.services.join(", ")})`);
  if (!DRY) {
    await db.collection("providerProfiles").doc(doc.id).set(data, { merge: true });
    await doc.ref.delete();
  }
}

// ------------------------------------------------------------------- users

const users = await db.collection("users").get();
say(`users: ${users.size} document(s)`);
for (const doc of users.docs) {
  const data = doc.data();
  const patch = {};

  if (data.role === "counsellor" || data.role === "therapist") patch.role = "provider";

  const intake = data.intake;
  if (intake && typeof intake === "object") {
    const next = { ...intake };
    let touched = false;
    if (next.counsellorGender !== undefined) {
      next.providerGender = next.counsellorGender;
      delete next.counsellorGender;
      touched = true;
    }
    if (next.supportType !== undefined) {
      const mapped = SUPPORT_TO_SERVICE[next.supportType];
      next.servicesWanted = Array.isArray(next.servicesWanted) && next.servicesWanted.length
        ? next.servicesWanted
        : mapped
          ? [mapped]
          : [];
      delete next.supportType;
      touched = true;
    }
    // Sessions are video only; the question is gone from the intake.
    if (next.format !== undefined) {
      delete next.format;
      touched = true;
    }
    if (touched) patch.intake = next;
  }

  if (Object.keys(patch).length === 0) {
    say(`  ${doc.id.slice(0, 6)}… unchanged`);
    continue;
  }
  say(`  ${doc.id.slice(0, 6)}… ${Object.keys(patch).join(", ")}${patch.intake ? ` (services: ${(patch.intake.servicesWanted ?? []).join(", ") || "none"})` : ""}`);
  // update(), not set({merge:true}): a merge keeps the old keys inside the
  // intake map, leaving counsellorGender/supportType behind forever.
  if (!DRY) await doc.ref.update(patch);
}

// ----------------------------------------------------------------- storage

try {
  const [files] = await getStorage(app).bucket().getFiles({ prefix: "counsellor-credentials/" });
  say(`storage counsellor-credentials/: ${files.length} object(s)`);
  for (const file of files) {
    const dest = file.name.replace("counsellor-credentials/", "provider-credentials/");
    say(`  ${file.name} → ${dest}`);
    // GCS cannot rename: copy, verify, then delete.
    if (!DRY) {
      await file.copy(dest);
      await file.delete();
    }
  }
} catch (e) {
  say(`storage skipped: ${e.message.slice(0, 120)}`);
}

say(DRY ? "nothing was written" : "done");
process.exitCode = 0;
