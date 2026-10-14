/**
 * Security-rule tests for provider applications: the application itself,
 * staff's working space, notifications, and the private files an applicant
 * sends (their ID, certificates and photo).
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<owner>) \
 *     node scripts/test-rules-providers.mjs
 *
 * Same evaluator and the same set-up as scripts/test-security-rules.mjs:
 * Firebase's own rules engine (firebaserules.googleapis.com :test), given the
 * rules source from disk and synthetic requests. No emulator, no accounts, no
 * real data. Storage rules are evaluated the same way, against storage.rules,
 * with request paths shaped /b/<bucket>/o/<path>.
 *
 * The invariants: an applicant writes only the parts of their application
 * they fill in, only while it is theirs to edit — never its status, the
 * staff's message or its history; nobody else reads it; staff's notes are
 * staff's alone and cannot be rewritten; a notification is read by whoever it
 * is for and changed only to mark it read — a notice shared by all of staff
 * read by each of them for themselves alone; and an applicant's documents are
 * seen by them and by staff, are the types and sizes a reviewer can open, and
 * cannot be swapped once uploaded.
 *
 * The evaluator is reached over the network, which is not always there: a
 * call that fails to connect is tried again a few times before giving up.
 */

import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/talk-admin-sa.json";
const BUCKET = "talk-therapy-509209.firebasestorage.app";

const DOCS = `/databases/(default)/documents`;
const APPLICANT = "applicant-uid";
const OTHER_PROVIDER = "other-provider-uid";
const PATIENT = "patient-uid";
const ADMIN = "admin-uid";
const OTHER_ADMIN = "other-admin-uid";
const NOW = "2026-10-14T12:30:00Z";
const BACKDATED = "2026-10-01T12:30:00Z";

const APP = `${DOCS}/providerApplications/${APPLICANT}`;

/** A draft as startApplication writes it. */
const draft = {
  uid: APPLICANT,
  status: "draft",
  createdAt: 1_791_000_000_000,
  updatedAt: 1_791_000_000_000,
  lastStep: "personal",
  personal: { legalName: "Awa Ceesay", displayName: "Awa Ceesay", gender: null, dateOfBirth: "", phone: "", area: null, town: "" },
  professional: { services: [], yearsExperience: null, workplace: "", registrationBody: "", registrationNumber: "", specializations: [], ageGroups: [], formats: ["video"], languages: [], otherLanguages: "" },
  qualifications: [],
  practice: { headline: "", bio: "", approach: "", firstSession: "" },
  fee: { sessionRateMinor: null },
  photo: { path: null },
  documents: [],
  availability: { ranges: [] },
  payout: { network: null, accountHint: "", beneficiaryName: "" },
  agreements: { accepted: {}, signature: "", signedAt: null },
};
/** The same application once the functions have taken it further. */
const at = (status, extra = {}) => ({ ...draft, status, history: [{ at: 1, type: "submitted" }], message: null, submittedAt: 2, ...extra });
/** A step saved, as saveSections writes it. */
const saved = (base) => ({ ...base, personal: { ...base.personal, town: "banjul" }, lastStep: "professional", updatedAt: 1_791_000_100_000 });

const doc = (i) => ({ id: `d${i}`, type: "other", name: `f${i}.pdf`, path: `provider-credentials/${APPLICANT}/d${i}.pdf`, contentType: "application/pdf", bytes: 1000, uploadedAt: 1 });

const note = { authorId: ADMIN, authorName: "Staff member", body: "Called the registration body; number checks out.", createdAt: NOW };
const forApplicant = { to: APPLICANT, title: "Application received", body: "We will review it.", href: "/apply/status", createdAt: 1, readAt: null };
const forStaff = { to: "staff", title: "New provider application", body: "Awa Ceesay has applied to join.", href: `/admin/providers/${APPLICANT}`, createdAt: 1, readAt: null };

