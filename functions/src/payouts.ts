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
  | { kind: "accepted"; reference: string | null; transferId: string | null; state: TransferState }
  /**
   * Refused outright — nothing was sent by THIS request. On a first send that
   * means the sessions can go back; on a re-send it means nothing at all (see
   * applyOutcome). `cause`: whether the provider's details look wrong, or
   * Talk's side failed (no key, no balance, a refused key).
   */
  | { kind: "refused"; message: string; cause: "account" | "platform" }
  /** No clear answer — a timeout, a 5xx, a dropped line. It may have gone. */
  | { kind: "unknown"; message: string };

export type TransferClient = (body: TransferRequest, idempotencyKey: string) => Promise<TransferOutcome>;
/** Look a transfer up by its Modem Pay id (as the SDK's retrieve(id) does). */
export type TransferLookup = (transferId: string) => Promise<{ state: TransferState } | null>;

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
    disputed: data.disputed === true,
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
  const [sessions, sent] = await Promise.all([
    paidSessionsOf(uid).get(),
    db().collection(PAYOUTS).where("providerId", "==", uid).get(),
  ]);
  const statuses = new Map(sent.docs.map((d) => [d.id, d.data().status as PayoutStatus]));
  const summary = summariseEarnings(
    sessions.docs.map((d) => earnable(d.id, d.data())),
    now,
    (id) => statuses.get(id),
  );
  return {
    availableMinor: summary.availableMinor,
    heldMinor: summary.heldMinor,
    disputedMinor: summary.disputedMinor,
    onItsWayMinor: summary.onItsWayMinor,
    paidOutMinor: summary.paidOutMinor,
    availableSessions: summary.available.length,
  };
}

// ------------------------------------------------------------------ paying

export type PayoutResult =
  | { ok: true; payoutId: string; amountMinor: number; status: PayoutStatus }
  | { ok: false; reason: string; amountMinor?: number };

const NOT_SENT_ACCOUNT = "The transfer was refused. Check your wallet number and the name on it, then try again.";
const NOT_SENT_PLATFORM =
  "Talk could not send it just now — the problem is on our side, not your details. Your sessions are back in what is ready to send.";
const DID_NOT_GO = "The transfer did not go through. Your sessions are back in what is ready to send.";

/**
 * Withdraw everything available, to the account on file.
 *
 * Reserve first, in one transaction (the sessions become this payout's), then
 * send. Nothing is sent for a session another payout already holds. When the
 * provider confirmed an amount, that amount is what is sent — or nothing: a
 * page left open while another session came out of its hold must not send
 * more than they agreed to.
 */
export async function requestPayout(
  uid: string,
  transfer: TransferClient,
  opts: { callbackUrl: string; now?: number; expectedAmountMinor?: number },
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
    if (!available.length || availableMinor <= 0) return { none: true, changed: undefined, amountMinor: undefined };
    if (opts.expectedAmountMinor !== undefined && opts.expectedAmountMinor !== availableMinor) {
      return { none: false, changed: availableMinor, amountMinor: undefined };
    }
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
      transferId: null,
      transferReference: null,
      failureReason: null,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    });
    for (const b of available) tx.update(db().collection(BOOKINGS).doc(b.id), { payoutId: payoutRef.id });
    return { none: false, changed: undefined, amountMinor: availableMinor };
  });
  if (reserved.none) return { ok: false, reason: "Nothing to withdraw yet." };
  if (reserved.changed !== undefined) {
    return {
      ok: false,
      reason: `What is ready to send has changed to ${formatAmount(reserved.changed)}. Check it, and send again.`,
      amountMinor: reserved.changed,
    };
  }
  if (reserved.amountMinor === undefined) return { ok: false, reason: "Nothing to withdraw yet." };

  const outcome = await send(payoutRef, transfer, opts.callbackUrl);
  const status = await applyOutcome(payoutRef.id, outcome, { resend: false });
  return { ok: true, payoutId: payoutRef.id, amountMinor: reserved.amountMinor, status };
}

