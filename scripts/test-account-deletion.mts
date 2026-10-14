/**
 * Unit test for what deleting an account clears on the server
 * (app/lib/accountDeletion.ts, run by cleanUpDeletedAccount in
 * functions/src/accountDeletion.ts).
 *
 *   cd functions && npm run build && cd .. && node scripts/test-account-deletion.mts
 *
 * Runs the COMPILED copies in functions/lib — the ones the Cloud Function
 * actually executes (Node's own TypeScript runner cannot follow the shared
 * modules' extensionless imports).
 *
 * Three things matter here. The list covers everything the account left
 * behind. Every path in it stays inside that one person's uid — a folder
 * prefix one character short would empty somebody else's. And nothing new
 * slips past it: every collection firestore.rules keys by uid, every
 * per-person folder in storage.rules and every subcollection under users/
 * must be either cleared or named below as kept, with the reason. Adding one
 * without deciding fails this test.
 *
 * Offline: no Firebase, no network.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const D = require("../functions/lib/app/lib/accountDeletion.js") as typeof import("../app/lib/accountDeletion.ts");
const P = require("../functions/lib/app/lib/providerApplication.js") as typeof import("../app/lib/providerApplication.ts");

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

/**
 * Kept on purpose when an account is deleted, and why. The same decisions
 * are written out at the top of app/lib/accountDeletion.ts.
 */
const KEPT_COLLECTIONS: Record<string, string> = {
  users: "the document whose deletion starts the clean-up; the browser deletes it",
  entitlements: "a paid TALK conversation: a money record, kept like payments",
  availability:
    "a provider's calendar: a booked time belongs to the patient's booking too, and an open one cannot be booked once the listing has gone",
};
const KEPT_USER_SUBCOLLECTIONS: Record<string, string> = {
  consentEvents: "evidence of what was agreed and when, append-only by design",
};
const KEPT_FOLDERS: Record<string, string> = {
  resources: "art and audio staff publish for the resource centre, which the pages people read point at",
};

const UID = "aB3dE5fG7hJ9kL1mN3pQ5rS7tV9w";
const plan = D.deletionPlan(UID);

// --- what goes ---------------------------------------------------------------
check("a plain uid gets a plan", plan !== null);
const trees = new Set(plan?.trees ?? []);
const prefixes = plan?.storagePrefixes ?? [];
const underPrefix = (path: string) => prefixes.some((p) => path.startsWith(p));

for (const path of [
  `presence/${UID}`,
  `providerApplications/${UID}`,
  `providerReviews/${UID}`,
  `providerProfiles/${UID}`,
  `payoutAccounts/${UID}`,
  `analyticsQuota/${UID}`,
  `users/${UID}/moodEntries`,
  `users/${UID}/journalEntries`,
]) {
  check(`clears ${path.replace(UID, "{uid}")} and everything under it`, trees.has(path));
}
check(
  "clears their notifications, by recipient",
  (plan?.matching ?? []).some((m) => m.collection === "notifications" && m.field === "to"),
);
check(
  "clears the summaries from TALK they shared, and any shared with them",
  ["patientId", "providerId"].every((field) =>
    (plan?.matching ?? []).some((m) => m.collection === "handoffs" && m.field === field),
  ),
);
check("empties provider-credentials/{uid}/", prefixes.includes(`provider-credentials/${UID}/`));
check("empties avatars/{uid}/", prefixes.includes(`avatars/${UID}/`));

// The files an application actually points at, as the browser names them.
const credential = `provider-credentials/${UID}/doc-1a2b3c.pdf`;
const photo = `provider-credentials/${UID}/photo-9z8y.jpg`;
check("a credential document of theirs is one the client could upload", P.isOwnCredentialPath(credential, UID));
check("their credential documents go", underPrefix(credential));
check("the photo sent with their application goes", underPrefix(photo));
check("their public photo, avatars/{uid}/provider.jpg, goes", underPrefix(`avatars/${UID}/provider.jpg`));

// --- only theirs -------------------------------------------------------------
check(
  "every Firestore path is inside their uid",
  [...trees].every((p) => p.split("/")[1] === UID),
  [...trees].filter((p) => p.split("/")[1] !== UID).join(", "),
);
check(
  "every folder ends in a slash and is named by their uid",
  prefixes.every((p) => p.endsWith("/") && p.split("/")[1] === UID && p.split("/").length === 3),
  prefixes.join(", "),
);
const neighbour = `${UID}x`;
check(
  "a uid that starts the same is untouched",
  !underPrefix(`avatars/${neighbour}/provider.jpg`) && !underPrefix(`provider-credentials/${neighbour}/doc.pdf`),
);
check("someone else's documents are untouched", !underPrefix(`provider-credentials/otherUid123/doc.pdf`));

for (const bad of ["", "a/b", "../x", ".", "..", "a b", "a.b", `${"x".repeat(129)}`]) {
  check(`no plan for ${JSON.stringify(bad.length > 20 ? `${bad.slice(0, 8)}…` : bad)}`, D.deletionPlan(bad) === null);
}
check("smoke-script ids with hyphens are plain", D.isPlainUid("smoke-payouts-provider"));

