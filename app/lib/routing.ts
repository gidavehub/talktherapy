import type { UserDoc } from "./models";

/**
 * Where a person belongs right now. The one rule behind every "get started"
 * button, the sign-in page and the app gate, so they cannot disagree:
 *
 *   signed out            → create an account
 *   signed in, new        → Talk, who does the onboarding by conversation
 *   signed in, onboarded  → their dashboard
 *
 * Before this existed each button hard-coded /sign-up, so a signed-in person
 * pressing "Book session" was asked to log in again.
 */
export function homeFor(profile: UserDoc | null): string {
  if (!profile) return "/sign-up";
  return profile.onboarded ? "/dashboard" : "/therapy";
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
  if (profile?.onboarded && next && next !== "/sign-in" && next !== "/sign-up") return next;
  return home;
}
