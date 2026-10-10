"use client";

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, firebaseFunctions, firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import type { Payout, PayoutAccount } from "./payouts";
import type { PayoutNetwork } from "./payments/modempay-protocol";

/**
 * A provider's earnings and payouts, from the browser.
 *
 * Every write goes through a Cloud Function: where money is sent, and the
 * sending, are never a client's to write (firestore.rules refuses both).
 * What the browser reads is its own account and its own payouts.
 */

export type Earnings = {
  availableMinor: number;
  heldMinor: number;
  withdrawnMinor: number;
  availableSessions: number;
};

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function fetchEarnings(): Promise<Earnings | null> {
  try {
    const call = httpsCallable<Record<string, never>, Earnings>(firebaseFunctions(), "providerEarnings");
    return (await call({})).data;
  } catch {
    return null;
  }
}

export async function savePayoutAccount(input: {
  network: PayoutNetwork;
  accountNumber: string;
  beneficiaryName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await httpsCallable(firebaseFunctions(), "savePayoutAccount")(input);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not save that. Please try again.") };
  }
}

export async function requestPayout(): Promise<{ ok: true; amountMinor: number } | { ok: false; error: string }> {
  try {
    const call = httpsCallable<Record<string, never>, { amountMinor: number }>(firebaseFunctions(), "requestPayout");
    return { ok: true, amountMinor: (await call({})).data.amountMinor };
  } catch (error) {
    return { ok: false, error: message(error, "Could not send it. Please try again.") };
  }
}

export async function checkPayout(payoutId: string): Promise<void> {
  try {
    await httpsCallable(firebaseFunctions(), "checkPayout")({ payoutId });
  } catch {
    // The list below is live; a failed check just leaves it as it was.
  }
}

export function watchPayoutAccount(uid: string, cb: (account: PayoutAccount | null) => void): () => void {
  if (!firebaseConfigured()) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), COLLECTIONS.payoutAccounts, uid),
    (snap) => cb(snap.exists() ? (snap.data() as PayoutAccount) : null),
    () => cb(null),
  );
}

/** Newest first. Sorted here rather than in the query, which then needs no index. */
export function watchPayouts(uid: string, cb: (payouts: Payout[]) => void): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), COLLECTIONS.payouts), where("providerId", "==", uid)),
    (snap) => cb(snap.docs.map((d) => d.data() as Payout).sort((a, b) => b.createdAt - a.createdAt)),
    () => cb([]),
  );
}
