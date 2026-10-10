/**
 * What a provider has earned, and where it goes.
 *
 * Pure, and shared: the Cloud Function that sends the money and the screen
 * that shows the balance both decide "what is owed" with these functions, so
 * the number a provider is shown is the number they are sent.
 *
 * The model is connekteasy's withdrawal, reshaped around sessions rather than
 * a wallet balance: a provider's earnings are their SESSIONS, each worth its
 * fee less the platform's share, and a withdrawal claims a set of sessions.
 * A session can only ever be claimed by one payout — that is the whole guard
 * against paying twice.
 */

import { providerPayoutMinor } from "./money";
import type { PayoutNetwork } from "./payments/modempay-protocol";

/**
 * How long after a session ends before its fee can be withdrawn. Long enough
 * for "they never turned up" to be raised before the money has gone.
 */
export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

/** The networks a provider can be paid to, as people know them. */
export const PAYOUT_NETWORK_LABELS: Record<PayoutNetwork, string> = {
  wave: "Wave",
  afrimoney: "Afrimoney",
  qmoney: "QMoney",
  aps: "APS",
};

/** The parts of a booking that decide whether it has been earned. */
export type EarnableBooking = {
  id: string;
  amountMinor: number;
  paymentStatus: string;
  status: string;
  endsAt: number;
  payoutId?: string | null;
};

export type EarningState =
  /** Paid, over, past the hold, not yet withdrawn. */
  | "available"
  /** Paid, but the session has not ended, or ended inside the hold. */
  | "held"
  /** Already claimed by a payout. */
  | "withdrawn"
  /** Not money the provider is owed: unpaid, cancelled, a no-show. */
  | "none";

export function earningState(b: EarnableBooking, now: number): EarningState {
  if (b.paymentStatus !== "paid" || b.amountMinor <= 0) return "none";
  if (b.status === "cancelled" || b.status === "no_show") return "none";
  if (b.payoutId) return "withdrawn";
  return b.endsAt + PAYOUT_HOLD_MS <= now ? "available" : "held";
}

/** The provider's share of one session — the fee less the platform's. */
export function sessionShareMinor(b: Pick<EarnableBooking, "amountMinor">): number {
  return providerPayoutMinor(b.amountMinor);
}

export function summariseEarnings(bookings: EarnableBooking[], now: number) {
  let availableMinor = 0;
  let heldMinor = 0;
  let withdrawnMinor = 0;
  const available: EarnableBooking[] = [];
  for (const b of bookings) {
    const state = earningState(b, now);
    const share = sessionShareMinor(b);
    if (state === "available") {
      availableMinor += share;
      available.push(b);
    } else if (state === "held") heldMinor += share;
    else if (state === "withdrawn") withdrawnMinor += share;
  }
  return { availableMinor, heldMinor, withdrawnMinor, available };
}

/**
 * A Gambian mobile-money number as Modem Pay takes it: the seven local
 * digits ("7000000"), whatever spacing or +220 it was typed with. Null when it
 * is not one.
 */
export function walletNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("220")) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith("00220")) digits = digits.slice(5);
  return /^\d{7}$/.test(digits) ? digits : null;
}

/** "•••• 0123" — enough to recognise, not enough to copy. */
export function maskWallet(number: string): string {
  return `••• ${number.slice(-4)}`;
}

export type PayoutStatus =
  /** Sessions reserved; the transfer is being sent. */
  | "initiating"
  /** Modem Pay accepted it; waiting for the network. */
  | "pending"
  /** Sent, but we could not hear whether it went. Never released on a guess. */
  | "uncertain"
  /** The money arrived. */
  | "completed"
  /** It did not go; the sessions are back in the balance. */
  | "failed";

/** `payouts/{id}` — WRITTEN ONLY BY THE SERVER. */
export type Payout = {
  id: string;
  providerId: string;
  amountMinor: number;
  bookingIds: string[];
  network: PayoutNetwork;
  /** Masked — the full number lives only in payoutAccounts. */
  accountHint: string;
  beneficiaryName: string;
  status: PayoutStatus;
  transferReference: string | null;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
};

/** `payoutAccounts/{uid}` — where a provider is paid. Written only through savePayoutAccount. */
export type PayoutAccount = {
  uid: string;
  network: PayoutNetwork;
  accountNumber: string;
  beneficiaryName: string;
  updatedAt: number;
};
