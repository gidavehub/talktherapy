/**
 * Unit test for the provider application's own rules
 * (app/lib/providerApplication.ts) — the checks every step runs as it is
 * filled in, and that submitProviderApplication runs again on the server
 * before anything reaches staff.
 *
 *   cd functions && npm run build && cd .. && node scripts/test-provider-application.mts
 *
 * Runs the COMPILED copy in functions/lib — the one the Cloud Functions
 * actually execute. (Node's own TypeScript runner cannot follow the module's
 * imports of ./matching and ./money, which have no file extension.)
 *
 * Offline: no Firebase, no network.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../functions/lib/app/lib/providerApplication.js") as typeof import("../app/lib/providerApplication.ts");

type App = import("../app/lib/providerApplication.ts").ApplicationSections & { uid: string };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const keys = (o: object) => Object.keys(o).sort().join(",");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The evaluator's "today": Wednesday 14 October 2026, 12:30 in Banjul (UTC). */
const NOW = Date.UTC(2026, 9, 14, 12, 30);
const UID = "applicant-1";

/** A complete application, which every check below then breaks one piece of. */
function complete(): App {
  return {
    uid: UID,
    personal: {
      legalName: "Awa Ceesay",
      displayName: "Awa Ceesay",
      gender: "woman",
      dateOfBirth: "1990-05-20",
      phone: "+2207000000",
      area: "banjul",
      town: "banjul",
    },
    professional: {
      services: ["therapy"],
      yearsExperience: 9,
      workplace: "Royal Victoria Teaching Hospital",
      registrationBody: "",
      registrationNumber: "",
      specializations: ["anxiety", "grief"],
      ageGroups: ["adults"],
      formats: ["video", "voice"],
      languages: ["en", "wo"],
      otherLanguages: "",
    },
    qualifications: [{ id: "q1", title: "BSc Psychology", institution: "University of The Gambia", year: 2014, country: "The Gambia" }],
    practice: {
      headline: "Counselling for grief and worry",
      bio: "b".repeat(200),
      approach: "a".repeat(60),
      firstSession: "",
    },
    fee: { sessionRateMinor: 1_000_00 },
    photo: { path: `provider-credentials/${UID}/photo-abc123.jpg` },
    documents: [
      { id: "d1", type: "id", name: "id.jpg", path: `provider-credentials/${UID}/d1.jpg`, contentType: "image/jpeg", bytes: 200_000, uploadedAt: NOW },
      { id: "d2", type: "degree", name: "bsc.pdf", path: `provider-credentials/${UID}/d2.pdf`, contentType: "application/pdf", bytes: 900_000, uploadedAt: NOW },
    ],
    availability: { ranges: [{ id: "r1", day: 1, start: "09:00", end: "12:00" }] },
    payout: { network: "wave", accountHint: "••• 0000", beneficiaryName: "Awa Ceesay" },
    agreements: {
      accepted: { conduct: true, confidentiality: true, safeguarding: true, fees: true, accuracy: true },
      signature: "Awa Ceesay",
      signedAt: NOW,
    },
  };
}

// --- the whole thing --------------------------------------------------------
check("a complete application has nothing left to do", A.incompleteSteps(complete(), NOW).length === 0,
  A.incompleteSteps(complete(), NOW).join(","));
check("a complete application is 100% done", A.completion(complete(), NOW) === 1);
check("ten sections, the review is not one of them", A.SECTION_IDS.length === 10 && !A.SECTION_IDS.includes("review" as never));
check("the applicant may write exactly the sections, lastStep and updatedAt",
  same([...A.APPLICANT_KEYS], [...A.SECTION_IDS, "lastStep", "updatedAt"]));

// firestore.rules keeps its own copy of that list; the two must never drift,
// or a section the screens save is refused (or one they never write is let in).
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const listed = /function applicantKeys\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules)?.[1];
const ruleKeys = (listed ?? "").match(/'([^']+)'/g)?.map((k) => k.slice(1, -1)) ?? [];
check("firestore.rules allows exactly APPLICANT_KEYS", same([...ruleKeys].sort(), [...A.APPLICANT_KEYS].sort()),
  `rules: ${ruleKeys.join(",")}`);
