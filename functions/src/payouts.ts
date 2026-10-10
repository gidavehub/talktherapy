/**
 * Paying providers.
 *
 * The owner's connekteasy pays out with Modem Pay's `POST /v1/transfers`:
 * take the money off the balance first, send it with an Idempotency-Key, and
 * put it back if the transfer fails. Talk does the same, with two changes:
 *
 *  1. A provider's balance is not a number that can drift — it is their
 *     SESSIONS (app/lib/payouts.ts). "Taking it off" means reserving those
 *     sessions to one payout, in one transaction. A session can belong to one
 *     payout only, so two withdrawals racing cannot both be paid for it.
 *
 *  2. A failure is only "put back" when it is CERTAIN nothing was sent. A
 *     timeout or a gateway error might mean the money went — releasing the
 *     sessions then would let them be withdrawn twice. Those payouts are
 *     marked "uncertain" and asked about again with the SAME idempotency key
 *     (the payout's id), which can never send the money a second time.
 *
 * The HTTP call is passed in (TransferClient), so the logic here can be tested
 * against the real database with a fake transfer, and no money moving.
 */

import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { db } from "./payments";
import {
  buildTransferBody,
  isPayoutNetwork,
  type PayoutNetwork,
  type TransferEvent,
  type TransferRequest,
  type TransferState,
} from "../../app/lib/payments/modempay-protocol";
import { toMajor } from "../../app/lib/money";
import {
  maskWallet,
  summariseEarnings,
  walletNumber,
  type EarnableBooking,
  type PayoutStatus,
} from "../../app/lib/payouts";

const PAYOUTS = "payouts";
const ACCOUNTS = "payoutAccounts";
const BOOKINGS = "bookings";
const USERS = "users";

/** What happened when a transfer was asked for. */
export type TransferOutcome =
  /** Modem Pay took it. Where it stands: pending, completed, even failed. */
  | { kind: "accepted"; reference: string | null; state: TransferState }
  /** Refused outright — nothing was sent. Safe to put the sessions back. */
  | { kind: "refused"; message: string }
  /** No clear answer — a timeout, a 5xx, a dropped line. It may have gone. */
  | { kind: "unknown"; message: string };

export type TransferClient = (body: TransferRequest, idempotencyKey: string) => Promise<TransferOutcome>;
export type TransferLookup = (reference: string) => Promise<{ state: TransferState } | null>;

// ------------------------------------------------------------- where to pay

export async function savePayoutAccount(
  uid: string,
  input: { network: unknown; accountNumber: unknown; beneficiaryName: unknown },
): Promise<
  | { ok: true; account: { network: PayoutNetwork; accountHint: string; beneficiaryName: string } }
  | { ok: false; reason: string }
