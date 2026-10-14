/**
 * Security-rule tests for staff operations: the audit log and the support
 * inbox.
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<owner>) \
 *     node scripts/test-rules-ops.mjs
 *
 * Same evaluator as scripts/test-security-rules.mjs (firebaserules
 * .googleapis.com :test) — the engine that serves production, given the
 * rules source from disk and synthetic requests. It reads no data.
 *
 * What these hold:
 *  - the audit log is read by staff and written by nobody from a browser;
 *  - anybody can still send the contact form, signed in or not, exactly as
 *    SupportForm writes it — and only that: not resolved, not assigned, not
 *    with staff notes, not backdated, not in somebody else's name;
 *  - nobody but staff reads a request back, and staff change one only
 *    through adminUpdateSupport, which keeps the audit log.
 */

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/talk-admin-sa.json";

const DOCS = `/databases/(default)/documents`;
const PATIENT = "patient-uid";
const PROVIDER = "provider-uid";
const STRANGER = "stranger-uid";
const ADMIN = "admin-uid";

/** The evaluator's clock for every request below. */
const NOW = "2026-10-14T12:05:00Z";
const BACKDATED = "2026-10-07T12:05:00Z";

/** A request as SupportForm sends it from somebody not signed in. */
const form = {
  name: "Awa Jallow",
  email: "awa@example.com",
  topic: "organisation",
  message: "We would like to fund sessions for our staff.",
  userId: null,
  status: "new",
  createdAt: NOW,
};

/** A request in the inbox, after staff have picked it up. */
const filed = {
  ...form,
  status: "in_progress",
  assigneeId: ADMIN,
  assigneeName: "Staff",
  notes: [{ id: "n1", by: ADMIN, byName: "Staff", body: "Called back.", at: 1_790_000_000_000 }],
  updatedAt: 1_790_000_000_000,
};

/** An audit entry as the functions write it. */
const entry = {
  actorId: ADMIN,
  action: "user.set_role",
  targetPath: `users/${PATIENT}`,
  metadata: { from: "patient", to: "provider" },
  createdAt: 1_790_000_000_000,
};

const SUPPORT = `${DOCS}/supportRequests/r1`;
const AUDIT = `${DOCS}/auditLogs/a1`;

const CASES = [
  // --- the audit log -------------------------------------------------------
  ["staff read an audit entry", "ALLOW", ADMIN, "get", AUDIT, entry],
  ["staff list the audit log", "ALLOW", ADMIN, "list", AUDIT, entry],
  ["a patient cannot read an entry about themselves", "DENY", PATIENT, "get", AUDIT, entry],
  ["a provider cannot list the audit log", "DENY", PROVIDER, "list", AUDIT, entry],
  ["nobody signed in reads it", "DENY", null, "get", AUDIT, entry],
  // The log is evidence: only the functions add to it, with admin rights.
  ["staff cannot write an entry from the browser", "DENY", ADMIN, "create", AUDIT, null, entry],
  ["a patient cannot write an entry", "DENY", PATIENT, "create", AUDIT, null, { ...entry, actorId: PATIENT }],
  ["staff cannot rewrite an entry", "DENY", ADMIN, "update", AUDIT, entry, { ...entry, action: "nothing" }],
  ["staff cannot delete an entry", "DENY", ADMIN, "delete", AUDIT, entry],

  // --- sending the contact form -------------------------------------------
  ["somebody not signed in sends the form", "ALLOW", null, "create", SUPPORT, null, form],
  ["a signed-in patient sends it under their own account", "ALLOW", PATIENT, "create", SUPPORT, null, { ...form, userId: PATIENT }],
  ["a signed-in person may leave their account off it", "ALLOW", PATIENT, "create", SUPPORT, null, form],
  // SupportForm shows the profile name without putting it in state until it
  // is edited, so an untouched name field arrives empty. Still a request.
  ["a request with the name left empty", "ALLOW", null, "create", SUPPORT, null, { ...form, name: "" }],
  ["every topic on the form is accepted", "ALLOW", null, "create", SUPPORT, null, { ...form, topic: "safety" }],

  ["filing it under somebody else's account", "DENY", PATIENT, "create", SUPPORT, null, { ...form, userId: STRANGER }],
  ["filing it under an account while signed out", "DENY", null, "create", SUPPORT, null, { ...form, userId: PATIENT }],
  ["sending one already resolved", "DENY", null, "create", SUPPORT, null, { ...form, status: "resolved" }],
  ["sending one already assigned to staff", "DENY", null, "create", SUPPORT, null, { ...form, assigneeId: ADMIN }],
  ["sending one with staff notes on it", "DENY", null, "create", SUPPORT, null, { ...form, notes: [] }],
  ["sending one dated last week", "DENY", null, "create", SUPPORT, null, { ...form, createdAt: BACKDATED }],
  ["sending one with no time on it", "DENY", null, "create", SUPPORT, null, (({ createdAt, ...rest }) => (void createdAt, rest))(form)],
  ["sending one with no topic", "DENY", null, "create", SUPPORT, null, (({ topic, ...rest }) => (void topic, rest))(form)],
  ["sending one on a topic the form does not offer", "DENY", null, "create", SUPPORT, null, { ...form, topic: "billing" }],
  ["sending an empty message", "DENY", null, "create", SUPPORT, null, { ...form, message: "" }],
  ["sending a message far longer than the form allows", "DENY", null, "create", SUPPORT, null, { ...form, message: "x".repeat(5000) }],
  ["sending a name that is not a name", "DENY", null, "create", SUPPORT, null, { ...form, name: "x".repeat(201) }],

  // --- reading and working the inbox --------------------------------------
  ["staff read a request", "ALLOW", ADMIN, "get", SUPPORT, filed],
  ["staff list the inbox", "ALLOW", ADMIN, "list", SUPPORT, filed],
  ["the sender cannot read their own request back", "DENY", PATIENT, "get", SUPPORT, { ...filed, userId: PATIENT }],
  ["a patient cannot list the inbox", "DENY", STRANGER, "list", SUPPORT, filed],
  ["a provider cannot list the inbox", "DENY", PROVIDER, "list", SUPPORT, filed],
  ["nobody signed in lists the inbox", "DENY", null, "list", SUPPORT, filed],
  ["staff cannot change a request from the browser", "DENY", ADMIN, "update", SUPPORT, filed, { ...filed, status: "resolved" }],
  ["staff cannot delete a request from the browser", "DENY", ADMIN, "delete", SUPPORT, filed],
  ["the sender cannot change their request", "DENY", PATIENT, "update", SUPPORT, { ...filed, userId: PATIENT },
    { ...filed, userId: PATIENT, message: "Something else." }],
];