const sane = /function sane\(data\)\s*\{([\s\S]*?)\n\s*\}/.exec(rules)?.[1] ?? "";
check("firestore.rules caps documents at MAX_DOCUMENTS", sane.includes(`data.documents.size() <= ${A.MAX_DOCUMENTS}`));
const storage = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
check("storage.rules caps a file at DOC_MAX_BYTES", storage.includes(`request.resource.size <= ${A.DOC_MAX_BYTES}`));
check("storage.rules takes exactly DOC_ACCEPT", storage.includes(`matches('${A.DOC_ACCEPT.join("|")}')`));

// The number beside Providers in the staff menu counts these two, and the
// "waiting" filter on the applications list shows the same ones.
check("waiting on staff means sent, or being checked", same([...A.AWAITING_STAFF].sort(), ["in_review", "submitted"]));

// A notice for all of staff is addressed by one word in three places: the
// functions that write it, the rules that let staff read it and mark it read,
// and the bell that asks for it. If they drift, staff see nothing.
const functionsSource = readFileSync(new URL("../functions/src/providers.ts", import.meta.url), "utf8");
const bellSource = readFileSync(new URL("../app/lib/notifications.ts", import.meta.url), "utf8");
const staffWord = /STAFF_NOTICES = "([^"]+)"/.exec(bellSource)?.[1];
check("the functions write staff notices to the word the bell reads", staffWord !== undefined && new RegExp(`notification\\(\\s*"${staffWord}"`).test(functionsSource));
check("the rules let staff read and mark read that same word",
  (rules.match(new RegExp(`resource\\.data\\.to == '${staffWord}'`, "g")) ?? []).length === 2);

// --- phone --------------------------------------------------------------------
const phones: [string, string | null][] = [
  ["700 0000", "+2207000000"],
  ["7000000", "+2207000000"],
  ["+220 700 0000", "+2207000000"],
  ["220 7000000", "+2207000000"],
  ["00220 700 0000", "+2207000000"],
  ["(+220) 300-1234", "+2203001234"],
  ["9912345", "+2209912345"],
  ["1234567", null],
  ["4000000", null],
  ["8000000", null],
  ["700000", null],
  ["70000000", null],
  ["+221 700 0000", null],
  ["", null],
];
for (const [typed, want] of phones) {
  const got = A.gambianPhone(typed);
  check(`phone ${JSON.stringify(typed)} → ${want}`, got === want, `got ${got}`);
}
check("a stored number reads back spaced", A.formatPhone("+2207000000") === "+220 700 0000");
check("a phone the checks refuse is marked", "phone" in A.checkPersonal({ ...complete().personal, phone: "123" }, NOW));

// --- age ----------------------------------------------------------------------
const ages: [string, number | null][] = [
  ["2008-10-14", 18], // eighteen today
  ["2008-10-15", 17], // eighteen tomorrow
  ["2008-11-01", 17],
  ["1990-05-20", 36],
  ["2000-02-29", 26],
  ["2001-02-29", null], // not a leap year
  ["2008-02-30", null],
  ["2008-13-01", null],
  ["2008-00-10", null],
  ["2008-1-1", null],
  ["abcd-ef-gh", null],
  ["", null],
];
for (const [dob, want] of ages) {
  const got = A.ageOn(dob, NOW);
  check(`age on ${JSON.stringify(dob)} is ${want}`, got === want, `got ${got}`);
}
const dobProblem = (dateOfBirth: string) => A.checkPersonal({ ...complete().personal, dateOfBirth }, NOW).dateOfBirth;
check("eighteen today may apply", dobProblem("2008-10-14") === undefined);
check("seventeen may not", dobProblem("2008-10-15") === "Providers on TALK are 18 or older.");
check("a day that does not exist is called out", dobProblem("2008-02-30") === "That date does not exist — check the day.");
check("a half-chosen date asks for the date", dobProblem("2008--") === "Your date of birth.");
check("an empty date asks for the date", dobProblem("") === "Your date of birth.");
check("over a hundred is checked", dobProblem("1920-01-01") === "Check the year.");

// --- the rest of "about you" ------------------------------------------------
const personal = (patch: object) => keys(A.checkPersonal({ ...complete().personal, ...patch }, NOW));
check("a one-letter shown name is refused", personal({ displayName: "A" }) === "displayName");
check("a short legal name is refused", personal({ legalName: "Aw" }) === "legalName");
check("gender must be chosen", personal({ gender: null }) === "gender");
check("'rather not say' is an answer", personal({ gender: "unsaid" }) === "");
check("a region must be chosen", personal({ area: null }) === "area");

