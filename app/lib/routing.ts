import type { UserDoc } from "./models";

/**
 * Where a person belongs right now. The one rule behind every "get started"
 * button, the sign-in page and the app gate, so they cannot disagree:
 *
 *   signed out               → create an account
 *   provider, not yet live   → their profile, which is what makes them live
 *   provider, verified       → their messages
 *   patient, new             → Talk, who does the onboarding by conversation
 *   patient, onboarded       → their dashboard
 *   admin                    → the review queue
 *
 * Before this existed each button hard-coded /sign-up, so a signed-in person
 * pressing "Book session" was asked to log in again.
 */
export function homeFor(profile: UserDoc | null): string {
  if (!profile) return "/sign-up";

  // A provider never does the patient intake — being asked "what brings you
  // here today?" on your first day at work is a bug, not an onboarding. An
  // unverified one is sent to their profile instead, because until it exists
  // and is approved no patient can find them, and an empty inbox explains
  // none of that.
  if (profile.role === "provider") return profile.verified ? "/chats" : "/pro/profile";
  // Staff have no intake either: their work is what is waiting for a person.
  if (profile.role === "admin") return "/admin/review";

  return profile.onboarded ? "/dashboard" : "/therapy";
}

/** Past the setup step: onboarded, or a provider, for whom there isn't one. */
export function isSettled(profile: UserDoc | null): boolean {
  return Boolean(profile && (profile.role === "provider" || profile.role === "admin" || profile.onboarded));
}

/**
 * A `?next=` value, only if it is a same-site path. Anything else — an
 * absolute URL, a protocol-relative "//evil.example" — is an open redirect
 * and is ignored.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

/** After sign-in: honour `next` for people who are set up; new people meet Talk first. */
export function afterSignIn(profile: UserDoc | null, next: string | null): string {
  const home = homeFor(profile);
  if (isSettled(profile) && next && next !== "/sign-in" && next !== "/sign-up") return next;
  return home;
}
