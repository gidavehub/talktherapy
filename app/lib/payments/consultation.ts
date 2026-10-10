"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../components/AuthProvider";
import { firebaseConfigured, firebaseFunctions, firestore } from "../firebase";
import { checkPayment } from "../booking";
import { useNow } from "../useNow";
import {
  COLLECTIONS,
  entitlementActive,
  tierCovers,
  type AiTierId,
  type Entitlement,
} from "../models";

/**
 * Paying for a conversation with Talk — the D200 initial consultation, or the
 * longer one — from the browser's side.
 *
 * The price is never sent: the callable is given a tier name and prices it on
 * the server. What the page watches is `entitlements/{uid}`, which only the
 * server writes, in the same transaction that marks the payment fulfilled.
 */

/** The payment in flight, per tab — it dies with the tab, not with the phone. */
const PENDING_KEY = "talk:consultation-payment";

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
function writePending(id: string | null) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode: the entitlement watch still settles it.
  }
}

export async function startConsultationPayment(
  tier: AiTierId,
): Promise<{ ok: true; paymentIntentId: string; paymentLink: string } | { ok: false; error: string; paid?: boolean }> {
  try {
    const call = httpsCallable<{ tier: AiTierId }, { paymentIntentId: string; paymentLink: string }>(
      firebaseFunctions(),
      "startConsultationPayment",
    );
    const { data } = await call({ tier });
    if (!data?.paymentLink || !data.paymentIntentId) return { ok: false, error: "Could not start the payment." };
    return { ok: true, paymentIntentId: data.paymentIntentId, paymentLink: data.paymentLink };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: message || "Could not start the payment.",
      // Already paid for: not an error to show, a state to move on from.
      paid: code.endsWith("failed-precondition"),
    };
  }
}

/**
 * Begin (or carry on) the paid conversation: starts its clock on the server
 * and puts it on the account. False when there is nothing paid to begin.
 */