// --- professional -----------------------------------------------------------
const professional = (patch: object) => keys(A.checkProfessional({ ...complete().professional, ...patch }));
check("a fraction of a year is refused", professional({ yearsExperience: 3.5 }) === "yearsExperience");
check("sixty-one years is refused", professional({ yearsExperience: 61 }) === "yearsExperience");
check("no years at all is refused", professional({ yearsExperience: null }) === "yearsExperience");
check("a registration number needs its body", professional({ registrationNumber: "GMC-123" }) === "registrationBody");
check("nine specialisations is too many", professional({
  specializations: ["anxiety", "depression", "grief", "trauma", "relationships", "stress", "addiction", "family", "youth"],
}).includes("specializations"));
check("no language is refused", professional({ languages: [] }) === "languages");
check("no format is refused", professional({ formats: [] }) === "formats");

// --- qualifications -----------------------------------------------------------
const quals = (list: object[]) => keys(A.checkQualifications(list as never, NOW));
const q = complete().qualifications[0];
check("no qualification is refused", quals([]) === "list");
check("a year after this one is refused", quals([{ ...q, year: 2027 }]) === "0.year");
check("this year is fine", quals([{ ...q, year: 2026 }]) === "");
check("1949 is refused", quals([{ ...q, year: 1949 }]) === "0.year");
check("nine qualifications is too many", quals(Array.from({ length: 9 }, () => q)) === "list");

// --- practice: lengths, counted without the spaces around ---------------------
const practice = (patch: object) => keys(A.checkPractice({ ...complete().practice, ...patch }));
check("a nine-letter headline is too short", practice({ headline: "x".repeat(9) }) === "headline");
check("a ten-letter headline is fine", practice({ headline: "x".repeat(10) }) === "");
check(`a ${A.HEADLINE_MAX}-letter headline is fine`, practice({ headline: "x".repeat(A.HEADLINE_MAX) }) === "");
check(`${A.HEADLINE_MAX + 1} letters is too long`, practice({ headline: "x".repeat(A.HEADLINE_MAX + 1) }) === "headline");
check(`a bio of ${A.BIO_MIN - 1} is too short`, practice({ bio: "b".repeat(A.BIO_MIN - 1) }) === "bio");
check(`a bio of ${A.BIO_MIN} is fine`, practice({ bio: "b".repeat(A.BIO_MIN) }) === "");
check(`a bio of ${A.BIO_MAX} is fine`, practice({ bio: "b".repeat(A.BIO_MAX) }) === "");
check(`a bio of ${A.BIO_MAX + 1} is too long`, practice({ bio: "b".repeat(A.BIO_MAX + 1) }) === "bio");
check("spaces do not pad a bio out", practice({ bio: `${" ".repeat(40)}${"b".repeat(A.BIO_MIN - 1)}${" ".repeat(40)}` }) === "bio");
check(`an approach of ${A.APPROACH_MIN - 1} is too short`, practice({ approach: "a".repeat(A.APPROACH_MIN - 1) }) === "approach");
check(`an approach of ${A.APPROACH_MAX + 1} is too long`, practice({ approach: "a".repeat(A.APPROACH_MAX + 1) }) === "approach");
check("a first session may be left out", practice({ firstSession: "" }) === "");
check(`a first session over ${A.FIRST_SESSION_MAX} is too long`, practice({ firstSession: "f".repeat(A.FIRST_SESSION_MAX + 1) }) === "firstSession");

// --- fee ----------------------------------------------------------------------
const fee = (sessionRateMinor: number | null) => A.checkFee({ sessionRateMinor }).sessionRateMinor ?? "";
check("no fee is refused", fee(null) === "Set your fee.");
check("the lowest fee is allowed", fee(A.RATE_RANGE.min) === "");
check("the highest fee is allowed", fee(A.RATE_RANGE.max) === "");
check("a butut under the lowest is refused", fee(A.RATE_RANGE.min - 100).startsWith("Between"));
check("a dalasi over the highest is refused", fee(A.RATE_RANGE.max + 100).startsWith("Between"));
check("half a dalasi is refused", fee(A.RATE_RANGE.min + 50) === "Whole dalasi only.");
check("a fraction of a butut is refused", fee(A.RATE_RANGE.min + 0.5) === "Set your fee.");
check("NaN is refused", fee(Number.NaN) === "Set your fee.");
check("the range is D700 to D3,000", A.RATE_RANGE.min === 700_00 && A.RATE_RANGE.max === 3_000_00);
check("take-home is the fee less TALK's 15%", A.takeHomeMinor(1_000_00) === 850_00, String(A.takeHomeMinor(1_000_00)));

