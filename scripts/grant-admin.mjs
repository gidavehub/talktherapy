/**
 * Make somebody staff, or stop them being staff.
 *
 *   node scripts/grant-admin.mjs <email> --dry-run    what would change; changes nothing
 *   node scripts/grant-admin.mjs <email>              make them staff
 *   node scripts/grant-admin.mjs <email> --revoke     give back the role they had before
 *
 * The first member of staff has to come from somewhere. Nothing in the app
 * can make one — firestore.rules refuses it, and adminSetRole needs staff to
 * call it — so this is that somewhere, run by the owner with the service
 * account. After that, staff make staff on the people pages.
 *
 * It changes what adminSetRole changes, in the same shapes:
 *  - users/{uid}.role, with the role before kept in previousRole, which
 *    --revoke puts back;
 *  - the `admin` custom claim, set or cleared with every other claim kept —
 *    the paid TALK conversation rides there too (aiTier, aiExpiresAt,
 *    aiEndsAt), and dropping it would end somebody's conversation;
 *  - one auditLogs entry, with "script" as the actor.
 *
 * The claim is brought into line every run, even when the role is already
 * right, so running it again repairs a claim a failed run left behind.
 *
 * Prints the uid, the email given and what changed — nothing else about the
 * person. Run it with --dry-run first.
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

const USAGE = "Usage: node scripts/grant-admin.mjs <email> [--revoke] [--dry-run]";

/** Older names for the provider role are still in some documents. */
function normaliseRole(role) {
  if (role === "therapist" || role === "counsellor") return "provider";
  return ["patient", "provider", "admin", "org_admin"].includes(role) ? role : "patient";
}

/** Inside a function so it can return: process.exit() trips a libuv assertion on Windows. */
async function main() {
  if (emails.length !== 1 || !emails[0].includes("@") || unknownFlags.length) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const email = emails[0].trim();

  const app = initializeApp({ credential: cert(KEY), projectId: PROJECT }, "grant-admin");
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
  const uid = record.uid;
  const userRef = db.collection("users").doc(uid);
  const listingRef = db.collection("providerProfiles").doc(uid);

  // The role and nothing else: this script has no business reading the rest
  // of somebody's profile.
  const [profile] = await db.getAll(userRef, { fieldMask: ["role", "previousRole"] });
  if (!profile.exists) {
    console.error(`${uid} (${email}) has a sign-in but no TALK profile yet. They need to open the app once first.`);
    process.exitCode = 1;
    return;
  }
  const from = normaliseRole(profile.get("role"));
  const stored = profile.get("previousRole");

  let to = from;
  if (!revoke && from !== "admin") {
    if (from === "provider") {
      console.error(
        `${uid} (${email}) is a provider account. Staff work needs an account of its own — or change the role on the ` +
          "people pages, which takes the provider's listing out of the directory with it.",
      );
      process.exitCode = 1;
      return;
    }
    to = "admin";
  }
  if (revoke && from === "admin") {
    const before = typeof stored === "string" ? normaliseRole(stored) : "patient";
    to = before === "admin" ? "patient" : before;
  }

  const roleChanges = to !== from;
  const wantClaim = to === "admin";
  const hasClaim = record.customClaims?.admin === true;
  const claimChanges = wantClaim !== hasClaim;

  console.log(`uid    ${uid}`);
  console.log(`email  ${email}`);
  console.log(`role   ${roleChanges ? `${from} -> ${to}` : `${from} (unchanged)`}`);
  console.log(`claim  ${claimChanges ? (wantClaim ? "admin claim set" : "admin claim cleared") : "unchanged"}`);

  if (!roleChanges && !claimChanges) {
    console.log("\nNothing to change.");
    return;
  }
  if (dryRun) {
    console.log("\nDry run: nothing was changed.");
    return;
  }

  if (roleChanges) {
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const [current, admins, [listing]] = await Promise.all([
        tx.get(userRef),
        tx.get(db.collection("users").where("role", "==", "admin").select()),
        tx.getAll(listingRef, { fieldMask: ["status"] }),
      ]);
      if (normaliseRole(current.get("role")) !== from) throw new Error("Their role changed while this ran. Run it again.");
      if (to !== "admin" && admins.docs.every((d) => d.id === uid)) {
        throw new Error("They are the only member of staff. Make somebody else staff first.");
      }
      tx.update(userRef, {
        role: to,
        previousRole: from,
        roleChangedAt: now,
        roleChangedBy: "script",
        // As adminSetRole: a provider is verified only while their listing is live.
        verified: to === "provider" ? listing.exists && listing.get("status") === "verified" : true,
        updatedAt: now,
      });
      tx.set(db.collection("auditLogs").doc(), {
        actorId: "script",
        action: "user.set_role",
        targetPath: `users/${uid}`,
        metadata: { from, to, via: "grant-admin" },
        createdAt: now,
      });
    });
  }

  if (claimChanges) {
    // Read again: a paid conversation may have started since the first read,
    // and its claims must survive this.
    const fresh = await auth.getUser(uid);
    const claims = { ...(fresh.customClaims ?? {}) };
    if (wantClaim) claims.admin = true;
    else delete claims.admin;
    await auth.setCustomUserClaims(uid, claims);
    if (!roleChanges) {
      await db.collection("auditLogs").add({
        actorId: "script",
        action: "user.admin_claim",
        targetPath: `users/${uid}`,
        metadata: { admin: wantClaim, via: "grant-admin" },
        createdAt: Date.now(),
      });
    }
  }

  console.log(
    `\nDone. ${wantClaim ? "They will have staff access to files the next time their sign-in refreshes — signing out and in again does it at once." : "Their staff access to files ends when their current sign-in token runs out, within the hour."}`,
  );
}

await main();
