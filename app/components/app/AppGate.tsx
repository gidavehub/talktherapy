"use client";

import { useEffect } from "react";
import { TALK, talkHref } from "../../lib/talkDoorway";
import { isLeaving } from "../../lib/signOutFlow";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import AppShell from "../ui/AppShell";
import LogoLoader from "../ui/LogoLoader";
import { ADMIN_NAV, PATIENT_NAV, PROVIDER_NAV, PROVIDER_PENDING_NAV } from "../../lib/nav";
import { useUnreadCount } from "../../lib/useUnread";

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
      <LogoLoader label={label} />
    </div>
  );
}

/**
 * What somebody can reach before Talk has got to know them. Paying gates the
 * conversation with Talk — never the free tools, and never their own account:
 * somebody who made an account and chose not to pay must still be able to
 * export or delete it.
 */
function openBeforeOnboarding(pathname: string): boolean {
  return ["/settings", "/mood", "/journal"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * What a provider can reach before their application is approved: their own
 * settings, and nothing that assumes they are live — no inbox nobody can
 * write to, no hours nobody can book, no earnings. Everything else is the
 * application, at /apply.
 */
function openBeforeApproval(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export default function AppGate({ children }: { children: React.ReactNode }) {
  const { user, profile, ready } = useAuth();
  const unread = useUnreadCount();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      // Signing out (or deleting the account) leaves for the landing page;
      // do not chase it to the sign-in screen. Said again here rather than
      // just returning: a person who pressed Back straight after signing out
      // would otherwise sit on this splash for good.
      if (isLeaving()) {
        router.replace("/");
        return;
      }
      // To Talk, who signs them in, carrying the attempted path so a person
      // who is already set up comes straight back here afterwards.
      router.replace(talkHref({ signIn: true, next: pathname }));
      return;
    }

    // Signed in but no document yet — the Firestore write is still in flight
    // on a fresh sign-up. Wait for it.
    if (!profile) return;

    // Onboarding is a conversation with Talk; no PATIENT reaches the app until
    // she has learned what they need. A provider has no intake to do — sending
    // them to /talk would ask a clinician what brings them here today, and
    // then file the answer as their own case notes.
    if (profile.role === "patient" && !profile.onboarded && !openBeforeOnboarding(pathname)) {
      router.replace(TALK);
    }

    // A provider not yet approved has one job here, and it is the application.
    if (profile.role === "provider" && !profile.verified && !openBeforeApproval(pathname)) {
      router.replace("/apply");
    }
  }, [ready, user, profile, router, pathname]);

  if (!ready) return <Splash label="Checking your session" />;
  if (!user) return <Splash label="Taking you to sign in" />;
  if (!profile) return <Splash label="Loading your profile" />;

  const isProvider = profile.role === "provider";
  if (profile.role === "patient" && !profile.onboarded && !openBeforeOnboarding(pathname)) {
    return <Splash label="Taking you to TALK" />;
  }
  if (isProvider && !profile.verified && !openBeforeApproval(pathname)) {
    return <Splash label="Opening your application" />;
  }

  // Messages carries the count of what is waiting, on both sides of the app.
  const roleNav = isProvider
    ? profile.verified
      ? PROVIDER_NAV
      : PROVIDER_PENDING_NAV
    : profile.role === "admin"
      ? ADMIN_NAV
      : PATIENT_NAV;
  const nav = roleNav.map((item) =>
    item.href === "/chats" && unread > 0 ? { ...item, badge: unread } : item,
  );

  // Staff pages are tables and charts; they get the wide column.
  const staffPage = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <AppShell nav={nav} wide={staffPage}>
      {children}
    </AppShell>
  );
}