function formatAmount(minor: number): string {
  return `D${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

/** Send (or send again — same key, so never twice) the transfer for a payout. */
async function send(ref: DocumentReference, transfer: TransferClient, callbackUrl: string): Promise<TransferOutcome> {
  const payout = (await ref.get()).data();
  if (!payout) return { kind: "unknown", message: "No such payout." };
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

/**
 * Record what a transfer call said. Returns the payout's status after it.
 *
 * `resend`: this was a second ask, made exactly because the first may have
 * gone through. A refusal of the second ask says nothing about the first —
 * a key Modem Pay has already used, a balance the first one drained — so it
 * is treated as "still unclear", never as "nothing was sent". Only an
 * authoritative answer releases sessions: a failed webhook, a look-up that
 * says failed, a person.
 */
async function applyOutcome(
  payoutId: string,
  outcome: TransferOutcome,
  { resend }: { resend: boolean },
): Promise<PayoutStatus> {
  if (outcome.kind === "refused" && !resend) {
    if (outcome.cause === "platform") console.error(`Payout ${payoutId} refused on Talk's side: ${outcome.message}`);
    return release(payoutId, outcome.cause === "platform" ? NOT_SENT_PLATFORM : NOT_SENT_ACCOUNT, outcome.message, {
      platform: outcome.cause === "platform",
    });
  }
  if (outcome.kind === "refused" || outcome.kind === "unknown") {
    return advance(payoutId, "uncertain", { lastError: outcome.message.slice(0, 300) });
  }
  const ids = { transferId: outcome.transferId, transferReference: outcome.reference };
  if (outcome.state === "completed") return complete(payoutId, ids);
  if (outcome.state === "failed") return release(payoutId, DID_NOT_GO, "accepted, then failed");
  return advance(payoutId, "pending", ids);
}

/**
 * Move an unsettled payout forward — and only forward. initiating may become
 * pending or uncertain; uncertain may become pending (or stay); pending stays
 * pending. A payout already completed, failed or reversed is never put back:
 * a webhook that landed while the call was in flight has the last word.
 */
async function advance(
  payoutId: string,
  to: "pending" | "uncertain",
  fields: Record<string, unknown>,
): Promise<PayoutStatus> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  return db().runTransaction(async (tx) => {
    const payout = (await tx.get(ref)).data();
    const from = payout?.status as PayoutStatus | undefined;
    if (!payout || !from) return to;
    const allowed =
      from === "initiating" || (from === "uncertain" && (to === "pending" || to === "uncertain")) || (from === "pending" && to === "pending");
    if (!allowed) return from;
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
    tx.update(ref, { status: to, ...clean, updatedAt: Date.now() });
    return to;
  });
}

/**
 * It did not go: the sessions go back into the balance (only those this
 * payout still holds). Never for a payout already completed, failed or
 * reversed — a completed one that comes back is reverse()'s business.
 */
async function release(
  payoutId: string,
  reason: string,
  detail: string,
  { platform = false }: { platform?: boolean } = {},
): Promise<PayoutStatus> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  return db().runTransaction(async (tx) => {
    const payout = (await tx.get(ref)).data();
    if (!payout) return "failed" as PayoutStatus;
    if (payout.status === "completed" || payout.status === "failed" || payout.status === "reversed") {
      return payout.status as PayoutStatus;
    }
    const ids: string[] = Array.isArray(payout.bookingIds) ? payout.bookingIds : [];
    const sessions = await Promise.all(ids.map((id) => tx.get(db().collection(BOOKINGS).doc(id))));
    for (const s of sessions) {
      if (s.exists && s.data()?.payoutId === payoutId) tx.update(s.ref, { payoutId: null });
    }
    tx.update(ref, {
      status: "failed" satisfies PayoutStatus,
      failureReason: reason,
      lastError: detail.slice(0, 300),
      // Talk's own side failing is staff's to fix, not the provider's.
      ...(platform ? { needsReview: true, reviewReason: "Refused on Talk's side (key, balance or limits)" } : {}),
      updatedAt: Date.now(),
    });
    return "failed" as PayoutStatus;
  });
}

/**
 * It arrived. Whatever the payout's state before, every one of its sessions
 * is checked: still this payout's is right; free again (it had been released)
 * is taken back; held by ANOTHER payout means the provider was paid twice for
 * it — flagged for a person, because it must be seen.
 */
async function complete(
  payoutId: string,
  ids: { transferId?: string | null; transferReference?: string | null },
): Promise<PayoutStatus> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  return db().runTransaction(async (tx: Transaction) => {
    const payout = (await tx.get(ref)).data();
    if (!payout) return "completed" as PayoutStatus;
    if (payout.status === "completed") return "completed" as PayoutStatus;
    const bookingIds: string[] = Array.isArray(payout.bookingIds) ? payout.bookingIds : [];
    const sessions = await Promise.all(bookingIds.map((id) => tx.get(db().collection(BOOKINGS).doc(id))));
    let overlap = false;
    for (const s of sessions) {
      const held = s.data()?.payoutId;
      if (!held) tx.update(s.ref, { payoutId });
      else if (held !== payoutId) overlap = true;
    }
    tx.update(ref, {
      status: "completed" satisfies PayoutStatus,
      transferId: ids.transferId ?? payout.transferId ?? null,
      transferReference: ids.transferReference ?? payout.transferReference ?? null,
      failureReason: null,
      ...(overlap || payout.status === "reversed"
        ? { needsReview: true, reviewReason: "Completed after being released or reversed; check for a double payment" }
        : {}),
      updatedAt: Date.now(),
    });
    return "completed" as PayoutStatus;
  });
}

/**
 * It was sent, and then came back (a reversal: a closed wallet, a network
 * claw-back). The money is with Talk again, so the sessions go back into the
 * provider's balance — and a person is told, because a provider was shown
 * "Sent" for money they did not keep.
 */