// --- whose files ------------------------------------------------------------
const own: [string, boolean][] = [
  [`provider-credentials/${UID}/d1.pdf`, true],
  [`provider-credentials/${UID}/photo-abc.jpg`, true],
  [`provider-credentials/someone-else/d1.pdf`, false],
  [`provider-credentials/${UID}/`, false],
  [`provider-credentials/${UID}/sub/d1.pdf`, false],
  [`provider-credentials/${UID}/../someone-else/d1.pdf`, false],
  [`provider-credentials/${UID}/..`, false],
  [`provider-credentials/${UID}/.hidden`, false],
  [`avatars/${UID}/provider.jpg`, false],
  [`provider-credentials/${UID}x/d1.pdf`, false],
];
for (const [path, want] of own) check(`${want ? "own" : "not own"}: ${path}`, A.isOwnCredentialPath(path, UID) === want);
check("no uid owns nothing", A.isOwnCredentialPath("provider-credentials//d1.pdf", "") === false);

// --- photo ------------------------------------------------------------------
check("no photo is refused", keys(A.checkPhoto({ path: null }, UID)) === "path");
check("somebody else's photo is refused", keys(A.checkPhoto({ path: "provider-credentials/other/photo.jpg" }, UID)) === "path");
check("their own photo is fine", keys(A.checkPhoto({ path: `provider-credentials/${UID}/photo-1.jpg` }, UID)) === "");

// --- documents --------------------------------------------------------------
const [idDoc, degree] = complete().documents;
const docs = (list: object[]) => A.checkDocuments(list as never, UID);
check("an ID and a certificate is enough", keys(docs([idDoc, degree])) === "");
check("a licence counts as the qualification", keys(docs([idDoc, { ...degree, type: "licence" }])) === "");
check("no ID is refused", keys(docs([degree])) === "id");
check("no certificate or licence is refused", keys(docs([idDoc, { ...degree, type: "reference" }])) === "qualification");
check("nothing at all asks for both", keys(docs([])) === "id,qualification");
check("somebody else's file is refused", docs([idDoc, { ...degree, path: "provider-credentials/other/d2.pdf" }])["1"] === "Upload this one again.");
check("a text file is refused", docs([idDoc, { ...degree, contentType: "text/plain" }])["1"] === "PDF, JPG, PNG or WebP only.");
check("an empty file is refused", docs([idDoc, { ...degree, bytes: 0 }])["1"] === "10 MB at most.");
check("exactly 10 MB is fine", keys(docs([idDoc, { ...degree, bytes: A.DOC_MAX_BYTES }])) === "");
check("a byte over 10 MB is refused", docs([idDoc, { ...degree, bytes: A.DOC_MAX_BYTES + 1 }])["1"] === "10 MB at most.");
check("10 MB is ten million bytes, as phones count it", A.DOC_MAX_BYTES === 10_000_000);
check(`more than ${A.MAX_DOCUMENTS} documents is refused`, "list" in docs(Array.from({ length: A.MAX_DOCUMENTS + 1 }, (_, i) => ({ ...idDoc, id: `d${i}` }))));

// --- what a chosen file is ----------------------------------------------------
const types: [string, string, string | null][] = [
  ["scan.pdf", "application/pdf", "application/pdf"],
  ["photo.jpg", "image/jpeg", "image/jpeg"],
  ["SCAN.PDF", "", "application/pdf"],
  ["id.JPEG", "", "image/jpeg"],
  ["id.webp", "", "image/webp"],
  ["id.png", "", "image/png"],
  ["id.heic", "", null],
  ["notes.txt", "text/plain", null],
  ["scan.pdf", "application/x-pdf", null],
  ["noextension", "", null],
  // An SVG can carry script; so can a page that calls itself a picture.
  ["logo.svg", "image/svg+xml", null],
  ["logo.svg", "", null],
  ["page.html", "text/html", null],
  ["page.jpg", "text/html", null],
];
for (const [name, declared, want] of types) {
  check(`${name} (${declared || "no type"}) is ${want}`, A.documentContentType(name, declared) === want);
}

