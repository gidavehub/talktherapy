import type { UserDoc } from "./models";

/**
 * Where a person belongs right now. The one rule behind every "get started"
 * button, the sign-in page and the app gate, so they cannot disagree:
 *
 *   signed out               → Talk, who brings sign-in up herself
 *   provider, not yet live   → their profile, which is what makes them live
 *   provider, verified       → their messages
 *   patient, new             → Talk, who does the onboarding by conversation
 *   patient, onboarded       → their dashboard
 *   admin                    → the staff overview
 *
 * Before this existed each button hard-coded /sign-up, so a signed-in person
 * pressing "Book session" was asked to log in again.
 */
export function homeFor(profile: UserDoc | null): string {
  if (!profile) return "/talk";

  // A provider never does the patient intake — being asked "what brings you
  // here today?" on your first day at work is a bug, not an onboarding. An
  // unverified one is sent to their profile instead, because until it exists
  // and is approved no patient can find them, and an empty inbox explains
  // none of that.
  if (profile.role === "provider") return profile.verified ? "/chats" : "/pro/profile";
  // Staff have no intake either. They land on the overview of the whole
  // service; the review queue is one tap from it.
  if (profile.role === "admin") return "/admin";

  return profile.onboarded ? "/dashboard" : "/talk";
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
  if (!raw || !raw.startsWith("/")) return null;
  // Control characters and backslashes first: a browser strips a tab or a
  // newline when it parses a URL, so "/<TAB>/evil.example" becomes
  // "//evil.example" — another site — after every prefix check has passed.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  // Then resolve it the way the browser will, and keep it only if it stays
  // on this site.
  try {
    const base = "https://talk.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** After sign-in: honour `next` for people who are set up; new people meet Talk first. */
export function afterSignIn(profile: UserDoc | null, next: string | null): string {
  const home = homeFor(profile);
  if (isSettled(profile) && next && !/^\/(sign-in|sign-up|talk)(\?|$)/.test(next)) return next;
  return home;
}
