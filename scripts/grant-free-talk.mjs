/**
 * Let one account talk to TALK as often as it likes, without paying — or
 * take that away again.
 *
 *   node scripts/grant-free-talk.mjs <email> --dry-run    what would change; changes nothing
 *   node scripts/grant-free-talk.mjs <email>              free access on
 *   node scripts/grant-free-talk.mjs <email> --revoke     free access off
 *
 * For the owner's own account, so they can use TALK the way the people they
 * built it for will, as much as they need to, without paying D200 or D500
 * each time. Nothing in the app can set it: it is the `talkFree` custom
 * claim, which only the service account can write, and which TALK's
 * conversation functions and the TALK page both read from the sign-in token.
 *
 * Every other claim is kept — setCustomUserClaims replaces the whole set, and
 * it carries the staff claim (admin) and any paid conversation (aiTier,
 * aiExpiresAt, aiEndsAt). One auditLogs entry is written, with "script" as
 * the actor, so a free account never exists without a record of who made it.
 *
 * The person sees it once their sign-in refreshes; the TALK page asks for a
 * fresh token itself, so opening /talk again is enough.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

const FLAGS = ["--revoke", "--dry-run"];
const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const dryRun = args.includes("--dry-run");
const unknownFlags = args.filter((a) => a.startsWith("--") && !FLAGS.includes(a));
const emails = args.filter((a) => !a.startsWith("--"));

const USAGE = "Usage: node scripts/grant-free-talk.mjs <email> [--revoke] [--dry-run]";

/** Inside a function so it can return: process.exit() trips a libuv assertion on Windows. */
async function main() {
  if (emails.length !== 1 || !emails[0].includes("@") || unknownFlags.length) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const email = emails[0].trim();

  const app = initializeApp({ credential: cert(KEY), projectId: PROJECT }, "grant-free-talk");
  const db = getFirestore(app);
  const auth = getAuth(app);

  let record;
  try {
    record = await auth.getUserByEmail(email.toLowerCase());
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      console.error(`No TALK sign-in uses ${email}. They need to sign in to the app once first.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const claims = { ...(record.customClaims ?? {}) };
  const had = claims.talkFree === true;
  const want = !revoke;

  console.log(`uid    ${record.uid}`);
  console.log(`email  ${email}`);
  console.log(`free   ${had === want ? `${had ? "on" : "off"} (unchanged)` : want ? "off -> on" : "on -> off"}`);

  if (had === want) {
    console.log("\nNothing to change.");
    return;
  }
  if (dryRun) {
    console.log("\nDry run: nothing was changed.");
    return;
  }

  if (want) claims.talkFree = true;
  else delete claims.talkFree;
  await auth.setCustomUserClaims(record.uid, claims);

  await db.collection("auditLogs").add({
    actorId: "script",
    action: want ? "talk.free_access_granted" : "talk.free_access_revoked",
    targetPath: `users/${record.uid}`,
    metadata: { via: "scripts/grant-free-talk.mjs" },
    createdAt: Date.now(),
  });

  console.log(`\nDone. ${want ? "They can talk to TALK without paying" : "They pay like everyone else again"} — opening /talk again picks it up.`);
}

await main();