// --- availability -----------------------------------------------------------
const range = (day: number, start: string, end: string, id = `${day}${start}`) => ({ id, day, start, end });
const avail = (ranges: object[]) => A.checkAvailability({ ranges: ranges as never });
check("no hours is refused", keys(avail([])) === "list");
check("44 minutes is too short for a session", keys(avail([range(1, "09:00", "09:44")])) === "0");
check("45 minutes holds one session", keys(avail([range(1, "09:00", "09:45")])) === "");
check("an end before the start is refused", keys(avail([range(1, "12:00", "09:00")])) === "0");
check("overlapping stretches on one day are refused", keys(avail([range(1, "09:00", "12:00"), range(1, "11:00", "13:00")])) === "1");
check("back-to-back stretches are fine", keys(avail([range(1, "09:00", "12:00"), range(1, "12:00", "14:00")])) === "");
check("the same hours on two days are fine", keys(avail([range(1, "09:00", "12:00"), range(2, "09:00", "12:00")])) === "");
check("a day that is not a day is refused", avail([range(7, "09:00", "12:00")])["0"] === "Choose a day.");
check("a time that is not a time is refused", avail([range(1, "09:00", "25:00")])["0"] === "Choose a start and an end.");
check("thirty-one stretches is too many", "list" in avail(Array.from({ length: 31 }, (_, i) => range(i % 7, "09:00", "10:00", `r${i}`))));

check("09:00–12:00 starts at 9, 10 and 11", same(A.startsIn({ start: "09:00", end: "12:00" }), [540, 600, 660]));
check("09:00–09:45 starts once", same(A.startsIn({ start: "09:00", end: "09:45" }), [540]));
check("09:30–10:30 starts at half past", same(A.startsIn({ start: "09:30", end: "10:30" }), [570]));
check("09:00–09:44 never starts", same(A.startsIn({ start: "09:00", end: "09:44" }), []));
check("nonsense never starts", same(A.startsIn({ start: "9am", end: "noon" }), []));
check("a week of Mon 9–12 and Wed 13–15 is five sessions",
  A.weeklySessions([range(1, "09:00", "12:00"), range(3, "13:00", "15:00")] as never) === 5);

// Real times, in UTC — Banjul's own time. NOW is Wednesday 12:30.
const iso = (ms: number[]) => ms.map((t) => new Date(t).toISOString());
const ranges = [range(3, "09:00", "12:00"), range(3, "13:00", "15:00"), range(4, "09:00", "10:00"), range(4, "09:00", "10:00", "dupe")];
const got = iso(A.slotTimesFrom(ranges as never, NOW, 2, NOW + 60 * 60_000));
check("times start an hour from now, in UTC, without repeats",
  same(got, ["2026-10-14T14:00:00.000Z", "2026-10-15T09:00:00.000Z"]), got.join(" "));
const fortnight = A.slotTimesFrom([range(1, "09:00", "12:00")] as never, NOW, 14, NOW);
check("two weeks of Monday mornings is six times", fortnight.length === 6, String(fortnight.length));
check("every one of them is a Monday, on the hour, in UTC",
  fortnight.every((t) => new Date(t).getUTCDay() === 1 && new Date(t).getUTCMinutes() === 0));
check("Sunday is day 0", A.slotTimesFrom([range(0, "10:00", "11:00")] as never, NOW, 7, NOW)
  .every((t) => new Date(t).getUTCDay() === 0));

// --- payout ------------------------------------------------------------------
check("no wallet is refused", keys(A.checkPayout({ network: null, accountHint: "", beneficiaryName: "" })) === "account");
check("a saved wallet is fine", keys(A.checkPayout(complete().payout)) === "");

// --- agreements and the signature -------------------------------------------
const signed = (patch: object, legalName = "Awa Ceesay") => A.checkAgreements({ ...complete().agreements, ...patch }, legalName);
check("signed with their legal name is fine", keys(signed({})) === "");
check("case and spacing do not matter", keys(signed({ signature: "  awa   CEESAY " })) === "");
check("accents do not matter", keys(signed({ signature: "Fatoumata Jallow" }, "Fatoumatá Jallow")) === "");
check("somebody else's name is refused", signed({ signature: "Fatou Jallow" }).signature === "Type your full name exactly as on the first step.");
check("half their name is refused", "signature" in signed({ signature: "Awa" }));
check("an empty signature is refused", signed({ signature: "" }).signature === "Type your full name to sign.");
check("no date of signing is refused", "signature" in signed({ signedAt: null }));
check("punctuation alone never matches an empty legal name", "signature" in signed({ signature: "..." }, ""));
check("every agreement must be accepted", keys(signed({ accepted: { ...complete().agreements.accepted, safeguarding: false } })) === "safeguarding");
check("the safeguarding agreement names the free emergency numbers",
  A.AGREEMENTS.find((a) => a.id === "safeguarding")!.body.some((l) => l.includes("117") && l.includes("116") && l.includes("118")));

