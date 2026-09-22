/**
 * Sample counsellors, so the matching flow can be seen working before real
 * counsellors are verified.
 *
 *   node scripts/seed-sample-counsellors.mjs           # add (or refresh) them
 *   node scripts/seed-sample-counsellors.mjs --remove  # delete every sample
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
const col = db.collection("counsellorProfiles");

const NOTE = "Sample profile for testing Talk — not a real counsellor.";

// Varied on purpose: every language, both genders, every profession and
// format, so matching has real choices to make.
const SAMPLES = [
  ["awa-jallow", "Awa Jallow", "counsellor", "woman", "Banjul", ["wo", "en"], ["grief", "family", "depression"], ["video", "voice"], 800, 9, 4.8],
  ["lamin-ceesay", "Lamin Ceesay", "psychologist", "man", "Serrekunda", ["en", "wo", "mnk"], ["anxiety", "trauma", "workplace"], ["video", "in-person"], 2500, 12, 4.7],
  ["fatoumata-bah", "Fatoumata Bah", "social-worker", "woman", "Brikama", ["ff", "wo", "en"], ["family", "youth", "substance"], ["in-person", "voice"], 700, 7, 4.6],
  ["ebrima-touray", "Ebrima Touray", "coach", "man", "Bakau", ["en"], ["workplace", "self-esteem", "academic"], ["video", "chat"], 1200, 5, 4.5],
  ["isatou-sowe", "Isatou Sowe", "therapist", "woman", "Kanifing", ["en", "mnk"], ["trauma", "anxiety", "relationships"], ["video"], 2000, 10, 4.9],
  ["modou-njie", "Modou Njie", "counsellor", "man", "Farafenni", ["wo", "en"], ["grief", "depression", "sleep"], ["voice", "chat"], 750, 6, 4.4],
  ["mariama-darboe", "Mariama Darboe", "psychiatric-nurse", "woman", "Basse", ["mnk", "ff", "en"], ["depression", "anxiety", "sleep"], ["in-person", "voice"], 900, 14, 4.7],
  ["ousman-camara", "Ousman Camara", "counsellor", "man", "Serrekunda", ["en", "wo"], ["youth", "academic", "relationships"], ["chat", "video"], 800, 4, 4.3],
  ["ndey-faal", "Ndey Faal", "therapist", "woman", "Bijilo", ["wo", "en"], ["grief", "trauma", "sleep"], ["video", "in-person"], 1800, 8, 4.8],
  ["kaddy-jobe", "Kaddy Jobe", "counsellor", "woman", "Lamin", ["en", "wo", "mnk"], ["relationships", "family", "self-esteem"], ["video", "voice", "chat"], 1000, 3, 4.5],
];

const HEADLINE = {
  counsellor: "Counsellor — a calm space to talk things through",
  psychologist: "Clinical psychologist — anxiety, trauma and work stress",
  "social-worker": "Social worker — family support and practical help",
  coach: "Life coach — confidence, direction and goals",
  therapist: "Therapist — working through what weighs on you",
  "psychiatric-nurse": "Psychiatric nurse — mood, anxiety and sleep",
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
  for (const [id, name, profession, gender, location, languages, specializations, formats, rate, years, rating] of SAMPLES) {
    batch.set(col.doc(`sample-${id}`), {
      displayName: name,
      headline: HEADLINE[profession],
      bio: `${NOTE}\n\nWorks with people from ${location} and across The Gambia.`,
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
      profession,
      gender,
      formats,
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
