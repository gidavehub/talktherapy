"use client";

import { useCallback, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { isMinor } from "./matching";

/**
 * Somebody under 18 needs a parent or guardian to sign before their first
 * contact with a provider — messaging them, or booking a session.
 *
 * `guard(then)` runs `then` straight away for everyone else. For a minor with
 * no guardian form on file it opens the form instead, and runs `then` once it
 * is signed, so the tap they made is not lost.
 *
 * What this never gates: the conversation with Talk, and help. A child in
 * danger reaches the emergency numbers whether or not the form is done — the
 * form itself carries them, and closing it is always one tap.
 *
 * Callers render `<GuardianConsentModal {...gate.modal} />`.
 */
export function useGuardianGate() {
  const { profile } = useAuth();
  const needed = isMinor(profile?.intake ?? null) && !profile?.consents?.guardianConsent;
  const [pending, setPending] = useState<{ then: (() => void) | null } | null>(null);

  const guard = useCallback(
    (then?: () => void): boolean => {
      if (!needed) {
        then?.();
        return true;
      }
      setPending({ then: then ?? null });
      return false;
    },
    [needed],
  );

  const onClose = useCallback(() => setPending(null), []);
  const onRecorded = useCallback(() => {
    const next = pending?.then;
    setPending(null);
    next?.();
  }, [pending]);

  return {
    /** A minor with no guardian form on file. */
    needed,
    guard,
    /** Open the form with nothing waiting on it. */
    ask: useCallback(() => setPending({ then: null }), []),
    modal: {
      open: pending !== null,
      onClose,
      onRecorded,
      language: profile?.intake?.language ?? null,
    },
  };
}
