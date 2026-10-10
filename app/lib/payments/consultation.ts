"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../components/AuthProvider";
import { firebaseConfigured, firebaseFunctions, firestore } from "../firebase";
import { checkPayment } from "../booking";
import { useNow } from "../useNow";
import { COLLECTIONS, entitlementActive, type AiTierId, type Entitlement } from "../models";

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

/** Put the paid consultation back on the account when it did not stick. */
export async function claimConsultation(): Promise<boolean> {
  try {
    const call = httpsCallable<Record<string, never>, { ok: boolean }>(firebaseFunctions(), "claimConsultation");
    const { data } = await call({});
    return Boolean(data?.ok);
  } catch {
    return false;
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
 * payment, and noticing when it settles.
 *
 * `paid` is `null` while it is still being looked up — the page shows neither
 * the payment sheet nor the conversation until it knows which.
 */
export function useConsultation(tier: AiTierId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useNow(15_000);
  const [entitlement, setEntitlement] = useState<{ uid: string; value: Entitlement | null } | null>(null);
  const [intentId, setIntentId] = useState<string | null>(() => (typeof window === "undefined" ? null : readPending()));
  const [phase, setPhase] = useState<PaymentPhase>(() =>
    typeof window !== "undefined" && readPending() ? "waiting" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !firebaseConfigured()) return;
    return watchEntitlement(uid, (value) => setEntitlement({ uid, value }));
  }, [uid]);

  const known = entitlement && entitlement.uid === uid ? entitlement.value : undefined;
  const paid = !uid ? false : known === undefined ? null : entitlementActive(known, now);

  // The payment in flight: held for review is said plainly, not left spinning.
  useEffect(() => {
    if (!intentId || phase !== "waiting" || !firebaseConfigured()) return;
    return watchPayment(intentId, (p) => {
      if (p?.needsReview && !p.fulfilled) setPhase("held");
    });
  }, [intentId, phase]);

  // A lost or slow webhook must not leave somebody who paid looking at a
  // spinner: ask the gateway directly, every few seconds, for a while.
  useEffect(() => {
    if (!intentId || phase !== "waiting" || paid) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries === 12) setSlow(true);
      if (tries > 30) {
        clearInterval(timer);
        return;
      }
      void checkPayment(intentId);
    }, 6_000);
    return () => clearInterval(timer);
  }, [intentId, paid, phase]);

  // Paid. The token the browser holds was minted before the paid claim was
  // set, so the AI functions would still refuse it: mint a fresh one, once.
  useEffect(() => {
    if (!paid || !user || !known) return;
    if (refreshedFor.current === known.paymentIntentId) return;
    refreshedFor.current = known.paymentIntentId;
    writePending(null);
    void user.getIdToken(true).catch(() => {});
  }, [known, paid, user]);

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
    setPhase("waiting");
    if (tab && !tab.closed) tab.location.href = result.paymentLink;
    else window.location.assign(result.paymentLink);
  }, [phase, tier, uid]);

  /** "I've paid" — ask the gateway now rather than waiting for the next tick. */
  const checkNow = useCallback(async () => {
    if (!intentId) return;
    const result = await checkPayment(intentId);
    if (result?.needsReview && !result.fulfilled) setPhase("held");
  }, [intentId]);

  /** Give up on this payment and offer the button again. */
  const reset = useCallback(() => {
    writePending(null);
    setIntentId(null);
    setPhase("idle");
    setSlow(false);
    setError(null);
  }, []);

  return { paid, entitlement: known ?? null, phase, error, slow, intentId, pay, checkNow, reset };
}
