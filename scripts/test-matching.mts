/**
 * Unit test for provider matching (app/lib/matching.ts).
 *
 *   node scripts/test-matching.mts
 *
 * Runs the real ranking code — Node strips the types — against profiles
 * shaped like the sample providers, for people with different needs.
 */

import { EMPTY_INTAKE, cleanIntake, mergeIntake, missingFields, rankProviders } from "../app/lib/matching.ts";
import type { Intake, Service } from "../app/lib/matching.ts";
import type { ProviderProfile } from "../app/lib/models.ts";

const P = (
  uid: string,
  services: Service[],
  gender: ProviderProfile["gender"],
  languages: ProviderProfile["languages"],
  specializations: string[],
  ratingAvg = 4.5,
  yearsExperience = 5,
  location: string | null = null,
): ProviderProfile => ({
  uid, displayName: uid, headline: "", bio: "", specializations, languages, qualifications: [], yearsExperience,
  sessionRateMinor: 100000, status: "verified", photoPath: null, ratingAvg, ratingCount: 0, timezone: "Africa/Banjul",
  services, gender, formats: ["video"], location, sample: true, createdAt: 0, updatedAt: 0,
});

const PROFILES = [
  P("awa", ["mental-health-counselling", "psychosocial-support"], "woman", ["wo", "en"], ["grief", "family", "depression"], 4.8, 9),
  P("lamin", ["therapy", "psychotherapy"], "man", ["en", "wo", "mnk"], ["anxiety", "trauma", "workplace"], 4.7, 12),
  P("fatoumata", ["social-work", "psychosocial-support"], "woman", ["ff", "wo", "en"], ["family", "youth", "substance"], 4.6, 7),
  P("ebrima", ["psychosocial-support"], "man", ["en"], ["workplace", "self-esteem", "academic"], 4.5, 5),
  P("isatou", ["therapy", "psychotherapy"], "woman", ["en", "mnk"], ["trauma", "anxiety", "relationships"], 4.9, 10),
  P("modou", ["mental-health-counselling"], "man", ["wo", "en"], ["grief", "depression", "sleep"], 4.4, 6),
  P("mariama", ["mental-health-counselling", "therapy"], "woman", ["mnk", "ff", "en"], ["depression", "anxiety", "sleep"], 4.7, 14),
  P("ndey", ["therapy", "psychotherapy"], "woman", ["wo", "en"], ["grief", "trauma", "sleep"], 4.8, 8),
];

const intake = (p: Partial<Intake>): Intake => ({ ...EMPTY_INTAKE, ...p });

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

console.log("Area — among equal providers, the one in their part of the country comes first");
{
  const here = P("serrekunda-one", ["therapy"], "woman", ["en"], ["anxiety"], 4.5, 5, "Serrekunda");
  const away = P("basse-one", ["therapy"], "woman", ["en"], ["anxiety"], 4.5, 5, "Basse");
  const m = rankProviders([away, here], intake({ language: "english", concerns: ["anxiety"], servicesWanted: ["therapy"], providerGender: "any", location: "kanifing" }));
  check(m[0].profile.uid === "serrekunda-one", `nearer provider first (got ${m[0].profile.uid})`);
  check(m[0].reasons.includes("Kanifing and Serrekunda"), `and says why: ${m[0].reasons.join(" · ")}`);
}

console.log("\nUnder 18 — someone who works with young people comes first");
{
  const youth = P("youth-worker", ["mental-health-counselling"], "woman", ["en"], ["youth", "anxiety"], 4.4, 4);
  const adult = P("adults-only", ["mental-health-counselling"], "woman", ["en"], ["anxiety"], 4.9, 20);
  const m = rankProviders([adult, youth], intake({ language: "english", ageRange: "under-18", concerns: ["anxiety"], servicesWanted: ["mental-health-counselling"], providerGender: "any" }));
  check(m[0].profile.uid === "youth-worker", `young-people specialist first, despite a lower rating (got ${m[0].profile.uid})`);
}

