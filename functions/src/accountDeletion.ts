/**
 * Clearing up after a deleted account.
 *
 *   cleanUpDeletedAccount   users/{uid} was deleted — by the person, on
 *                           "Delete my account", or by staff
 *
 * It removes what TALK still keeps under that uid and the browser could not:
 * presence and its day, week and month markers, a provider application and
 * staff's review of it, the public listing, the payout wallet, their
 * notifications, and the application's files and public photo in Storage.
 * What goes, and what is kept on purpose and why, is app/lib/accountDeletion.ts.
 *
 * Started by the document going rather than by the sign-in going, because
 * deleteAccount (app/lib/auth.ts) deletes the document first and the sign-in
 * last, and that last step can be refused ("sign in again first") after the
 * person's data has already gone. The rest should go with it, not wait.
 *
 * WHERE IT RUNS. The database is in nam5, the US multi-region (as the
 * Firestore API reports it). The Eventarc trigger of a 2nd-gen Firestore
 * function has to be where the database is, and `firebase deploy` puts it
 * there by itself (ensureFirestoreTriggerRegion in firebase-tools, which
 * refuses any other); the function runs in us-east4 with everything else,
 * and is delivered to there.
 *
 * Every step is safe to run again — deleting what has gone already changes
 * nothing — so a step that fails throws and the event is delivered again
 * (retry). The audit line is written once everything has gone, under an id
 * made from the event's, so a delivery that comes twice rewrites one line
 * rather than adding a second.
 *
 * Runs as the project's default service account, never as talk-ai, which
 * stays database-blind (scripts/verify-service-accounts.mjs).
 */

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { getStorage } from "firebase-admin/storage";
import { db } from "./payments";
import { AUDIT_LOGS, BUCKET, auditEntry } from "./staff";
import { deletionPlan } from "../../app/lib/accountDeletion";
import { SYSTEM_ACTOR } from "../../app/lib/adminOps";
import { normaliseRole } from "../../app/lib/models";

/** How many documents one batch removes. Firestore allows 500 writes. */
const BATCH = 400;

/** A path with an even number of segments names a document; odd, a collection. */
function treeRef(path: string) {
  return path.split("/").length % 2 === 0 ? db().doc(path) : db().collection(path);
}

/**
 * Remove every document in `collection` whose `field` is `uid`. Read as bare
 * references (select()), so not one notification's words is ever loaded.
 */
async function deleteWhere(collection: string, field: string, uid: string): Promise<number> {
  const query = db().collection(collection).where(field, "==", uid).select().limit(BATCH);
  let removed = 0;
  for (;;) {
    const snap = await query.get();
    if (snap.empty) return removed;
    const batch = db().batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    removed += snap.size;
  }
}

/** Delete every file under `prefix`. Returns how many there were. */
async function emptyFolder(prefix: string): Promise<number> {
  const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

const sum = (counts: number[]) => counts.reduce((a, b) => a + b, 0);

export const cleanUpDeletedAccount = onDocumentDeleted(
  { document: "users/{uid}", region: "us-east4", retry: true },
  async (event) => {
    const uid = event.params.uid;
    const plan = deletionPlan(uid);
    if (!plan) {
      // Not an id Auth issues. Clearing folders by it could reach somebody
      // else's, so nothing is touched, and it is said loudly.
      console.error(`cleanUpDeletedAccount: users/${uid} is not a plain uid; nothing was cleared`);
      return;
    }

    const [trees, matched, files] = await Promise.allSettled([
      Promise.all(plan.trees.map((path) => db().recursiveDelete(treeRef(path)))),
      Promise.all(plan.matching.map(({ collection, field }) => deleteWhere(collection, field, uid))),
      Promise.all(plan.storagePrefixes.map(emptyFolder)),
    ]);

    const failed = [trees, matched, files].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) console.error(`cleanUpDeletedAccount: could not clear part of ${uid}`, f.reason);
      // Thrown, so the event is delivered again. What did go is a no-op then.
      throw new Error(`Clearing up after ${uid} is unfinished; it will be tried again.`);
    }

    // Counts and the role the account had: enough for staff to see why a
    // listing came down, and nothing about the person.
    const role = event.data?.get("role");
    const id = `account-deleted-${event.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
    await db()
      .collection(AUDIT_LOGS)
      .doc(id)
      .set(
        auditEntry(SYSTEM_ACTOR, "account.deleted", `users/${uid}`, {
          role: normaliseRole(typeof role === "string" ? role : null),
          notifications: matched.status === "fulfilled" ? sum(matched.value) : 0,
          files: files.status === "fulfilled" ? sum(files.value) : 0,
        }),
      );
  },
);