/** [what, expectation, uid, method, path, existing, incoming] */
const FIRESTORE = [
  // --- starting an application -------------------------------------------
  ["a provider starts their own draft", "ALLOW", APPLICANT, "create", APP, null, draft],
  ["a patient account cannot start one", "DENY", PATIENT, "create", `${DOCS}/providerApplications/${PATIENT}`, null, { ...draft, uid: PATIENT }],
  ["a provider cannot start somebody else's", "DENY", OTHER_PROVIDER, "create", APP, null, draft],
  ["the uid inside must be their own", "DENY", APPLICANT, "create", APP, null, { ...draft, uid: OTHER_PROVIDER }],
  ["it cannot start out sent", "DENY", APPLICANT, "create", APP, null, { ...draft, status: "submitted" }],
  ["it cannot start out approved", "DENY", APPLICANT, "create", APP, null, { ...draft, status: "approved" }],
  ["it cannot start with a staff message", "DENY", APPLICANT, "create", APP, null, { ...draft, message: "Approved, well done" }],
  ["it cannot start with a history", "DENY", APPLICANT, "create", APP, null, { ...draft, history: [{ at: 1, type: "approved" }] }],
  ["it cannot start with a decision date", "DENY", APPLICANT, "create", APP, null, { ...draft, decidedAt: 1 }],

  // --- filling it in -------------------------------------------------------
  ["the applicant saves a step of their draft", "ALLOW", APPLICANT, "update", APP, draft, saved(draft)],
  ["they cannot send it themselves", "DENY", APPLICANT, "update", APP, draft, { ...saved(draft), status: "submitted" }],
  ["they cannot approve themselves", "DENY", APPLICANT, "update", APP, draft, { ...draft, status: "approved" }],
  ["they cannot write the staff message", "DENY", APPLICANT, "update", APP, draft, { ...draft, message: "Looks great" }],
  ["they cannot write the history", "DENY", APPLICANT, "update", APP, draft, { ...draft, history: [{ at: 1, type: "approved" }] }],
  ["they cannot set when it was sent", "DENY", APPLICANT, "update", APP, draft, { ...draft, submittedAt: 1 }],
  ["they cannot change whose it is", "DENY", APPLICANT, "update", APP, draft, { ...draft, uid: OTHER_PROVIDER }],
  ["they cannot name a reviewer", "DENY", APPLICANT, "update", APP, draft, { ...draft, reviewerId: ADMIN }],
  ["they cannot edit it once sent", "DENY", APPLICANT, "update", APP, at("submitted"), saved(at("submitted"))],
  ["they cannot edit it while it is reviewed", "DENY", APPLICANT, "update", APP, at("in_review"), saved(at("in_review"))],
  ["they cannot edit it once approved", "DENY", APPLICANT, "update", APP, at("approved"), saved(at("approved"))],
  ["they cannot edit it once rejected", "DENY", APPLICANT, "update", APP, at("rejected"), saved(at("rejected"))],
  ["they cannot un-reject it", "DENY", APPLICANT, "update", APP, at("rejected"), { ...at("rejected"), status: "draft" }],
  ["sent back for changes, they can edit again", "ALLOW", APPLICANT, "update", APP, at("changes_requested"), saved(at("changes_requested"))],
  ["sent back, they still cannot send it themselves", "DENY", APPLICANT, "update", APP, at("changes_requested"), { ...saved(at("changes_requested")), status: "submitted" }],
  ["sent back, they cannot clear the staff message", "DENY", APPLICANT, "update", APP, at("changes_requested", { message: "Fix the ID" }), { ...at("changes_requested"), message: null }],
  ["twelve documents fit", "ALLOW", APPLICANT, "update", APP, draft, { ...draft, documents: Array.from({ length: 12 }, (_, i) => doc(i)) }],
  ["thirteen do not", "DENY", APPLICANT, "update", APP, draft, { ...draft, documents: Array.from({ length: 13 }, (_, i) => doc(i)) }],
  ["documents must be a list", "DENY", APPLICANT, "update", APP, draft, { ...draft, documents: "lots" }],
  ["nine qualifications do not fit", "DENY", APPLICANT, "update", APP, draft, { ...draft, qualifications: Array.from({ length: 9 }, (_, i) => ({ id: `q${i}` })) }],
  ["thirty-one stretches of hours do not fit", "DENY", APPLICANT, "update", APP, draft, { ...draft, availability: { ranges: Array.from({ length: 31 }, (_, i) => ({ id: `r${i}` })) } }],
  ["somebody else cannot edit it", "DENY", OTHER_PROVIDER, "update", APP, draft, saved(draft)],
  ["staff cannot decide it from the browser", "DENY", ADMIN, "update", APP, at("submitted"), { ...at("submitted"), status: "approved" }],
  ["nobody deletes it, not even its owner", "DENY", APPLICANT, "delete", APP, draft],
  ["staff do not delete it either", "DENY", ADMIN, "delete", APP, draft],

  // --- reading it ----------------------------------------------------------
  ["the applicant reads their own", "ALLOW", APPLICANT, "get", APP, at("submitted")],
  ["another provider cannot", "DENY", OTHER_PROVIDER, "get", APP, at("submitted")],
  ["a patient cannot", "DENY", PATIENT, "get", APP, at("submitted")],
  ["nobody signed out can", "DENY", null, "get", APP, at("submitted")],
  ["staff read it", "ALLOW", ADMIN, "get", APP, at("submitted")],
  ["staff list them all", "ALLOW", ADMIN, "list", APP, at("submitted")],
  ["a provider cannot list them", "DENY", APPLICANT, "list", APP, at("submitted")],

  // --- staff's working space -----------------------------------------------
  ["staff read the checklist", "ALLOW", ADMIN, "get", `${DOCS}/providerReviews/${APPLICANT}`, { checks: { identity: true } }],
  ["staff tick the checklist", "ALLOW", ADMIN, "update", `${DOCS}/providerReviews/${APPLICANT}`, { checks: {} }, { checks: { identity: true }, updatedBy: ADMIN }],
  ["the applicant cannot read it", "DENY", APPLICANT, "get", `${DOCS}/providerReviews/${APPLICANT}`, { checks: { identity: true } }],
  ["the applicant cannot tick it", "DENY", APPLICANT, "create", `${DOCS}/providerReviews/${APPLICANT}`, null, { checks: { identity: true } }],
  ["staff add a note as themselves", "ALLOW", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, note],
  ["a note in another staff member's name", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, authorId: "another-admin" }],
  ["a backdated note", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, createdAt: BACKDATED }],
  ["an empty note", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, body: "" }],
  ["a note over 2,000 characters", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, body: "x".repeat(2001) }],
  ["a note with extra fields", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, pinned: true }],
  ["a note under an over-long name", "DENY", ADMIN, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, authorName: "x".repeat(81) }],
  ["a note cannot be rewritten", "DENY", ADMIN, "update", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, note, { ...note, body: "Never mind." }],
  ["a note cannot be deleted", "DENY", ADMIN, "delete", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, note],
  ["staff read the notes", "ALLOW", ADMIN, "list", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, note],
  ["the applicant cannot read the notes", "DENY", APPLICANT, "list", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, note],
  ["the applicant cannot write a note", "DENY", APPLICANT, "create", `${DOCS}/providerReviews/${APPLICANT}/notes/n1`, null, { ...note, authorId: APPLICANT }],

  // --- notifications -------------------------------------------------------
  ["the recipient reads theirs", "ALLOW", APPLICANT, "get", `${DOCS}/notifications/n1`, forApplicant],
  ["the recipient lists theirs", "ALLOW", APPLICANT, "list", `${DOCS}/notifications/n1`, forApplicant],
  ["somebody else cannot read it", "DENY", OTHER_PROVIDER, "get", `${DOCS}/notifications/n1`, forApplicant],
  ["staff cannot read a person's own", "DENY", ADMIN, "get", `${DOCS}/notifications/n1`, forApplicant],
  ["staff read the ones for staff", "ALLOW", ADMIN, "get", `${DOCS}/notifications/n2`, forStaff],
  ["staff list the ones for staff", "ALLOW", ADMIN, "list", `${DOCS}/notifications/n2`, forStaff],
  ["a provider cannot read the ones for staff", "DENY", APPLICANT, "get", `${DOCS}/notifications/n2`, forStaff],
  ["the recipient marks it read", "ALLOW", APPLICANT, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, readAt: 1_791_000_000_000 }],
  ["they cannot rewrite what it says", "DENY", APPLICANT, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, title: "You are approved", readAt: 5 }],
  ["they cannot redirect it", "DENY", APPLICANT, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, href: "https://evil.example", readAt: 5 }],
  ["read must be a time", "DENY", APPLICANT, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, readAt: "yes" }],
  ["somebody else cannot mark it read", "DENY", OTHER_PROVIDER, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, readAt: 5 }],
  ["staff mark a staff notice read for themselves", "ALLOW", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readBy: [ADMIN] }],
  ["after another member of staff has read it", "ALLOW", ADMIN, "update", `${DOCS}/notifications/n2`, { ...forStaff, readBy: [OTHER_ADMIN] }, { ...forStaff, readBy: [OTHER_ADMIN, ADMIN] }],
  ["marking it read again changes nothing", "ALLOW", ADMIN, "update", `${DOCS}/notifications/n2`, { ...forStaff, readBy: [ADMIN] }, { ...forStaff, readBy: [ADMIN] }],
  ["staff cannot mark it read for somebody else", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readBy: [OTHER_ADMIN] }],
  ["staff cannot mark it unread for somebody else", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, { ...forStaff, readBy: [OTHER_ADMIN] }, { ...forStaff, readBy: [ADMIN] }],
  ["nor stuff the list with copies of themselves", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readBy: [ADMIN, ADMIN] }],
  ["readBy must be a list", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readBy: ADMIN }],
  ["one member of staff cannot clear it for everyone", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readAt: 1_791_000_000_000 }],
  ["staff cannot rewrite a staff notice while marking it", "DENY", ADMIN, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, title: "Nothing to see", readBy: [ADMIN] }],
  ["a provider cannot mark a staff notice read", "DENY", APPLICANT, "update", `${DOCS}/notifications/n2`, forStaff, { ...forStaff, readBy: [APPLICANT] }],
  ["staff cannot mark a person's own notice read", "DENY", ADMIN, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, readBy: [ADMIN] }],
  ["a person's own notice takes no readBy", "DENY", APPLICANT, "update", `${DOCS}/notifications/n1`, forApplicant, { ...forApplicant, readBy: [APPLICANT] }],
  ["nobody makes one in the browser", "DENY", APPLICANT, "create", `${DOCS}/notifications/n3`, null, { ...forApplicant, title: "You are approved" }],
  ["not even staff", "DENY", ADMIN, "create", `${DOCS}/notifications/n3`, null, forStaff],
  ["nobody deletes one", "DENY", APPLICANT, "delete", `${DOCS}/notifications/n1`, forApplicant],

  // --- the counts beside Providers, Support and Review in the staff menu ----
  ["staff count new support requests", "ALLOW", ADMIN, "list", `${DOCS}/supportRequests/s1`, { status: "new", userId: null }],
  ["a provider cannot", "DENY", APPLICANT, "list", `${DOCS}/supportRequests/s1`, { status: "new", userId: null }],
  ["staff count payments held for review", "ALLOW", ADMIN, "list", `${DOCS}/payments/p1`, { needsReview: true, uid: PATIENT }],
  ["staff count payouts flagged", "ALLOW", ADMIN, "list", `${DOCS}/payouts/o1`, { needsReview: true, providerId: OTHER_PROVIDER }],
  ["staff count disputed sessions", "ALLOW", ADMIN, "list", `${DOCS}/bookings/b1`, { disputed: true, participants: [PATIENT, OTHER_PROVIDER] }],
  ["a patient cannot count the disputed sessions", "DENY", PATIENT, "list", `${DOCS}/bookings/b2`, { disputed: true, participants: ["someone", OTHER_PROVIDER] }],

  // --- the old credential paths, read-only now -----------------------------
  ["the old private documents take nothing new", "DENY", APPLICANT, "create", `${DOCS}/providerProfiles/${APPLICANT}/privateDocs/x`, null, { url: "x" }],
  ["the old review queue takes nothing new", "DENY", APPLICANT, "create", `${DOCS}/verificationRequests/v1`, null, { providerId: APPLICANT }],
  ["a provider cannot list themselves", "DENY", APPLICANT, "create", `${DOCS}/providerProfiles/${APPLICANT}`, null, { uid: APPLICANT, status: "verified" }],
];