/** What users/{uid} says for each test account — the role isAdmin() reads. */
const userDocMocks = [
  [PROVIDER, "provider", true],
  [PATIENT, "patient", true],
  [STRANGER, "patient", true],
  [ADMIN, "admin", true],
].map(([uid, role, verified]) => ({
  function: "get",
  args: [{ exactValue: `${DOCS}/users/${uid}` }],
  result: { value: { data: { uid, role, verified } } },
}));

const testCase = ([, expectation, uid, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth: uid ? { uid, token: { sub: uid, firebase: { sign_in_provider: "password" } } } : null,
    path,
    method,
    time: NOW,
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
  functionMocks: userDocMocks,
});

/**
 * The evaluator over a flaky connection: a dropped request or a 5xx is tried
 * again a few times before it counts as unreachable. A 4xx is an answer.
 */
async function evaluate(token, body, { userCredential }) {
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          // A user credential carries no project of its own; this API bills
          // against one. A service account bills to its own project, and
          // naming this one would need a permission it does not have.
          ...(userCredential ? { "x-goog-user-project": PROJECT } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status < 500) return res;
      last = new Error(`rules test API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } catch (error) {
      last = error;
    }
    console.error(`  (evaluator attempt ${attempt} failed: ${last?.message ?? last}; trying again)`);
    await sleep(3000 * attempt);
  }
  throw last;
}

/** Inside a function so it can return: process.exit() trips a libuv assertion on Windows. */
async function main() {
  const source = await readFile("firestore.rules", "utf8");
  const userCredential = Boolean(process.env.RULES_TEST_ACCESS_TOKEN);
  const token =
    process.env.RULES_TEST_ACCESS_TOKEN ||
    (await (
      await new GoogleAuth({ keyFile: KEY, scopes: "https://www.googleapis.com/auth/cloud-platform" }).getClient()
    ).getAccessToken()).token;

  let res;
  try {
    res = await evaluate(token, {
      source: { files: [{ name: "firestore.rules", content: source }] },
      testSuite: { testCases: CASES.map(testCase) },
    }, { userCredential });
  } catch (error) {
    console.error(`The rules evaluator could not be reached: ${error?.message ?? error}`);
    process.exitCode = 2;
    return;
  }

  if (!res.ok) {
    console.error(`rules test API ${res.status}: ${await res.text()}`);
    console.error("If this is a permission error, run with RULES_TEST_ACCESS_TOKEN from an owner's gcloud login.");
    process.exitCode = 1;
    return;
  }

  const { testResults = [], issues = [] } = await res.json();
  for (const issue of issues) {
    console.log(`${issue.severity}: ${issue.description} (line ${issue.sourcePosition?.line})`);
  }

  let failures = 0;
  CASES.forEach(([what, expectation], index) => {
    const result = testResults[index];
    const ok = result?.state === "SUCCESS";
    if (!ok) failures += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${expectation.padEnd(5)} ${what}`);
    if (!ok && result?.debugMessages?.length) {
      for (const line of result.debugMessages) console.log(`        ${line}`);
    }
  });

  console.log(failures ? `\n${failures} of ${CASES.length} FAILED` : `\nAll ${CASES.length} ops rule checks passed`);
  process.exitCode = failures ? 1 : 0;
}

await main();
