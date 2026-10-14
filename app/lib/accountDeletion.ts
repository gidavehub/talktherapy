/**
 * What deleting an account clears on the server: everything TALK keeps under
 * a person's uid that their own browser cannot remove.
 *
 * "Delete my account" (deleteAccount in app/lib/auth.ts) deletes the profile,
 * mood check-ins and journal entries from the browser, then the sign-in. The
 * rest it cannot reach: nobody may read presence back, so its markers cannot
 * be listed to delete them; an application is never deleted from the
 * browser; staff notes and notifications are written by the functions alone.
 * So the cleanUpDeletedAccount function (functions/src/accountDeletion.ts)
 * clears them the moment users/{uid} goes, from this list.
 *
 * Pure on purpose — no Firebase, no React — so scripts/test-account-deletion.mts
 * can check the list against firestore.rules and storage.rules: a new place
 * that keeps something by uid fails that test until it is cleared here or
 * named there as kept, with the reason. Listed in functions/tsconfig.json.
 *
 * Kept on purpose: payments, entitlements and payouts (money records, kept
 * for the period the law asks, as the settings page says); bookings, chats
 * and sessions (the other person's record too); users/{uid}/consentEvents
 * (evidence of what was agreed and when, append-only by design); and a
 * provider's calendar under availability/{uid} (a booked time belongs to the
 * patient's booking, and an open one cannot be booked once the listing has
 * gone). The audit log keeps the decisions staff made, which never carry what
 * anybody wrote about themselves.
 */

export type DeletionPlan = {
  /** Firestore documents and collections removed with everything under them. */
  trees: string[];
  /** Collections in which every document whose `field` is the uid is removed. */
  matching: { collection: string; field: string }[];
  /** Storage folders emptied. Each ends in "/", so "abc/" never reaches "abcd/". */
  storagePrefixes: string[];
};

/**
 * A uid that names one document and one folder: what Firebase Auth issues,
 * and the hyphenated ids the smoke scripts use. Anything else — empty, a
 * slash, a dot — could widen a folder to somebody else's, so it clears nothing.
 */
export function isPlainUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

/** Everything to clear for `uid`, or null when the uid is not a plain one. */
export function deletionPlan(uid: string): DeletionPlan | null {
  if (!isPlainUid(uid)) return null;
  return {
    trees: [
      // Already gone when the browser deleted the account; cleared here too
      // for an account staff removed, which skips that step.
      `users/${uid}/moodEntries`,
      `users/${uid}/journalEntries`,
      // "Signed in now" and the day, week and month markers under it.
      `presence/${uid}`,
      // The application (ID, licence and contact details) and staff's working
      // space for it, notes included.
      `providerApplications/${uid}`,
      `providerReviews/${uid}`,
      // The public listing, so nobody finds or books a person who has gone,
      // with the old credential links under it.
      `providerProfiles/${uid}`,
      // The wallet their earnings went to. A payout already made keeps its
      // own copy of where it was sent.
      `payoutAccounts/${uid}`,
      // How many conversation reports they sent today.
      `analyticsQuota/${uid}`,
    ],
    matching: [{ collection: "notifications", field: "to" }],
    storagePrefixes: [
      // Certificates, licences, ID and the photo sent with an application.
      `provider-credentials/${uid}/`,
      // The public photo, avatars/{uid}/provider.jpg, and any other of theirs.
      `avatars/${uid}/`,
    ],
  };
}