const file = (name) => `/b/${BUCKET}/o/provider-credentials/${APPLICANT}/${name}`;
const object = (name, contentType, size) => ({ name: `provider-credentials/${APPLICANT}/${name}`, bucket: BUCKET, contentType, size });
const MB10 = 10_000_000;

/** [what, expectation, uid, method, path, existing, incoming, claims] */
const STORAGE = [
  ["the applicant uploads a PDF", "ALLOW", APPLICANT, "create", file("d1.pdf"), null, object("d1.pdf", "application/pdf", 400_000)],
  ["a JPEG", "ALLOW", APPLICANT, "create", file("d2.jpg"), null, object("d2.jpg", "image/jpeg", 400_000)],
  ["a PNG", "ALLOW", APPLICANT, "create", file("d3.png"), null, object("d3.png", "image/png", 400_000)],
  ["a WebP", "ALLOW", APPLICANT, "create", file("d4.webp"), null, object("d4.webp", "image/webp", 400_000)],
  ["exactly 10 MB", "ALLOW", APPLICANT, "create", file("d5.pdf"), null, object("d5.pdf", "application/pdf", MB10)],
  ["a byte over 10 MB", "DENY", APPLICANT, "create", file("d6.pdf"), null, object("d6.pdf", "application/pdf", MB10 + 1)],
  ["an empty file", "DENY", APPLICANT, "create", file("d7.pdf"), null, object("d7.pdf", "application/pdf", 0)],
  ["an HTML page", "DENY", APPLICANT, "create", file("d8.html"), null, object("d8.html", "text/html", 1000)],
  ["an SVG (which can carry script)", "DENY", APPLICANT, "create", file("d9.svg"), null, object("d9.svg", "image/svg+xml", 1000)],
  ["a type that only starts like a PDF", "DENY", APPLICANT, "create", file("d10.pdf"), null, object("d10.pdf", "application/pdf+evil", 1000)],
  ["an upload into somebody else's folder", "DENY", OTHER_PROVIDER, "create", file("d11.pdf"), null, object("d11.pdf", "application/pdf", 1000)],
  ["an upload signed out", "DENY", null, "create", file("d12.pdf"), null, object("d12.pdf", "application/pdf", 1000)],
  ["a checked document cannot be swapped", "DENY", APPLICANT, "update", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000), object("d1.pdf", "application/pdf", 500_000)],
  ["the applicant opens their own", "ALLOW", APPLICANT, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["staff open it, by their claim", "ALLOW", ADMIN, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000), null, { admin: true }],
  ["staff without the claim yet cannot", "DENY", ADMIN, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["a claim that is not true is no claim", "DENY", ADMIN, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000), null, { admin: "true" }],
  ["another provider cannot open it", "DENY", OTHER_PROVIDER, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["a patient cannot open it", "DENY", PATIENT, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["nobody signed out can", "DENY", null, "get", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["the applicant takes one off their draft", "ALLOW", APPLICANT, "delete", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["nobody else deletes it", "DENY", OTHER_PROVIDER, "delete", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000)],
  ["staff do not delete it from the browser", "DENY", ADMIN, "delete", file("d1.pdf"), object("d1.pdf", "application/pdf", 400_000), null, { admin: true }],
  ["the public copy of an approved photo is readable by anyone", "ALLOW", null, "get", `/b/${BUCKET}/o/avatars/${APPLICANT}/provider.jpg`, { name: `avatars/${APPLICANT}/provider.jpg`, bucket: BUCKET, contentType: "image/jpeg", size: 1000 }],
];

/** hasRole() and isAdmin() read the caller's user document. Mocked by path. */
const userDocMocks = [
  [APPLICANT, "provider", false],
  [OTHER_PROVIDER, "provider", true],
  [PATIENT, "patient", true],
  [ADMIN, "admin", true],
].map(([uid, role, verified]) => ({
  function: "get",
  args: [{ exactValue: `${DOCS}/users/${uid}` }],
  result: { value: { data: { uid, role, verified } } },
}));

const auth = (uid, claims) => (uid ? { uid, token: { sub: uid, firebase: { sign_in_provider: "password" }, ...(claims ?? {}) } } : null);

const firestoreCase = ([, expectation, uid, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth: auth(uid),
    path,
    method,
    time: NOW,
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
  functionMocks: userDocMocks,
});

const storageCase = ([, expectation, uid, method, path, existing, incoming, claims]) => ({
  expectation,
  request: {
    auth: auth(uid, claims),
    path,
    method,
    time: NOW,
    ...(incoming ? { resource: incoming } : {}),
  },
  ...(existing ? { resource: existing } : {}),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One call to the evaluator, tried again when the network fails or Google
 * answers with a server error. A refusal (4xx) is an answer, not a blip, and
 * is returned at once.
 */
async function evaluate(token, fileName, source, testCases) {
  let last = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-goog-user-project": PROJECT,
        },
        body: JSON.stringify({
          source: { files: [{ name: fileName, content: source }] },
          testSuite: { testCases },
        }),
      });
      if (res.ok) return { ok: true, body: await res.json() };
      const text = await res.text();
      if (res.status < 500) return { ok: false, error: `rules test API ${res.status}: ${text}` };
      last = `rules test API ${res.status}`;
    } catch (error) {
      last = String(error?.cause?.code ?? error?.message ?? error);
    }
    console.log(`  (evaluator unreachable — ${last}; trying again, ${attempt} of 5)`);
    await sleep(2000 * attempt);
  }
  return { ok: false, error: `the rules evaluator could not be reached: ${last}` };
}