async function reverse(payoutId: string, detail: string): Promise<PayoutStatus> {
  const ref = db().collection(PAYOUTS).doc(payoutId);
  return db().runTransaction(async (tx) => {
    const payout = (await tx.get(ref)).data();
    if (!payout || payout.status !== "completed") return (payout?.status ?? "failed") as PayoutStatus;
    const ids: string[] = Array.isArray(payout.bookingIds) ? payout.bookingIds : [];
    const sessions = await Promise.all(ids.map((id) => tx.get(db().collection(BOOKINGS).doc(id))));
    for (const s of sessions) {
      if (s.exists && s.data()?.payoutId === payoutId) tx.update(s.ref, { payoutId: null });
    }
    tx.update(ref, {
      status: "reversed" satisfies PayoutStatus,
      failureReason: "This came back to Talk after it was sent. Your sessions are back in what is ready to send.",
      lastError: detail.slice(0, 300),
      needsReview: true,
      reviewReason: "Reversed after it was sent",
      updatedAt: Date.now(),
    });
    return "reversed" as PayoutStatus;
  });
}

// ------------------------------------------------------------ the gateway says

async function findPayout(event: Pick<TransferEvent, "payoutId" | "reference">): Promise<DocumentReference | null> {
  if (event.payoutId) {
    const ref = db().collection(PAYOUTS).doc(event.payoutId);
    if ((await ref.get()).exists) return ref;
  }
  if (event.reference) {
    for (const field of ["transferId", "transferReference"]) {
      const found = await db().collection(PAYOUTS).where(field, "==", event.reference).limit(1).get();
      if (!found.empty) return found.docs[0].ref;
    }
  }
  return null;
}

/** A signed transfer event from the webhook. Says honestly what it did. */
export async function applyTransferEvent(event: TransferEvent): Promise<string> {
  const ref = await findPayout(event);
  if (!ref) return "No payout matches this transfer";
  const before = (await ref.get()).data()?.status as PayoutStatus | undefined;

  if (event.outcome === "succeeded") {
    await complete(ref.id, { transferReference: event.reference });
    return before === "completed" ? "Payout already completed" : "Payout completed";
  }
  if (event.outcome === "failed") {
    if (before === "completed") {
      await reverse(ref.id, event.eventName);
      return "Payout reversed after completing; sessions released and flagged for review";
    }
    const after = await release(ref.id, DID_NOT_GO, event.eventName);
    return after === "failed" && before !== "failed" ? "Payout failed; sessions released" : `Payout left as ${after}`;
  }
  if (event.outcome === "pending") await advance(ref.id, "pending", { transferReference: event.reference });
  return "Payout event noted";
}

/**
 * Where does this payout stand? An unclear one is sent again with its own key
 * (it cannot pay twice, and a refusal of the re-send releases nothing); a
 * pending one is looked up by Modem Pay's id for it.
 */
export async function settlePayout(
  ref: DocumentReference,
  transfer: TransferClient,
  lookup: TransferLookup,
  callbackUrl: string,
): Promise<PayoutStatus> {
  const payout = (await ref.get()).data();
  if (!payout) return "failed";
  const status = payout.status as PayoutStatus;
  if (status === "initiating" || status === "uncertain") {
    return applyOutcome(ref.id, await send(ref, transfer, callbackUrl), { resend: true });
  }
  const id = payout.transferId ?? payout.transferReference;
  if (status === "pending" && id) {
    const found = await lookup(id);
    if (found?.state === "completed") return complete(ref.id, {});
    if (found?.state === "failed") return release(ref.id, DID_NOT_GO, "lookup: failed");
  }
  return status;
}

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
  // A first send may still be running: asking again now would race it.
  if (payout.status === "initiating" && Date.now() - (payout.updatedAt ?? 0) < 60_000) {
    return { ok: true, status: "initiating" };
  }
  return { ok: true, status: await settlePayout(ref, transfer, lookup, callbackUrl) };
}

/**
 * Settle every payout left unsettled — for the scheduled reconciler, so a
 * transfer whose answer never came is not left "unconfirmed" until somebody
 * happens to tap Check.
 */
export async function settleStalePayouts(
  transfer: TransferClient,
  lookup: TransferLookup,
  callbackUrl: string,
  olderThanMs = 5 * 60_000,
): Promise<number> {
  const snap = await db().collection(PAYOUTS).where("status", "in", ["initiating", "uncertain", "pending"]).limit(50).get();
  let settled = 0;
  for (const doc of snap.docs) {
    if (Date.now() - (doc.data().updatedAt ?? 0) < olderThanMs) continue;
    const before = doc.data().status;
    const after = await settlePayout(doc.ref, transfer, lookup, callbackUrl);
    if (after !== before) settled += 1;
  }
  return settled;
}