// --- reading whatever is on disk --------------------------------------------
const empty = A.toApplication(UID, {});
check("an empty document reads as a fresh draft", empty.status === "draft" && empty.lastStep === "personal" && empty.history.length === 0);
check("an empty document has every section", same(Object.keys(A.EMPTY_SECTIONS).filter((k) => !(k in empty)), []));
check("an empty document needs every step", A.incompleteSteps(empty, NOW).length === A.SECTION_IDS.length);

let junk: ReturnType<typeof A.toApplication> | null = null;
let threw = "";
try {
  junk = A.toApplication(UID, {
    status: "approved-by-me",
    lastStep: "../../admin",
    message: 42,
    personal: "not an object",
    professional: { services: ["therapy", "bogus", 5, "therapy", null], yearsExperience: "nine", languages: ["fr", "wo"] },
    qualifications: "none",
    practice: [1, 2, 3],
    fee: { sessionRateMinor: Number.NaN },
    photo: { path: 7 },
    documents: [null, 5, "x", { path: 7, type: "passport", bytes: "big" }],
    availability: { ranges: [null, {}, { day: "Monday", start: 9, end: "12:00" }] },
    payout: { network: "bank", accountHint: ["x"] },
    agreements: { accepted: { conduct: "yes", fees: true, extra: true }, signature: { name: "x" }, signedAt: "now" },
    history: [null, { type: "approved", at: "yesterday", by: 5 }, { type: "made-up", at: 1 }],
    createdAt: "then",
    submittedAt: Infinity,
  });
} catch (error) {
  threw = String(error);
}
check("junk does not throw", threw === "", threw);
if (junk) {
  check("an unknown status reads as a draft", junk.status === "draft");
  check("an unknown step reads as the first", junk.lastStep === "personal");
  check("a message that is not text is dropped", junk.message === null);
  check("unknown services are dropped, and repeats", same(junk.professional.services, ["therapy"]));
  check("French is not one of TALK's languages", same(junk.professional.languages, ["wo"]));
  check("years that are not a number read as none", junk.professional.yearsExperience === null);
  check("a fee that is not a number reads as none", junk.fee.sessionRateMinor === null);
  check("a photo path that is not text reads as none", junk.photo.path === null);
  check("documents that are not objects become empty lines, not crashes", junk.documents.length === 4 && junk.documents.every((d) => d.type === "other" && d.path === "" && d.bytes === 0));
  check("junk documents fail the document check", "id" in A.checkDocuments(junk.documents, UID));
  check("junk hours read as something to fix", Object.keys(A.checkAvailability(junk.availability)).length > 0);
  check("an unknown network reads as none", junk.payout.network === null);
  check("only a real true accepts an agreement", junk.agreements.accepted.conduct === false && junk.agreements.accepted.fees === true);
  check("no stray agreements", !("extra" in junk.agreements.accepted));
  check("a signature that is not text reads as none", junk.agreements.signature === "" && junk.agreements.signedAt === null);
  check("history keeps its shape", junk.history.length === 3 && junk.history[1].type === "approved" && junk.history[1].at === 0 && !("by" in junk.history[1]));
  check("an unknown history event reads as 'created'", junk.history[2].type === "created");
  check("infinite times read as none", junk.submittedAt === null && junk.createdAt === 0);
  check("junk is far from complete", A.incompleteSteps(junk, NOW).length >= 8);
}
const long = A.toApplication(UID, { practice: { bio: "x".repeat(50_000) }, personal: { legalName: "y".repeat(5_000) } });
check("over-long text is cut to size when read", long.practice.bio.length === 1200 && long.personal.legalName.length === 120);

console.log(failures === 0 ? "\nAll provider application checks passed." : `\n${failures} provider application check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
