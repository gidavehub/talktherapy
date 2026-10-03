"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import AppShell from "../ui/AppShell";
import Orb from "../Orb";
import { PATIENT_NAV, PROVIDER_NAV } from "../../lib/nav";

/**
 * Gate + chrome for the signed-in app, both sides of it.
 *
 * Three things have to be true before a screen here renders: auth has settled,
 * someone is signed in, and — for a patient — they have finished onboarding.
 * Each failure routes somewhere specific rather than to a generic bounce,
 * because "you are signed out" and "you have not finished setting up" need
 * different answers.
 *
 * Patients and providers share this gate and this shell, and differ only in
 * which navigation they get. The alternative — a second route group with its
 * own gate — would mean two copies of the chat surface, and the first thing a
 * provider needs is the conversation a patient has already started.
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

    // Signed in but no document yet — the Firestore write is still in flight
    // on a fresh sign-up. Wait for it.
    if (!profile) return;

    // Onboarding is a conversation with Talk; no PATIENT reaches the app until
    // she has learned what they need. A provider has no intake to do — sending
    // them to /therapy would ask a clinician what brings them here today, and
    // then file the answer as their own case notes.
    if (profile.role !== "provider" && !profile.onboarded) {
      router.replace("/therapy");
    }
  }, [ready, user, profile, router, pathname]);

  if (!ready) return <Splash label="Checking your session" />;
  if (!user) return <Splash label="Taking you to sign in" />;
  if (!profile) return <Splash label="Loading your profile" />;

  const isProvider = profile.role === "provider";
  if (!isProvider && !profile.onboarded) return <Splash label="Taking you to Talk" />;

  return (
    <AppShell nav={isProvider ? PROVIDER_NAV : PATIENT_NAV}>{children}</AppShell>
  );
}
