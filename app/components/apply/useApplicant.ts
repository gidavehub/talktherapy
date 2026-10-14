"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { watchApplication } from "@/lib/providerApplication-client";
import type { ProviderApplication } from "@/lib/providerApplication";
import type { AppRole } from "@/lib/models";

/**
 * Who is looking at the application screens, and where their application
 * stands. Every /apply page starts from this, so they agree on what to show.
 */
export type Applicant =
  | { kind: "loading" }
  | { kind: "signed-out" }
  /** Signed in with an account that is not a provider's. */
  | { kind: "wrong-role"; role: AppRole }
  /** A provider who is already approved and live. */
  | { kind: "approved"; uid: string }
  /** A provider account with no application yet. */
  | { kind: "none"; uid: string; name: string | null }
  | { kind: "ready"; uid: string; name: string | null; app: ProviderApplication }
  | { kind: "error"; message: string };

type Snapshot = { uid: string; app: ProviderApplication | null } | { uid: string; error: string };

export function useApplicant(): Applicant {
  const { user, profile, ready } = useAuth();
  const uid = user?.uid ?? null;
  const isProvider = profile?.role === "provider";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!uid || !isProvider) return;
    return watchApplication(
      uid,
      (app) => setSnapshot({ uid, app }),
      () => setSnapshot({ uid, error: "Your application could not be loaded. Check your connection and reload." }),
    );
  }, [uid, isProvider]);

  if (!ready) return { kind: "loading" };
  if (!user) return { kind: "signed-out" };
  // Signed in, but the account document is still on its way (a fresh sign-up).
  if (!profile) return { kind: "loading" };
  if (profile.role !== "provider") return { kind: "wrong-role", role: profile.role };
  if (profile.verified) return { kind: "approved", uid: user.uid };

  // A snapshot from a previous account in this tab is not this one's.
  if (!snapshot || snapshot.uid !== user.uid) return { kind: "loading" };
  if ("error" in snapshot) return { kind: "error", message: snapshot.error };
  const name = profile.displayName ?? user.displayName ?? null;
  return snapshot.app ? { kind: "ready", uid: user.uid, name, app: snapshot.app } : { kind: "none", uid: user.uid, name };
}