console.log("\nFatou — Wolof, grief + sleep, mental health counselling, a woman");
{
  const m = rankProviders(PROFILES, intake({ language: "wolof", concerns: ["grief", "sleep"], servicesWanted: ["mental-health-counselling"], providerGender: "woman" }));
  console.log(`  order: ${m.map((x) => x.profile.uid).join(", ")}`);
  const top = m[0].profile;
  check(top.languages.includes("wo") && top.gender === "woman" && top.services.includes("mental-health-counselling"),
    `top (${top.uid}) speaks Wolof, is a woman, offers mental health counselling`);
  check(m.slice(0, 2).every((x) => x.profile.gender === "woman"), "no man in the top two");
  check(m[0].reasons.includes("Speaks Wolof") && m[0].reasons.includes("Woman"), `reasons say why: ${m[0].reasons.join(" · ")}`);
  check(m.findIndex((x) => x.profile.uid === "ebrima") > 4, "an English-only man offering a different service is near the bottom");
}

console.log("\nMandinka speaker — anxiety, therapy, a man");
{
  const m = rankProviders(PROFILES, intake({ language: "mandinka", concerns: ["anxiety"], servicesWanted: ["therapy"], providerGender: "man" }));
  check(m[0].profile.uid === "lamin", `top is lamin (got ${m[0].profile.uid}: ${m[0].reasons.join(" · ")})`);
}

console.log("\nPulaar speaker — family, social work, any gender");
{
  const m = rankProviders(PROFILES, intake({ language: "pulaar", concerns: ["family"], servicesWanted: ["social-work"], providerGender: "any" }));
  check(m[0].profile.uid === "fatoumata", `top is fatoumata (got ${m[0].profile.uid})`);
}

console.log("\nEnglish — work stress, psychosocial support");
{
  const m = rankProviders(PROFILES, intake({ language: "english", concerns: ["workplace"], servicesWanted: ["psychosocial-support"], providerGender: "any" }));
  check(m[0].profile.uid === "ebrima", `top is ebrima (got ${m[0].profile.uid}: ${m[0].reasons.join(" · ")})`);
}

console.log("\nTwo services wanted — either one counts");
{
  const m = rankProviders(PROFILES, intake({ language: "english", concerns: ["trauma"], servicesWanted: ["therapy", "psychotherapy"], providerGender: "woman" }));
  check(["isatou", "ndey"].includes(m[0].profile.uid), `top offers therapy and is a woman (got ${m[0].profile.uid})`);
}

console.log("\nNo intake at all");
{
  const m = rankProviders(PROFILES, null);
  check(m.length === PROFILES.length, "nobody is filtered out");
  check(m.every((x) => x.reasons.length === 0), "no invented reasons");
}

console.log("\nIntake plumbing");
{
  const dirty = cleanIntake(
    { language: "klingon", concerns: ["grief", "bogus", "grief"], servicesWanted: ["therapy", "coaching"], providerGender: 7 },
    ["english", "wolof", "mandinka", "pulaar", "other"],
  );
  check(dirty.language === null && dirty.providerGender === null, "invalid values are dropped");
  check(dirty.concerns.join() === "grief", "concerns are validated and de-duplicated");
  check(dirty.servicesWanted.join() === "therapy", "a service that no longer exists is dropped");
  const merged = mergeIntake(
    intake({ preferredName: "Fatou", concerns: ["grief"], servicesWanted: ["therapy"] }),
    { preferredName: null, concerns: ["sleep"], servicesWanted: ["psychotherapy"] },
  );
  check(merged.preferredName === "Fatou", "a turn that says nothing never erases an answer");
  check(merged.concerns.join() === "grief,sleep", "concerns accumulate");
  check(merged.servicesWanted.join() === "therapy,psychotherapy", "services accumulate");
  check(
    missingFields(merged).join() === "ageRange,location,gender,providerGender",
    `missing: ${missingFields(merged).join(", ") || "(none)"}`,
  );
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
