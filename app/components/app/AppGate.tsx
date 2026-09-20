"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import AppShell from "../ui/AppShell";
import Orb from "../Orb";
import { PATIENT_NAV } from "../../lib/nav";

/**
 * Gate + chrome for the patient area.
 *
 * Three things have to be true before a screen here renders: auth has settled,
 * someone is signed in, and they have finished onboarding. Each failure routes
 * somewhere specific rather than to a generic bounce, because "you are signed
 * out" and "you have not finished setting up" need different answers.
 *
 * This is a UX layer, not a security boundary — Firebase auth state is
 * client-side, so there is no server redirect to lean on. Enforcement is
 * firestore.rules; a bypassed guard still cannot read anyone's data.
 */
function Splash({ label }: { label: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-[var(--background)] px-6">
      <div className="flex flex-col items-center gap-6">
        <Orb size={110} />
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function AppGate({ children }: { children: React.ReactNode }) {
  const { user, profile, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      // Carry the attempted path so sign-in returns them here afterwards.
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Signed in but no document yet — either the Firestore write is still in
    // flight on a fresh sign-up, or rules refused the read. Onboarding
    // recreates it either way.
    if (!profile) return;

    if (!profile.onboarded) {
      router.replace("/onboarding");
    }
  }, [ready, user, profile, router, pathname]);

  if (!ready) return <Splash label="Checking your session" />;
  if (!user) return <Splash label="Taking you to sign in" />;
  if (!profile) return <Splash label="Loading your profile" />;
  if (!profile.onboarded) return <Splash label="Finishing setup" />;

  return <AppShell nav={PATIENT_NAV}>{children}</AppShell>;
}
