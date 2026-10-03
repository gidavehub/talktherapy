/**
 * Security-rule tests for the chat block in firestore.rules.
 *
 *   node scripts/test-chat-rules.mjs
 *
 * Runs against Firebase's own rules evaluator (firebaserules.googleapis.com
 * :test), which takes the rules source and a synthetic request and tells you
 * what the deployed engine would decide. No emulator, no accounts, no real
 * data — and it is the same evaluator that serves production, so a pass here
 * is not an approximation of the rule, it is the rule.
 *
 * These are the invariants a therapy conversation depends on. If one of them
 * ever goes red, somebody can read a conversation they are not in.
 */

import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/talk-admin-sa.json";

const DOCS = `/databases/(default)/documents`;
const PATIENT = "patient-uid";
const PROVIDER = "provider-uid";
const STRANGER = "stranger-uid";
const CHAT = `${PATIENT}__${PROVIDER}`;

/** A chat document as `openChat` writes it. */
const chat = {
  participants: [PATIENT, PROVIDER],
  names: { [PATIENT]: "Fatou", [PROVIDER]: "Awa Ceesay" },
  lastMessage: "",
  lastMessageAt: "2026-10-03T12:00:00Z",
  unread: { [PATIENT]: 0, [PROVIDER]: 0 },
  typing: {},
  createdAt: "2026-10-03T12:00:00Z",
};

/** A message as `commitMessage` writes it. */
const message = {
  senderId: PATIENT,
  participants: [PATIENT, PROVIDER],
  kind: "text",
  text: "Good morning",
  mediaPath: null,
  durationSec: null,
  transcript: null,
  createdAt: "2026-10-03T12:01:00Z",
  readBy: [PATIENT],
};

const CASES = [
  // --- reading a conversation -------------------------------------------
  ["a participant reads their chat", "ALLOW", PATIENT, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["the provider reads the same chat", "ALLOW", PROVIDER, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["a stranger cannot read it", "DENY", STRANGER, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["nobody signed in cannot read it", "DENY", null, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["a participant reads a message", "ALLOW", PROVIDER, "get", `${DOCS}/chats/${CHAT}/messages/m1`, message],
  ["a stranger cannot read a message", "DENY", STRANGER, "get", `${DOCS}/chats/${CHAT}/messages/m1`, message],

  // --- opening one -------------------------------------------------------
  ["opening a chat you are in", "ALLOW", PATIENT, "create", `${DOCS}/chats/${CHAT}`, null, chat],
  ["opening a chat between two other people", "DENY", STRANGER, "create", `${DOCS}/chats/${CHAT}`, null, chat],
  ["a one-person chat", "DENY", PATIENT, "create", `${DOCS}/chats/solo`, null, { ...chat, participants: [PATIENT] }],
  // Squatting: claiming the id that two other people's chat will need, so
  // that they can never open it. The id has to match the pair.
  ["squatting on the id of a chat between two other people", "DENY", STRANGER, "create",
    `${DOCS}/chats/${CHAT}`, null, { ...chat, participants: [STRANGER, PROVIDER] }],
  ["a chat at an id that is not its participants", "DENY", PATIENT, "create",
    `${DOCS}/chats/something-else`, null, chat],

  // --- sending -----------------------------------------------------------
  ["sending a message as yourself", "ALLOW", PATIENT, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null, message],
  ["sending a message as somebody else", "DENY", PROVIDER, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null, message],
  ["a stranger cannot send into the chat", "DENY", STRANGER, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null,
    { ...message, senderId: STRANGER, participants: [STRANGER, PROVIDER] }],

  // --- the invariant that matters most -----------------------------------
  ["adding somebody to a live chat", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, participants: [PATIENT, PROVIDER, STRANGER] }],
  ["removing somebody from a chat", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, participants: [PATIENT] }],
  ["updating the preview and unread counts", "ALLOW", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, lastMessage: "Good morning", unread: { [PATIENT]: 0, [PROVIDER]: 1 } }],
  ["a stranger cannot touch the chat", "DENY", STRANGER, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, lastMessage: "hello" }],

  // --- read receipts -----------------------------------------------------
  ["marking a message read as yourself", "ALLOW", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PATIENT, PROVIDER] }],
  ["marking it read on somebody else's behalf", "DENY", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PATIENT, STRANGER] }],
  ["editing the words of a sent message", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, text: "something else" }],
  ["dropping a receipt that was already there", "DENY", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PROVIDER] }],

  // --- deletion ----------------------------------------------------------
  ["deleting the conversation", "DENY", PATIENT, "delete", `${DOCS}/chats/${CHAT}`, chat],
  ["deleting a message", "DENY", PATIENT, "delete", `${DOCS}/chats/${CHAT}/messages/m1`, message],

  // --- the one that was already broken once ------------------------------
  ["a stranger reading somebody's user document", "DENY", STRANGER, "get", `${DOCS}/users/${PATIENT}`,
    { uid: PATIENT, role: "patient", displayName: "Fatou" }],
];

