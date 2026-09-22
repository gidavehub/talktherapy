/**
 * Unit test for counsellor matching (app/lib/matching.ts).
 *
 *   node scripts/test-matching.mts
 *
 * Runs the real ranking code — Node strips the types — against profiles
 * shaped like the sample counsellors, for people with different needs.
 */

import { EMPTY_INTAKE, cleanIntake, mergeIntake, missingFields, rankCounsellors } from "../app/lib/matching.ts";
import type { Intake } from "../app/lib/matching.ts";
import type { CounsellorProfile } from "../app/lib/models.ts";

const P = (
  uid: string,
  profession: CounsellorProfile["profession"],
  gender: CounsellorProfile["gender"],
  languages: CounsellorProfile["languages"],
  specializations: string[],
  formats: CounsellorProfile["formats"],
  ratingAvg = 4.5,
  yearsExperience = 5,
): CounsellorProfile => ({
  uid, displayName: uid, headline: "", bio: "", specializations, languages, qualifications: [], yearsExperience,
  sessionRateMinor: 100000, status: "verified", photoPath: null, ratingAvg, ratingCount: 0, timezone: "Africa/Banjul",
  profession, gender, formats, location: null, sample: true, createdAt: 0, updatedAt: 0,
});

const PROFILES = [
  P("awa", "counsellor", "woman", ["wo", "en"], ["grief", "family", "depression"], ["video", "voice"], 4.8, 9),
  P("lamin", "psychologist", "man", ["en", "wo", "mnk"], ["anxiety", "trauma", "workplace"], ["video", "in-person"], 4.7, 12),
  P("fatoumata", "social-worker", "woman", ["ff", "wo", "en"], ["family", "youth", "substance"], ["in-person", "voice"], 4.6, 7),
  P("ebrima", "coach", "man", ["en"], ["workplace", "self-esteem", "academic"], ["video", "chat"], 4.5, 5),
  P("isatou", "therapist", "woman", ["en", "mnk"], ["trauma", "anxiety", "relationships"], ["video"], 4.9, 10),
  P("modou", "counsellor", "man", ["wo", "en"], ["grief", "depression", "sleep"], ["voice", "chat"], 4.4, 6),
  P("mariama", "psychiatric-nurse", "woman", ["mnk", "ff", "en"], ["depression", "anxiety", "sleep"], ["in-person", "voice"], 4.7, 14),
  P("ndey", "therapist", "woman", ["wo", "en"], ["grief", "trauma", "sleep"], ["video", "in-person"], 4.8, 8),
];

const intake = (p: Partial<Intake>): Intake => ({ ...EMPTY_INTAKE, ...p });
const byId = new Map(PROFILES.map((p) => [p.uid, p]));

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

console.log("Fatou — Wolof, grief + sleep, counselling, a woman, video");
{
  const m = rankCounsellors(PROFILES, intake({ language: "wolof", concerns: ["grief", "sleep"], supportType: "counselling", counsellorGender: "woman", format: "video" }));
  console.log(`  order: ${m.map((x) => x.profile.uid).join(", ")}`);
  const top = m[0].profile;
  check(top.languages.includes("wo") && top.gender === "woman" && top.formats.includes("video") && top.specializations.includes("grief"), `top (${top.uid}) speaks Wolof, is a woman, does video, works with grief`);
  check(m.slice(0, 2).every((x) => x.profile.gender === "woman"), "no man in the top two");
  check(m[0].reasons.includes("Speaks Wolof") && m[0].reasons.includes("Woman"), `reasons say why: ${m[0].reasons.join(" · ")}`);
  check(m.findIndex((x) => x.profile.uid === "ebrima") > 4, "an English-only male coach is near the bottom");
}

console.log("\nMandinka speaker — anxiety, therapy, a man, in person");
{
  const m = rankCounsellors(PROFILES, intake({ language: "mandinka", concerns: ["anxiety"], supportType: "therapy", counsellorGender: "man", format: "in-person" }));
  check(m[0].profile.uid === "lamin", `top is lamin (got ${m[0].profile.uid}: ${m[0].reasons.join(" · ")})`);
}

console.log("\nPulaar speaker — family, social support, any gender, any format");
{
  const m = rankCounsellors(PROFILES, intake({ language: "pulaar", concerns: ["family"], supportType: "social-support", counsellorGender: "any", format: "any" }));
  check(m[0].profile.uid === "fatoumata", `top is fatoumata (got ${m[0].profile.uid})`);
}

console.log("\nEnglish — work stress, coaching, chat");
{
  const m = rankCounsellors(PROFILES, intake({ language: "english", concerns: ["workplace"], supportType: "coaching", counsellorGender: "any", format: "chat" }));
  check(m[0].profile.uid === "ebrima", `top is ebrima (got ${m[0].profile.uid})`);
}

console.log("\nNo intake at all");
{
  const m = rankCounsellors(PROFILES, null);
  check(m.length === PROFILES.length, "nobody is filtered out");
  check(m.every((x) => x.reasons.length === 0), "no invented reasons");
}

console.log("\nIntake plumbing");
{
  const dirty = cleanIntake({ language: "klingon", concerns: ["grief", "bogus", "grief"], supportType: "therapy", format: 7 }, ["english", "wolof", "mandinka", "pulaar", "other"]);
  check(dirty.language === null && dirty.format === null, "invalid values are dropped");
  check(dirty.concerns.length === 1 && dirty.concerns[0] === "grief", "concerns are validated and de-duplicated");
  const merged = mergeIntake(intake({ preferredName: "Fatou", concerns: ["grief"] }), { preferredName: null, concerns: ["sleep"], format: "video" });
  check(merged.preferredName === "Fatou", "a turn that says nothing never erases an answer");
  check(merged.concerns.join() === "grief,sleep", "concerns accumulate");
  check(missingFields(merged).join() === "supportType,counsellorGender", `missing: ${missingFields(merged).join(", ")}`);
  void byId;
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