// --- nothing slips past ------------------------------------------------------
const firestoreRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8").split("\n");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8").split("\n");

// Top-level collections keyed by a person: `match /name/{uid}` or {providerId}.
const keyedByPerson = firestoreRules
  .map((line) => /^ {4}match \/(\w+)\/\{(uid|providerId)\}/.exec(line)?.[1])
  .filter((name): name is string => Boolean(name));
check("firestore.rules was read", keyedByPerson.includes("users") && keyedByPerson.includes("presence"));
for (const name of keyedByPerson) {
  const cleared = trees.has(`${name}/${UID}`);
  check(
    `${name}/{uid} is cleared or kept on purpose`,
    cleared || name in KEPT_COLLECTIONS,
    "add it to deletionPlan, or to KEPT_COLLECTIONS here with the reason",
  );
  check(`${name}/{uid} is not both cleared and kept`, !(cleared && name in KEPT_COLLECTIONS));
}

// Subcollections under users/{uid}: the parent goes, so each must be decided.
const usersStart = firestoreRules.findIndex((line) => /^ {4}match \/users\/\{uid\}/.test(line));
const usersEnd = firestoreRules.findIndex((line, i) => i > usersStart && /^ {4}\}/.test(line));
const userSubs = firestoreRules
  .slice(usersStart, usersEnd)
  .map((line) => /^ {6}match \/(\w+)\//.exec(line)?.[1])
  .filter((name): name is string => Boolean(name));
check("the users block was found", usersStart >= 0 && usersEnd > usersStart && userSubs.length > 0);
for (const name of userSubs) {
  check(
    `users/{uid}/${name} is cleared or kept on purpose`,
    trees.has(`users/${UID}/${name}`) || name in KEPT_USER_SUBCOLLECTIONS,
    "add it to deletionPlan, or to KEPT_USER_SUBCOLLECTIONS here with the reason",
  );
}

// Per-person folders: `match /folder/{uid}/{fileName}`.
const folders = storageRules
  .map((line) => /^ {4}match \/([\w-]+)\/\{uid\}\//.exec(line)?.[1])
  .filter((name): name is string => Boolean(name));
check("storage.rules was read", folders.includes("avatars") && folders.includes("provider-credentials"));
for (const folder of folders) {
  check(
    `${folder}/{uid}/ is emptied or kept on purpose`,
    prefixes.includes(`${folder}/${UID}/`) || folder in KEPT_FOLDERS,
    "add it to deletionPlan, or to KEPT_FOLDERS here with the reason",
  );
}

// --- the trigger -------------------------------------------------------------
// What `firebase deploy` reads. No eventTrigger region of its own: the CLI
// sets it to the database's location (nam5) and refuses any other; the
// function itself runs in us-east4 with everything else.
const { cleanUpDeletedAccount } = require("../functions/lib/functions/src/accountDeletion.js") as {
  cleanUpDeletedAccount: {
    __endpoint: {
      region: string[];
      serviceAccountEmail?: unknown;
      eventTrigger: {
        eventType: string;
        eventFilterPathPatterns: Record<string, string>;
        retry: boolean;
        region?: string;
      };
    };
  };
};
const endpoint = cleanUpDeletedAccount.__endpoint;
check("runs when a users/{uid} document is deleted", endpoint.eventTrigger.eventType === "google.cloud.firestore.document.v1.deleted" && endpoint.eventTrigger.eventFilterPathPatterns.document === "users/{uid}");
check("runs in us-east4", endpoint.region.length === 1 && endpoint.region[0] === "us-east4");
check("leaves the trigger's location to the database's", endpoint.eventTrigger.region === undefined);
check("a failed clean-up is delivered again", endpoint.eventTrigger.retry === true);
// As the CLI reads it, in JSON: an option left unset is written as null.
check(
  "runs as the default service account, never talk-ai",
  JSON.stringify(endpoint.serviceAccountEmail ?? null) === "null",
  JSON.stringify(endpoint.serviceAccountEmail),
);
const index = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");
check("is exported for deploy", /export \* from "\.\/accountDeletion";/.test(index));

// --- the audit line, as staff see it -----------------------------------------
const O = require("../functions/lib/app/lib/adminOps.js") as typeof import("../app/lib/adminOps.ts");
const row = O.auditRow(
  "account-deleted-1",
  { actorId: O.SYSTEM_ACTOR, action: "account.deleted", targetPath: `users/${UID}`, metadata: { role: "provider", notifications: 3, files: 2 } },
  null,
);
check("is shown as done by TALK, not by a member of staff", row.actorName === "TALK");
check("is named in plain words", row.actionLabel === "Cleared up after a deleted account");
check("keeps its counts and the role", row.metadata.role === "provider" && row.metadata.files === 2 && row.metadata.notifications === 3);

console.log(failures === 0 ? "\nAll account deletion checks passed." : `\n${failures} account deletion check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