export async function claimConsultation(): Promise<boolean> {
  try {
    const call = httpsCallable<Record<string, never>, { ok: boolean }>(firebaseFunctions(), "claimConsultation");
    const { data } = await call({});
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

/** "Has my payment arrived?" — for a tab that does not know which payment. */
async function reconcileConsultation(): Promise<{ paid: boolean; needsReview: boolean } | null> {
  try {
    const call = httpsCallable<Record<string, never>, { paid: boolean; needsReview: boolean }>(
      firebaseFunctions(),
      "reconcileConsultation",
    );
    const { data } = await call({});
    return { paid: Boolean(data?.paid), needsReview: Boolean(data?.needsReview) };
  } catch {
    return null;
  }
}

function watchEntitlement(uid: string, cb: (e: Entitlement | null) => void): () => void {
  return onSnapshot(
    doc(firestore(), COLLECTIONS.entitlements, uid),
    (snap) => cb(snap.exists() ? (snap.data() as Entitlement) : null),
    () => cb(null),
  );
}

function watchPayment(id: string, cb: (p: { fulfilled: boolean; needsReview: boolean } | null) => void) {
  return onSnapshot(
    doc(firestore(), COLLECTIONS.payments, id),
    (snap) => {
      const data = snap.data();
      cb(data ? { fulfilled: data.fulfilled === true, needsReview: data.needsReview === true } : null);
    },
    () => cb(null),
  );
}

export type PaymentPhase =
  /** Nothing started. */
  | "idle"
  /** Asking for a checkout link. */
  | "opening"
  /** At the checkout; waiting to hear the money arrived. */
  | "waiting"
  /** The money arrived but needs a person to look at it. */
  | "held";

/**
 * Everything about paying for a consultation: whether it is paid, starting a
 * payment, noticing when it settles, and beginning the paid conversation.
 *
 * `paid` is `null` while it is still being looked up — the page shows neither
 * the payment sheet nor the conversation until it knows which. It is true
 * only for a consultation that covers THIS kind of conversation: the D200 one
 * is the intake; talking to Talk afterwards is the longer one.
 *
 * `expecting`: this page was opened by a checkout coming back, so a payment
 * is on its way even if this tab never learned its id.
 */
export function useConsultation(tier: AiTierId, { expecting = false }: { expecting?: boolean } = {}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useNow(15_000);
  const [entitlement, setEntitlement] = useState<{ uid: string; value: Entitlement | null } | null>(null);
  const [intentId, setIntentId] = useState<string | null>(() => (typeof window === "undefined" ? null : readPending()));
  const [phase, setPhase] = useState<PaymentPhase>(() =>
    typeof window !== "undefined" && (readPending() || expecting) ? "waiting" : "idle",
  );
  /** When this tab started waiting — so a late arrival is not mistaken for a fresh one. */
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!uid || !firebaseConfigured()) return;
    return watchEntitlement(uid, (value) => setEntitlement({ uid, value }));
  }, [uid]);

  const known = entitlement && entitlement.uid === uid ? entitlement.value : undefined;
  const covers = tier === "initial" ? "intake" : "companion";
  const paid = !uid
    ? false
    : known === undefined
      ? null
      : Boolean(known && entitlementActive(known, now) && tierCovers(known.aiTier, covers));

  // Paid: the payment in flight is settled; nothing left to remember.
  useEffect(() => {
    if (paid) writePending(null);
  }, [paid]);

  // The payment in flight: held for review is said plainly, not left spinning.
  useEffect(() => {
    if (!intentId || phase !== "waiting" || !firebaseConfigured()) return;
    return watchPayment(intentId, (p) => {
      if (p?.needsReview && !p.fulfilled) setPhase("held");
    });
  }, [intentId, phase]);

  /** Ask the gateway now — about this tab's payment, or any recent one. */
  const ask = useCallback(async () => {
    const result = intentId ? await checkPayment(intentId) : await reconcileConsultation();
    if (!result) return null;
    const settled = "fulfilled" in result ? result.fulfilled : result.paid;
    if (result.needsReview && !settled) setPhase("held");
    return { settled, needsReview: result.needsReview };
  }, [intentId]);

  // A lost or slow webhook must not leave somebody who paid looking at a
  // spinner. Ask the gateway every few seconds, then every half minute — for
  // as long as they wait — and straight away whenever they look at the tab.
  useEffect(() => {
    if (phase !== "waiting" || paid || !uid) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      tries += 1;
      if (tries === 12) setSlow(true);
      void ask();
      timer = setTimeout(tick, tries < 30 ? 6_000 : 30_000);
    };
    timer = setTimeout(tick, 4_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ask, paid, phase, uid]);

  /**
   * Start paying. MUST run inside the tap: the checkout opens in a new tab so
   * this one keeps its place (and Talk's voice), and a browser only allows a
   * new tab from inside a tap — so it is opened empty now and pointed at the
   * checkout once the link arrives. If the tab is refused, this one goes.
   */
  const pay = useCallback(async () => {
    if (!uid || phase === "opening") return;
    setError(null);
    setSlow(false);
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setPhase("opening");
    const result = await startConsultationPayment(tier);
    if (!result.ok) {
      tab?.close();
      setPhase("idle");
      if (!result.paid) setError(result.error);
      return;
    }
    writePending(result.paymentIntentId);
    setIntentId(result.paymentIntentId);
    setWaitingSince(Date.now());
    setPhase("waiting");
    if (tab && !tab.closed) tab.location.href = result.paymentLink;
    else window.location.assign(result.paymentLink);
  }, [phase, tier, uid]);

  /** "I've paid" — ask now rather than waiting for the next tick. */
  const checkNow = useCallback(async () => {
    await ask();
  }, [ask]);

  /**
   * Give up on this payment and offer the button again — but only after
   * asking whether it went through. Abandoning a payment that DID go through
   * is how somebody ends up paying twice.
   */
  const startAgain = useCallback(async () => {
    const result = await ask();
    if (result?.settled || result?.needsReview) return;
    writePending(null);
    setIntentId(null);
    setWaitingSince(null);
    setPhase("idle");
    setSlow(false);
    setError(null);
  }, [ask]);

  /**
   * Right before a conversation: start the paid clock (or pick it up again)
   * and mint a fresh token that carries it. The token the conversation uses
   * is then never older than the claim it needs. False: nothing to begin.
   */
  const prepare = useCallback(async () => {
    if (!user) return false;
    const ok = await claimConsultation();
    if (ok) await user.getIdToken(true).catch(() => null);
    return ok;
  }, [user]);

  return {
    paid,
    entitlement: known ?? null,
    phase,
    error,
    slow,
    intentId,
    waitingSince,
    pay,
    checkNow,
    startAgain,
    prepare,
  };
}
