"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import type { AppRole } from "../lib/models";
import Orb from "./Orb";

/**
 * Client-side route guards.
 *
 * These are a *user experience* layer, not a security boundary. Firebase auth
 * state lives in the browser, so `proxy.ts` cannot see it and there is no
 * server-side redirect to lean on — anyone can open devtools and render the
 * markup behind these. The actual enforcement is firestore.rules: a guard that
 * fails open still cannot read another patient's journal.
 *
 * Build accordingly — never put a secret in a component just because a guard
 * wraps it.
 */

function GuardSplash({ label }: { label: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-[var(--background)] px-6">
      <div className="flex flex-col items-center gap-6">
        <Orb size={120} />
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function RequireAuth({
  children,
  redirectTo = "/sign-in",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || user) return;
    // Carry the attempted path so sign-in can send them back rather than
    // dumping everyone on the dashboard.
    const next = encodeURIComponent(pathname);
    router.replace(`${redirectTo}?next=${next}`);
  }, [ready, user, router, pathname, redirectTo]);

  if (!ready) return <GuardSplash label="Checking your session" />;
  if (!user) return <GuardSplash label="Redirecting to sign in" />;

  return <>{children}</>;
}

export function RequireRole({
  children,
  allow,
  /** Counsellor routes that must not be reachable until credentials clear. */
  requireVerified = false,
  fallback = "/dashboard",
}: {
  children: React.ReactNode;
  allow: AppRole[];
  requireVerified?: boolean;
  fallback?: string;
}) {
  const { user, profile, role, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const permitted =
    role !== null &&
    allow.includes(role) &&
    (!requireVerified || Boolean(profile?.verified));

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Signed in but no profile document yet — the Firestore write is still in
    // flight on a fresh sign-up. Wait for it rather than bouncing.
    if (!profile) return;

    if (!permitted) {
      // A counsellor with the right role but pending credentials gets the
      // status page, not a generic bounce, so they know why.
      if (requireVerified && role === "counsellor" && !profile.verified) {
        router.replace("/pro/verification");
        return;
      }
      router.replace(fallback);
    }
  }, [ready, user, profile, role, permitted, requireVerified, router, pathname, fallback]);

  if (!ready) return <GuardSplash label="Checking your session" />;
  if (!permitted) return <GuardSplash label="Redirecting" />;

  return <>{children}</>;
}