/**
 * Sending a message makes the rules get() the parent chat, so the evaluator
 * needs to be told what that read returns. Every message-create case is
 * mocked with the real chat above — which is the whole point: a sender who
 * made up their own participant list is then measured against the true one.
 */
const parentChatMock = {
  function: "get",
  args: [{ exactValue: `${DOCS}/chats/${CHAT}` }],
  result: { value: { data: chat } },
};

const testCase = ([, expectation, uid, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth: uid ? { uid, token: { sub: uid, firebase: { sign_in_provider: "password" } } } : null,
    path,
    method,
    time: "2026-10-03T12:05:00Z",
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
  ...(method === "create" && path.includes("/messages/")
    ? { functionMocks: [parentChatMock] }
    : {}),
});

/**
 * Everything below is inside a function purely so it can return.
 *
 * `process.exit()` here trips a libuv assertion on Windows — it tears the
 * loop down while the auth client's sockets are still closing, and the real
 * exit code is lost behind the crash. Returning lets Node drain and exit on
 * its own.
 */
async function main() {
const source = await readFile("firestore.rules", "utf8");

/**
 * The deploy service account can release rules but not evaluate them, so this
 * also takes a token from the environment:
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<owner>) \
 *     node scripts/test-chat-rules.mjs
 *
 * An owner's own gcloud credential already has the permission, which beats
 * widening the service account's. The call only ever evaluates rules source
 * against synthetic requests — it reads no data.
 */
const token =
  process.env.RULES_TEST_ACCESS_TOKEN ||
  (await (
    await new GoogleAuth({
      keyFile: KEY,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    }).getClient()
  ).getAccessToken()).token;

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // A user credential (the gcloud path above) carries no project of its own,
    // and this API bills against one. Harmless with a service-account token,
    // which already belongs to the project.
    "x-goog-user-project": PROJECT,
  },
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: source }] },
    testSuite: { testCases: CASES.map(testCase) },
  }),
});

if (!res.ok) {
  const body = await res.text();
  if (res.status === 403 && body.includes("firebaserules.rulesets.test")) {
    // The deploy service account can release rules but not evaluate them —
    // separate permissions, and only the second one is missing. One grant,
    // and this suite runs:
    //
    //   gcloud projects add-iam-policy-binding talk-therapy-509209
    //     --member=serviceAccount:talk-admin@talk-therapy-509209.iam.gserviceaccount.com
    //     --role=roles/firebaserules.admin
    //
    // It only ever evaluates rules source against synthetic requests; it
    // grants no access to any data.
    console.error(
      [
        "The service account cannot call the rules evaluator: it is missing",
        "firebaserules.rulesets.test. See the note above this message in",
        "scripts/test-chat-rules.mjs for the one command that fixes it.",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }
  console.error(`rules test API ${res.status}: ${body}`);
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

console.log(failures ? `\n${failures} of ${CASES.length} FAILED` : `\nAll ${CASES.length} rule checks passed`);
process.exitCode = failures ? 1 : 0;
}

await main();