> {
  const role = (await db().collection(USERS).doc(uid).get()).data()?.role;
  if (role !== "provider") return { ok: false, reason: "Only providers are paid out." };

  const network = String(input.network ?? "").toLowerCase();
  if (!isPayoutNetwork(network)) return { ok: false, reason: "Choose Wave, Afrimoney, QMoney or APS." };
  const accountNumber = walletNumber(String(input.accountNumber ?? ""));
  if (!accountNumber) return { ok: false, reason: "That is not a Gambian mobile number — seven digits, like 7000000." };
  const beneficiaryName = String(input.beneficiaryName ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (beneficiaryName.length < 3) return { ok: false, reason: "The name on the account, please." };

  const now = Date.now();
  const ref = db().collection(ACCOUNTS).doc(uid);
  const batch = db().batch();
  batch.set(ref, { uid, network, accountNumber, beneficiaryName, updatedAt: now });
  // Where money goes is the thing a stolen session would change. Every
  // change is kept, so one can be traced.
  batch.set(ref.collection("changes").doc(), { network, accountHint: maskWallet(accountNumber), beneficiaryName, at: now });
  await batch.commit();
  return { ok: true, account: { network, accountHint: maskWallet(accountNumber), beneficiaryName } };
}

// ------------------------------------------------------------------ earnings

function earnable(id: string, data: FirebaseFirestore.DocumentData): EarnableBooking {
  return {
    id,
    amountMinor: typeof data.amountMinor === "number" ? data.amountMinor : 0,
    paymentStatus: String(data.paymentStatus ?? ""),
    status: String(data.status ?? ""),
    endsAt: typeof data.endsAt === "number" ? data.endsAt : 0,
    payoutId: typeof data.payoutId === "string" ? data.payoutId : null,
  };
}

const paidSessionsOf = (uid: string) =>
  db().collection(BOOKINGS).where("providerId", "==", uid).where("paymentStatus", "==", "paid");

/**
 * What a provider has earned, as the payout itself will count it — the same
 * query and the same rules (summariseEarnings), so the number on their screen
 * is the number they are sent.
 */
export async function earningsFor(uid: string, now = Date.now()) {
  const snap = await paidSessionsOf(uid).get();
  const { availableMinor, heldMinor, withdrawnMinor, available } = summariseEarnings(
    snap.docs.map((d) => earnable(d.id, d.data())),
    now,
  );
  return { availableMinor, heldMinor, withdrawnMinor, availableSessions: available.length };
}

// ------------------------------------------------------------------ paying

export type PayoutResult =
  | { ok: true; payoutId: string; amountMinor: number; status: PayoutStatus }
  | { ok: false; reason: string };

/**
 * Withdraw everything available, to the account on file.
 *
 * Reserve first, in one transaction (the sessions become this payout's), then
 * send. Nothing is sent for a session another payout already holds.
 */
export async function requestPayout(
  uid: string,
  transfer: TransferClient,
  opts: { callbackUrl: string; now?: number },
): Promise<PayoutResult> {
  const account = (await db().collection(ACCOUNTS).doc(uid).get()).data();
  if (!account || !isPayoutNetwork(String(account.network)) || !account.accountNumber) {
    return { ok: false, reason: "Add where to send your money first." };
  }
  const network = account.network as PayoutNetwork;
  const now = opts.now ?? Date.now();
  const payoutRef = db().collection(PAYOUTS).doc();

  const reserved = await db().runTransaction(async (tx) => {
    const snap = await tx.get(paidSessionsOf(uid));
    const { available, availableMinor } = summariseEarnings(
      snap.docs.map((d) => earnable(d.id, d.data())),
      now,
    );
    if (!available.length || availableMinor <= 0) return null;
    tx.set(payoutRef, {
      id: payoutRef.id,
      providerId: uid,
      amountMinor: availableMinor,
      bookingIds: available.map((b) => b.id),
      network,
      // The full number is the provider's own, and needed to send again
      // after an unclear answer; the hint is what screens show.
      accountNumber: account.accountNumber,
      accountHint: maskWallet(String(account.accountNumber)),
      beneficiaryName: account.beneficiaryName,
      status: "initiating" satisfies PayoutStatus,
      transferReference: null,
      failureReason: null,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    });
    for (const b of available) tx.update(db().collection(BOOKINGS).doc(b.id), { payoutId: payoutRef.id });
    return { amountMinor: availableMinor };
  });
  if (!reserved) return { ok: false, reason: "Nothing to withdraw yet." };

  const outcome = await send(payoutRef, transfer, opts.callbackUrl);
  const status = await applyOutcome(payoutRef.id, outcome);
  return { ok: true, payoutId: payoutRef.id, amountMinor: reserved.amountMinor, status };
}

/** Send (or send again — same key, so never twice) the transfer for a payout. */
async function send(ref: DocumentReference, transfer: TransferClient, callbackUrl: string): Promise<TransferOutcome> {
  const payout = (await ref.get()).data();
  if (!payout) return { kind: "refused", message: "No such payout." };
  const body = buildTransferBody({
    amountMajor: toMajor(payout.amountMinor),
    network: payout.network,
    accountNumber: payout.accountNumber,
    beneficiaryName: payout.beneficiaryName,
    narration: "Talk — your sessions",
    metadata: { payout_id: ref.id, provider_id: payout.providerId },
    callbackUrl,
  });
  try {
    return await transfer(body, ref.id);
  } catch (error) {
    return { kind: "unknown", message: (error as Error).message ?? "Transfer failed" };
  }
}

/** Record what the transfer call said. Returns the payout's status after it. */
async function applyOutcome(payoutId: string, outcome: TransferOutcome): Promise<PayoutStatus> {
  if (outcome.kind === "refused") {
    await release(payoutId, "The transfer was refused. Check your number and name, then try again.", outcome.message);
    return "failed";
  }
  if (outcome.kind === "unknown") {
    await db().collection(PAYOUTS).doc(payoutId).update({
      status: "uncertain" satisfies PayoutStatus,
      lastError: outcome.message.slice(0, 300),
      updatedAt: Date.now(),
    });
    return "uncertain";
  }
  if (outcome.state === "completed") {
    await complete(payoutId, outcome.reference);
    return "completed";
  }
  if (outcome.state === "failed") {
    await release(payoutId, "The transfer did not go through. Try again in a little while.", "accepted, then failed");
    return "failed";
  }
  await db().collection(PAYOUTS).doc(payoutId).update({
    status: "pending" satisfies PayoutStatus,
    transferReference: outcome.reference,
    updatedAt: Date.now(),
  });
  return "pending";
}

/**
 * It did not go: the sessions go back into the balance. Never for a payout
 * already completed or already released.
 */
async function release(payoutId: string, reason: string, detail: string): Promise<void> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  await db().runTransaction(async (tx) => {
    const payout = (await tx.get(ref)).data();
    if (!payout || payout.status === "completed" || payout.status === "failed") return;
    const ids: string[] = Array.isArray(payout.bookingIds) ? payout.bookingIds : [];
    const sessions = await Promise.all(ids.map((id) => tx.get(db().collection(BOOKINGS).doc(id))));
    for (const s of sessions) {
      if (s.exists && s.data()?.payoutId === payoutId) tx.update(s.ref, { payoutId: null });
    }
    tx.update(ref, {
      status: "failed" satisfies PayoutStatus,
      failureReason: reason,
      lastError: detail.slice(0, 300),
      updatedAt: Date.now(),
    });
  });
}

