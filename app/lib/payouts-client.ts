"use client";

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, firebaseFunctions, firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import type { Payout, PayoutAccount, PayoutStatus } from "./payouts";
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
  /** Sessions a patient said did not happen — held for a person. */
  disputedMinor: number;
  /** In payouts still sending, on their way, or not yet confirmed. */
  onItsWayMinor: number;
  /** In payouts that arrived. */
  paidOutMinor: number;
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

/**
 * Send what is ready — exactly `expectedAmountMinor`, the figure the provider
 * confirmed. If more has come out of its hold since, nothing is sent and the
 * new figure comes back to be confirmed instead.
 */
export async function requestPayout(
  expectedAmountMinor: number,
): Promise<
  | { ok: true; amountMinor: number; status: PayoutStatus }
  | { ok: false; error: string; amountMinor: number | null }
> {
  try {
    const call = httpsCallable<{ expectedAmountMinor: number }, { amountMinor: number; status: PayoutStatus }>(
      firebaseFunctions(),
      "requestPayout",
    );
    const { data } = await call({ expectedAmountMinor });
    return { ok: true, amountMinor: data.amountMinor, status: data.status };
  } catch (error) {
    const details = (error as { details?: { amountMinor?: number | null } }).details;
    return {
      ok: false,
      error: message(error, "Could not send it. Please try again."),
      amountMinor: details?.amountMinor ?? null,
    };
  }
}

/** Ask where a payout stands; null when the question could not be asked. */
export async function checkPayout(payoutId: string): Promise<PayoutStatus | null> {
  try {
    const call = httpsCallable<{ payoutId: string }, { status: PayoutStatus }>(firebaseFunctions(), "checkPayout");
    return (await call({ payoutId })).data.status;
  } catch {
    return null;
  }
}

/** "They did not come" — from the patient's side of a paid session. */
export async function reportMissedSession(bookingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await httpsCallable(firebaseFunctions(), "reportMissedSession")({ bookingId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Could not send that. Please try again.") };
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