function report(title, cases, { testResults = [], issues = [] }) {
  console.log(`\n${title}`);
  for (const issue of issues) {
    console.log(`  ${issue.severity}: ${issue.description} (line ${issue.sourcePosition?.line})`);
  }
  let failures = 0;
  cases.forEach(([what, expectation], index) => {
    const result = testResults[index];
    const ok = result?.state === "SUCCESS";
    if (!ok) failures += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${expectation.padEnd(5)} ${what}`);
    if (!ok && result?.debugMessages?.length) {
      for (const line of result.debugMessages) console.log(`        ${line}`);
    }
  });
  return failures;
}

/** Inside a function so it can return; see the note in test-security-rules.mjs about process.exit on Windows. */
async function main() {
  const token =
    process.env.RULES_TEST_ACCESS_TOKEN ||
    (await (
      await new GoogleAuth({ keyFile: KEY, scopes: "https://www.googleapis.com/auth/cloud-platform" }).getClient()
    ).getAccessToken()).token;

  let failures = 0;
  const suites = [
    ["Firestore — provider applications, staff review, notifications", "firestore.rules", FIRESTORE, firestoreCase],
    ["Storage — provider-credentials", "storage.rules", STORAGE, storageCase],
  ];
  for (const [title, fileName, cases, toCase] of suites) {
    const source = await readFile(fileName, "utf8");
    const result = await evaluate(token, fileName, source, cases.map(toCase));
    if (!result.ok) {
      console.error(`\n${title}\n  ${result.error}`);
      process.exitCode = 2;
      return;
    }
    failures += report(title, cases, result.body);
  }
  const total = FIRESTORE.length + STORAGE.length;
  console.log(failures ? `\n${failures} of ${total} FAILED` : `\nAll ${total} rule checks passed`);
  process.exitCode = failures ? 1 : 0;
}

await main();
