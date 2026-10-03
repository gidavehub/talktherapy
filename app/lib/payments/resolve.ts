/**
 * Who paid?
 *
 * A webhook arrives with whatever the provider chose to include, and crediting
 * the wrong account is worse than crediting none — so this resolves identity in
 * three tiers, each less trustworthy than the last, and refuses rather than
 * guesses at the end.
 *
 *   1. `metadata.uid`, which this integration always attaches when it creates
 *      the payment. Nothing else is needed when it is there.
 *   2. `GET /v1/transactions/{id}`. The provider's own record, fetched fresh.
 *      It is the authority on both the amount and the metadata: a delivered
 *      payload can be stale or partial, this cannot.
 *   3. The payer's email address, matched against our users. Used only when it
 *      matches EXACTLY ONE account — two people sharing a billing address is
 *      not a licence to pick one.
 *
 * An unresolved payment is not an error. It is recorded as succeeded with
 * `needsReview`, and a human sorts it out with the money already safely in the
 * account.
 */

import "server-only";
import { adminDb } from "@/lib/server/admin";
import type { VerifiedPayment } from "./provider";

export type PayerSource = "metadata" | "transaction" | "email" | "unresolved";

export type ResolvedPayer = {
  uid: string | null;
  source: PayerSource;
  /** Plain English, recorded on the payment so a reviewer knows what happened. */
  note: string;
  /** Authoritative where the transaction lookup supplied them. */
  purpose: string | null;
  email: string | null;
};

export async function resolvePayer(input: {
  /** `metadata.uid` from the delivered payload. */
  metadataUid: string | null;
  /** The provider's own record, or null when the lookup was not possible. */
  authoritative: VerifiedPayment | null;
  /** Email from the delivered payload, as a fallback for the lookup's own. */
  payloadEmail: string | null;
  /** Purpose from the delivered payload. */
  payloadPurpose: string | null;
}): Promise<ResolvedPayer> {
  const email = input.authoritative?.customerEmail ?? input.payloadEmail;
  const purpose = input.authoritative?.purpose ?? input.payloadPurpose;

  if (input.metadataUid) {
    return { uid: input.metadataUid, source: "metadata", note: "Matched by metadata.uid", purpose, email };
  }

  if (input.authoritative?.uid) {
    return {
      uid: input.authoritative.uid,
      source: "transaction",
      note: "Matched by metadata on the provider's transaction record",
      purpose,
      email,
    };
  }

  if (email) {
    const matches = await usersWithEmail(email);
    if (matches.length === 1) {
      return { uid: matches[0], source: "email", note: `Matched uniquely by email ${email}`, purpose, email };
    }
    return {
      uid: null,
      source: "unresolved",
      note:
        matches.length === 0
          ? `No account has the email ${email}`
          : `${matches.length} accounts share the email ${email} — refusing to guess`,
      purpose,
      email,
    };
  }

  return { uid: null, source: "unresolved", note: "No uid and no email on the payment", purpose, email };
}

/**
 * Accounts with this email.
 *
 * Queried against our own `users` collection rather than `getUserByEmail` on
 * Auth, because Auth guarantees one match by construction and so could never
 * report the ambiguity this function exists to detect. Limited to two: one is
 * enough to act on, two is enough to refuse.
 */
async function usersWithEmail(email: string): Promise<string[]> {
  const snap = await adminDb()
    .collection("users")
    .where("email", "==", email.toLowerCase())
    .limit(2)
    .get();
  return snap.docs.map((d) => d.id);
}
