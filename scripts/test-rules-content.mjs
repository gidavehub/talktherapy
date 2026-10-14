/**
 * Security-rule tests for the site content (app/lib/content): the published
 * pages, staff's drafts, the version history, the media library, the
 * resource centre's articles with their drafts and history, and the
 * pictures staff upload for the public site.
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<owner>) \
 *     node scripts/test-rules-content.mjs
 *
 * Same evaluator and the same set-up as scripts/test-security-rules.mjs:
 * Firebase's own rules engine (firebaserules.googleapis.com :test), given the
 * rules source from disk and synthetic requests. No emulator, no accounts, no
 * real data. Storage rules are evaluated the same way, against storage.rules,
 * with request paths shaped /b/<bucket>/o/<path>.
 *
 * The invariants: anybody — signed in or not — reads what is published and
 * the media library, because the web server reads them with no credentials;
 * nobody writes either from a browser, staff included (only the functions
 * do, after validating); drafts are staff's alone, saved in staff's own name
 * and only for a section that exists; the version history is read by staff
 * and written by nobody; and a picture for the site is uploaded only by
 * staff (by the admin claim), only as one of four image types, never SVG,
 * never empty or over 8 MB, never over another, and is public to read.
 * Articles in the resource centre follow the pages: anybody reads a published
 * one, and a withdrawn one (no words in it, only the fact); nobody reads one
 * put back to its starter words or anything else; only the functions write
 * them; their drafts are staff's own, under an article id; their history is
 * staff's to read and nobody's to write.
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
const PATIENT = "patient-uid";
const PROVIDER = "provider-uid";
const ADMIN = "admin-uid";
const OTHER_ADMIN = "other-admin-uid";
const NOW = "2026-10-14T12:30:00Z";

const LIVE = `${DOCS}/siteContent/home`;
const DRAFT = `${DOCS}/siteContentDrafts/home`;
const VERSION = `${DOCS}/siteContentVersions/v1`;
const MEDIA = `${DOCS}/siteMedia/abcdef123`;
const ARTICLE = `${DOCS}/resources/seed-grief`;
const NEW_ARTICLE = `${DOCS}/resources/aB3dE5fG7hJ9kL1mN3pQ`;
const ARTICLE_DRAFT = `${DOCS}/resourceDrafts/aB3dE5fG7hJ9kL1mN3pQ`;
const ARTICLE_VERSION = `${DOCS}/resourceVersions/v1`;

/** As publishContent writes it. */
const published = { data: { hero: { eyebrow: "Care that understands your world" } }, rev: 3, publishedAt: 1_791_000_000_000 };
/** As saveDraft in app/lib/content/client.ts writes it. */
const draft = { data: { hero: { eyebrow: "New words" } }, baseRev: 3, updatedAt: 1_791_000_100_000, updatedBy: ADMIN };
const version = {
  sectionId: "home",
  data: published.data,
  rev: 2,
  publishedAt: 1_790_000_000_000,
  replacedAt: 1_791_000_000_000,
  replacedBy: ADMIN,
  action: "publish",
  note: null,
};
const media = {
  id: "abcdef123",
  url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/site-media%2Fabcdef123.webp?alt=media`,
  path: "site-media/abcdef123.webp",
  alt: "Two friends on a bench",
  width: 1200,
  height: 900,
  bytes: 200_000,
  type: "image/webp",
  uploadedBy: ADMIN,
  createdAt: 1_791_000_000_000,
  usage: [],
};

/** As publishResource writes an article (storedResource in app/lib/content/resources.ts). */
const article = {
  id: "seed-grief",
  status: "published",
  slug: "grief-does-not-follow-a-schedule",
  title: "Grief does not follow a schedule",
  summary: "On loss.",
  body: "Words.",
  format: "article",
  topics: ["grief"],
  locales: ["en"],
  readingMinutes: 6,
  cover: null,
  rev: 2,
  publishedAt: 1_768_435_200_000,
  updatedAt: 1_791_000_000_000,
};
const withdrawn = { status: "withdrawn", rev: 3, updatedAt: 1_791_000_100_000 };
const original = { status: "original", rev: 4, updatedAt: 1_791_000_200_000 };
/** As saveResourceDraft in app/lib/content/resources-client.ts writes it. */
const articleDraft = {
  data: { title: "A new article", slug: "a-new-article", summary: "", body: "", format: "article", topics: [], readingMinutes: 5, cover: { src: "", alt: "" } },
  baseRev: 0,
  updatedAt: 1_791_000_300_000,
  updatedBy: ADMIN,
};
const articleVersion = {
  resourceId: "seed-grief",
  live: true,
  data: null,
  title: "Grief does not follow a schedule",
  rev: 0,
  publishedAt: 1_768_435_200_000,
  replacedAt: 1_791_000_000_000,
  replacedBy: ADMIN,
  action: "publish",
  note: null,
};

/** [what, expectation, uid, method, path, existing, incoming] */
const FIRESTORE = [
  // --- what is published ---------------------------------------------------
  ["anybody signed out reads a published page", "ALLOW", null, "get", LIVE, published],
  ["anybody signed out lists the published pages", "ALLOW", null, "list", LIVE, published],
  ["a patient reads it", "ALLOW", PATIENT, "get", LIVE, published],
  ["staff cannot publish from the browser", "DENY", ADMIN, "create", LIVE, null, published],
  ["staff cannot change what is live from the browser", "DENY", ADMIN, "update", LIVE, published, { ...published, rev: 4 }],
  ["staff cannot take a page down from the browser", "DENY", ADMIN, "delete", LIVE, published],
  ["a patient cannot publish", "DENY", PATIENT, "create", LIVE, null, published],
  ["a provider cannot change what is live", "DENY", PROVIDER, "update", LIVE, published, { ...published, rev: 4 }],
  ["nobody signed out writes it", "DENY", null, "update", LIVE, published, { ...published, rev: 4 }],

  // --- drafts --------------------------------------------------------------
  ["staff read a draft", "ALLOW", ADMIN, "get", DRAFT, draft],
  ["staff list the drafts", "ALLOW", ADMIN, "list", DRAFT, draft],
  ["staff save a draft in their own name", "ALLOW", ADMIN, "create", DRAFT, null, draft],
  ["staff save over another's draft, as themselves", "ALLOW", ADMIN, "update", DRAFT, { ...draft, updatedBy: OTHER_ADMIN }, draft],
  ["staff throw a draft away", "ALLOW", ADMIN, "delete", DRAFT, draft],
  ["a draft in another staff member's name", "DENY", ADMIN, "create", DRAFT, null, { ...draft, updatedBy: OTHER_ADMIN }],
  ["a draft for a section that does not exist", "DENY", ADMIN, "create", `${DOCS}/siteContentDrafts/crisis`, null, draft],
  ["a draft with an extra field", "DENY", ADMIN, "create", DRAFT, null, { ...draft, publishedAt: 1 }],
  ["a draft missing a field", "DENY", ADMIN, "create", DRAFT, null, { data: draft.data, baseRev: 3, updatedAt: 1 }],
  ["a draft whose content is not a map", "DENY", ADMIN, "create", DRAFT, null, { ...draft, data: "<script>" }],
  ["a draft whose rev is not a number", "DENY", ADMIN, "create", DRAFT, null, { ...draft, baseRev: "3" }],
  ["a draft whose time is not a number", "DENY", ADMIN, "create", DRAFT, null, { ...draft, updatedAt: "now" }],
  ["a patient cannot read a draft", "DENY", PATIENT, "get", DRAFT, draft],
  ["a provider cannot list the drafts", "DENY", PROVIDER, "list", DRAFT, draft],
  ["nobody signed out reads a draft", "DENY", null, "get", DRAFT, draft],
  ["a patient cannot write a draft", "DENY", PATIENT, "create", DRAFT, null, { ...draft, updatedBy: PATIENT }],
  ["a provider cannot throw one away", "DENY", PROVIDER, "delete", DRAFT, draft],

  // --- the version history -------------------------------------------------
  ["staff read a version", "ALLOW", ADMIN, "get", VERSION, version],
  ["staff list the versions", "ALLOW", ADMIN, "list", VERSION, version],
  ["a patient cannot read the history", "DENY", PATIENT, "get", VERSION, version],
  ["nobody signed out lists it", "DENY", null, "list", VERSION, version],
  ["staff cannot write a version", "DENY", ADMIN, "create", VERSION, null, version],
  ["staff cannot rewrite history", "DENY", ADMIN, "update", VERSION, version, { ...version, replacedBy: OTHER_ADMIN }],
  ["staff cannot delete history", "DENY", ADMIN, "delete", VERSION, version],

  // --- the media library ---------------------------------------------------
  ["anybody signed out reads a picture's record", "ALLOW", null, "get", MEDIA, media],
  ["anybody signed out lists the library", "ALLOW", null, "list", MEDIA, media],
  ["staff cannot add to it from the browser", "DENY", ADMIN, "create", MEDIA, null, media],
  ["staff cannot change a description from the browser", "DENY", ADMIN, "update", MEDIA, media, { ...media, alt: "Changed" }],
  ["staff cannot delete a record from the browser", "DENY", ADMIN, "delete", MEDIA, media],
  ["a patient cannot add a picture", "DENY", PATIENT, "create", MEDIA, null, { ...media, uploadedBy: PATIENT }],
  ["nobody signed out changes one", "DENY", null, "update", MEDIA, media, { ...media, usage: [] }],

  // --- the resource centre's articles --------------------------------------
  ["anybody signed out reads a published article", "ALLOW", null, "get", ARTICLE, article],
  ["anybody signed out lists the published articles", "ALLOW", null, "list", ARTICLE, article],
  ["a patient reads one", "ALLOW", PATIENT, "get", ARTICLE, article],
  ["anybody signed out reads that a starter was withdrawn", "ALLOW", null, "list", ARTICLE, withdrawn],
  ["nobody signed out reads a starter put back to its own words", "DENY", null, "get", ARTICLE, original],
  ["nobody reads an article in any other state", "DENY", PATIENT, "get", NEW_ARTICLE, { ...article, status: "draft" }],
  ["staff read any article", "ALLOW", ADMIN, "get", ARTICLE, original],
  ["staff list every article", "ALLOW", ADMIN, "list", NEW_ARTICLE, { ...article, status: "draft" }],
  ["staff cannot publish an article from the browser", "DENY", ADMIN, "create", NEW_ARTICLE, null, article],
  ["staff cannot change a live article from the browser", "DENY", ADMIN, "update", ARTICLE, article, { ...article, title: "Changed" }],
  ["staff cannot take an article down from the browser", "DENY", ADMIN, "update", ARTICLE, article, withdrawn],
  ["staff cannot delete an article from the browser", "DENY", ADMIN, "delete", ARTICLE, article],
  ["a patient cannot publish one", "DENY", PATIENT, "create", NEW_ARTICLE, null, article],
  ["nobody signed out writes one", "DENY", null, "update", ARTICLE, article, { ...article, body: "<script>" }],

  // --- article drafts ------------------------------------------------------
  ["staff read an article draft", "ALLOW", ADMIN, "get", ARTICLE_DRAFT, articleDraft],
  ["staff list the article drafts", "ALLOW", ADMIN, "list", ARTICLE_DRAFT, articleDraft],
  ["staff save an article draft in their own name", "ALLOW", ADMIN, "create", ARTICLE_DRAFT, null, articleDraft],
  ["staff save a starter article's draft", "ALLOW", ADMIN, "create", `${DOCS}/resourceDrafts/seed-grief`, null, articleDraft],
  ["staff save over another's article draft, as themselves", "ALLOW", ADMIN, "update", ARTICLE_DRAFT, { ...articleDraft, updatedBy: OTHER_ADMIN }, articleDraft],
  ["staff throw an article draft away", "ALLOW", ADMIN, "delete", ARTICLE_DRAFT, articleDraft],
  ["an article draft in another's name", "DENY", ADMIN, "create", ARTICLE_DRAFT, null, { ...articleDraft, updatedBy: OTHER_ADMIN }],
  ["an article draft under an id that is not one", "DENY", ADMIN, "create", `${DOCS}/resourceDrafts/not%20an%20id`, null, articleDraft],
  ["an article draft with an extra field", "DENY", ADMIN, "create", ARTICLE_DRAFT, null, { ...articleDraft, status: "published" }],
  ["an article draft missing a field", "DENY", ADMIN, "create", ARTICLE_DRAFT, null, { data: articleDraft.data, baseRev: 0, updatedBy: ADMIN }],
  ["an article draft whose words are not a map", "DENY", ADMIN, "create", ARTICLE_DRAFT, null, { ...articleDraft, data: "words" }],
  ["an article draft whose rev is not a number", "DENY", ADMIN, "create", ARTICLE_DRAFT, null, { ...articleDraft, baseRev: "0" }],
  ["a patient cannot read an article draft", "DENY", PATIENT, "get", ARTICLE_DRAFT, articleDraft],
  ["nobody signed out lists the article drafts", "DENY", null, "list", ARTICLE_DRAFT, articleDraft],
  ["a provider cannot write an article draft", "DENY", PROVIDER, "create", ARTICLE_DRAFT, null, { ...articleDraft, updatedBy: PROVIDER }],

  // --- article history -----------------------------------------------------
  ["staff read an article's history", "ALLOW", ADMIN, "get", ARTICLE_VERSION, articleVersion],
  ["staff list it", "ALLOW", ADMIN, "list", ARTICLE_VERSION, articleVersion],
  ["a patient cannot read it", "DENY", PATIENT, "list", ARTICLE_VERSION, articleVersion],
  ["nobody signed out reads it", "DENY", null, "get", ARTICLE_VERSION, articleVersion],
  ["staff cannot write it", "DENY", ADMIN, "create", ARTICLE_VERSION, null, articleVersion],
  ["staff cannot rewrite it", "DENY", ADMIN, "update", ARTICLE_VERSION, articleVersion, { ...articleVersion, replacedBy: OTHER_ADMIN }],
  ["staff cannot delete it", "DENY", ADMIN, "delete", ARTICLE_VERSION, articleVersion],
];

const MB8 = 8 * 1024 * 1024;
const file = (name) => `/b/${BUCKET}/o/site-media/${name}`;
const object = (name, contentType, size) => ({ name: `site-media/${name}`, bucket: BUCKET, contentType, size });
const STAFF = { admin: true };

/** [what, expectation, uid, method, path, existing, incoming, claims] */
const STORAGE = [
  // --- uploading -----------------------------------------------------------
  ["staff upload a WebP", "ALLOW", ADMIN, "create", file("abcdef1.webp"), null, object("abcdef1.webp", "image/webp", 400_000), STAFF],
  ["a JPEG", "ALLOW", ADMIN, "create", file("abcdef2.jpg"), null, object("abcdef2.jpg", "image/jpeg", 400_000), STAFF],
  ["a JPEG named .jpeg", "ALLOW", ADMIN, "create", file("abcdef3.jpeg"), null, object("abcdef3.jpeg", "image/jpeg", 400_000), STAFF],
  ["a PNG", "ALLOW", ADMIN, "create", file("abcdef4.png"), null, object("abcdef4.png", "image/png", 400_000), STAFF],
  ["an AVIF", "ALLOW", ADMIN, "create", file("abcdef5.avif"), null, object("abcdef5.avif", "image/avif", 400_000), STAFF],
  ["exactly 8 MB", "ALLOW", ADMIN, "create", file("abcdef6.webp"), null, object("abcdef6.webp", "image/webp", MB8), STAFF],
  ["a byte over 8 MB", "DENY", ADMIN, "create", file("abcdef7.webp"), null, object("abcdef7.webp", "image/webp", MB8 + 1), STAFF],
  ["an empty file", "DENY", ADMIN, "create", file("abcdef8.webp"), null, object("abcdef8.webp", "image/webp", 0), STAFF],
  ["an SVG (which can carry script)", "DENY", ADMIN, "create", file("abcdef9.svg"), null, object("abcdef9.svg", "image/svg+xml", 1000), STAFF],
  ["an SVG wearing a .png name", "DENY", ADMIN, "create", file("abcde10.png"), null, object("abcde10.png", "image/svg+xml", 1000), STAFF],
  ["a GIF", "DENY", ADMIN, "create", file("abcde11.gif"), null, object("abcde11.gif", "image/gif", 1000), STAFF],
  ["an HTML page", "DENY", ADMIN, "create", file("abcde12.html"), null, object("abcde12.html", "text/html", 1000), STAFF],
  ["an HTML page wearing a .webp name", "DENY", ADMIN, "create", file("abcde13.webp"), null, object("abcde13.webp", "text/html", 1000), STAFF],
  ["a type that only starts like an image", "DENY", ADMIN, "create", file("abcde14.webp"), null, object("abcde14.webp", "image/webp+xml", 1000), STAFF],
  ["a name too short to be one of ours", "DENY", ADMIN, "create", file("ab.webp"), null, object("ab.webp", "image/webp", 1000), STAFF],
  ["a name with no extension", "DENY", ADMIN, "create", file("abcdef15"), null, object("abcdef15", "image/webp", 1000), STAFF],
  ["a name with odd characters", "DENY", ADMIN, "create", file("abc%20def.webp"), null, object("abc%20def.webp", "image/webp", 1000), STAFF],
  ["staff without the claim yet cannot", "DENY", ADMIN, "create", file("abcde16.webp"), null, object("abcde16.webp", "image/webp", 1000)],
  ["a claim that is not true is no claim", "DENY", ADMIN, "create", file("abcde17.webp"), null, object("abcde17.webp", "image/webp", 1000), { admin: "true" }],
  ["a patient cannot upload", "DENY", PATIENT, "create", file("abcde18.webp"), null, object("abcde18.webp", "image/webp", 1000)],
  ["a provider cannot upload", "DENY", PROVIDER, "create", file("abcde19.webp"), null, object("abcde19.webp", "image/webp", 1000)],
  ["nobody signed out can", "DENY", null, "create", file("abcde20.webp"), null, object("abcde20.webp", "image/webp", 1000)],
  ["a live picture cannot be swapped, even by staff", "DENY", ADMIN, "update", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000), object("abcdef1.webp", "image/webp", 500_000), STAFF],

  // --- reading -------------------------------------------------------------
  ["anybody signed out opens a picture", "ALLOW", null, "get", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000)],
  ["a patient opens one", "ALLOW", PATIENT, "get", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000)],
  ["staff list the folder", "ALLOW", ADMIN, "list", file("abcdef1.webp"), null, null, STAFF],
  ["nobody signed out lists the folder", "DENY", null, "list", file("abcdef1.webp")],
  ["a patient cannot list it", "DENY", PATIENT, "list", file("abcdef1.webp")],

  // --- deleting ------------------------------------------------------------
  ["staff delete a picture", "ALLOW", ADMIN, "delete", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000), null, STAFF],
  ["staff without the claim cannot", "DENY", ADMIN, "delete", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000)],
  ["a patient cannot delete one", "DENY", PATIENT, "delete", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000)],
  ["nobody signed out can", "DENY", null, "delete", file("abcdef1.webp"), object("abcdef1.webp", "image/webp", 400_000)],
];

/** isAdmin() reads the caller's user document. Mocked by path. */
const userDocMocks = [
  [PATIENT, "patient", true],
  [PROVIDER, "provider", true],
  [ADMIN, "admin", true],
  [OTHER_ADMIN, "admin", true],
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
    ["Firestore — published content, drafts, versions, media library, articles", "firestore.rules", FIRESTORE, firestoreCase],
    ["Storage — site-media", "storage.rules", STORAGE, storageCase],
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
