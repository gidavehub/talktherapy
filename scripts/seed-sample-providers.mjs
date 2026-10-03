/**
 * Sample providers, so the matching flow can be seen working before real
 * providers are verified.
 *
 *   node scripts/seed-sample-providers.mjs           # add (or refresh) them
 *   node scripts/seed-sample-providers.mjs --remove  # delete every sample
 *
 * THESE ARE NOT REAL PEOPLE. Every document carries `sample: true`, the app
 * labels each one "Sample profile" wherever it appears, and the profile page
 * never shows them as credential-verified. Remove them before real users
 * arrive — fabricated practitioners on a mental-health service are exactly
 * the kind of false claim that destroys trust.
 *
 * Uses the talk-admin service account (secrets/, gitignored).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, "utf8"))) }));
const col = db.collection("providerProfiles");

const NOTE = "Sample profile for testing Talk — not a real provider.";

// Varied on purpose: every language, both genders, every service, so matching
// has real choices to make. Sessions are video for now.
//  [id, name, services, gender, town, languages, specialisations, fee D, years, rating]
const SAMPLES = [
  ["awa-jallow", "Awa Jallow", ["mental-health-counselling", "psychosocial-support"], "woman", "Banjul", ["wo", "en"], ["grief", "family", "depression"], 800, 9, 4.8],
  ["lamin-ceesay", "Lamin Ceesay", ["therapy", "psychotherapy"], "man", "Serrekunda", ["en", "wo", "mnk"], ["anxiety", "trauma", "workplace"], 2500, 12, 4.7],
  ["fatoumata-bah", "Fatoumata Bah", ["social-work", "psychosocial-support"], "woman", "Brikama", ["ff", "wo", "en"], ["family", "youth", "substance"], 700, 7, 4.6],
  ["ebrima-touray", "Ebrima Touray", ["psychosocial-support"], "man", "Bakau", ["en"], ["workplace", "self-esteem", "academic"], 1200, 5, 4.5],
  ["isatou-sowe", "Isatou Sowe", ["therapy", "psychotherapy"], "woman", "Kanifing", ["en", "mnk"], ["trauma", "anxiety", "relationships"], 2000, 10, 4.9],
  ["modou-njie", "Modou Njie", ["mental-health-counselling"], "man", "Farafenni", ["wo", "en"], ["grief", "depression", "sleep"], 750, 6, 4.4],
  ["mariama-darboe", "Mariama Darboe", ["mental-health-counselling", "therapy"], "woman", "Basse", ["mnk", "ff", "en"], ["depression", "anxiety", "sleep"], 900, 14, 4.7],
  ["ousman-camara", "Ousman Camara", ["psychosocial-support", "mental-health-counselling"], "man", "Serrekunda", ["en", "wo"], ["youth", "academic", "relationships"], 800, 4, 4.3],
  ["ndey-faal", "Ndey Faal", ["therapy", "psychotherapy"], "woman", "Bijilo", ["wo", "en"], ["grief", "trauma", "sleep"], 1800, 8, 4.8],
  ["kaddy-jobe", "Kaddy Jobe", ["mental-health-counselling", "psychosocial-support"], "woman", "Lamin", ["en", "wo", "mnk"], ["relationships", "family", "self-esteem"], 1000, 3, 4.5],
];

const HEADLINE = {
  therapy: "Therapy — working through what weighs on you",
  psychotherapy: "Psychotherapy — patterns, past experiences, deeper work",
  "mental-health-counselling": "Mental health counselling — a calm space to talk things through",
  "psychosocial-support": "Psychosocial support — coping, family and community",
  "social-work": "Social work — practical help and family support",
};

if (process.argv.includes("--remove")) {
  const snap = await col.where("sample", "==", true).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`Removed ${snap.size} sample profiles.`);
} else {
  const now = Date.now();
  const batch = db.batch();
  for (const [id, name, services, gender, location, languages, specializations, rate, years, rating] of SAMPLES) {
    batch.set(col.doc(`sample-${id}`), {
      displayName: name,
      headline: HEADLINE[services[0]],
      bio: `${NOTE}

Works with people from ${location} and across The Gambia.`,
      specializations,
      languages,
      qualifications: [],
      yearsExperience: years,
      sessionRateMinor: rate * 100,
      status: "verified",
      photoPath: null,
      ratingAvg: rating,
      ratingCount: 0,
      timezone: "Africa/Banjul",
      services,
      gender,
      formats: ["video"],
      location,
      sample: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  console.log(`Wrote ${SAMPLES.length} sample profiles (sample: true). Remove with --remove.`);
}
process.exitCode = 0;