/**
 * It arrived. If it arrives for a payout already released — the gateway said
 * one thing, then another — its sessions are taken back where still free,
 * and any already paid again elsewhere flag the payout for a person: that is
 * a provider paid twice for one session, and it must be seen.
 */
async function complete(payoutId: string, reference: string | null): Promise<void> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  await db().runTransaction(async (tx: Transaction) => {
    const payout = (await tx.get(ref)).data();
    if (!payout || payout.status === "completed") return;
    let overlap = false;
    if (payout.status === "failed") {
      const ids: string[] = Array.isArray(payout.bookingIds) ? payout.bookingIds : [];
      const sessions = await Promise.all(ids.map((id) => tx.get(db().collection(BOOKINGS).doc(id))));
      for (const s of sessions) {
        const held = s.data()?.payoutId;
        if (!held) tx.update(s.ref, { payoutId });
        else if (held !== payoutId) overlap = true;
      }
    }
    tx.update(ref, {
      status: "completed" satisfies PayoutStatus,
      transferReference: reference ?? payout.transferReference ?? null,
      failureReason: null,
      ...(overlap ? { needsReview: true, reviewReason: "Completed after being released; a session was paid again" } : {}),
      updatedAt: Date.now(),
    });
  });
}

// ------------------------------------------------------------ the gateway says

/** A signed transfer event from the webhook. */
export async function applyTransferEvent(event: TransferEvent): Promise<string> {
  let ref: DocumentReference | null = event.payoutId ? db().collection(PAYOUTS).doc(event.payoutId) : null;
  if ((!ref || !(await ref.get()).exists) && event.reference) {
    const found = await db().collection(PAYOUTS).where("transferReference", "==", event.reference).limit(1).get();
    ref = found.empty ? null : found.docs[0].ref;
  }
  if (!ref || !(await ref.get()).exists) return "No payout matches this transfer";

  if (event.outcome === "succeeded") {
    await complete(ref.id, event.reference);
    return "Payout completed";
  }
  if (event.outcome === "failed") {
    await release(ref.id, "The transfer did not go through. Try again in a little while.", event.eventName);
    return "Payout failed; sessions released";
  }
  return "Payout event noted";
}

/**
 * Where does this payout stand? For one the provider is looking at: an unclear
 * one is sent again with its own key (safe — it cannot pay twice), a pending
 * one is looked up.
 */
export async function checkPayout(
  uid: string,
  payoutId: string,
  transfer: TransferClient,
  lookup: TransferLookup,
  callbackUrl: string,
): Promise<{ ok: true; status: PayoutStatus } | { ok: false; reason: string }> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  const payout = (await ref.get()).data();
  if (!payout || payout.providerId !== uid) return { ok: false, reason: "No such payout." };
  const status = payout.status as PayoutStatus;

  if (status === "initiating" || status === "uncertain") {
    return { ok: true, status: await applyOutcome(payoutId, await send(ref, transfer, callbackUrl)) };
  }
  if (status === "pending" && payout.transferReference) {
    const found = await lookup(payout.transferReference);
    if (found?.state === "completed") {
      await complete(payoutId, payout.transferReference);
      return { ok: true, status: "completed" };
    }
    if (found?.state === "failed") {
      await release(payoutId, "The transfer did not go through. Try again in a little while.", "lookup: failed");
      return { ok: true, status: "failed" };
    }
  }
  return { ok: true, status };
}
