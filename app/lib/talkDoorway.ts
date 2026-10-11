import { voice } from "./audio/lines";

/**
 * The way in is Talk.
 *
 * Every call to action — Begin with Talk, Get started, Sign in, Create your
 * account — leads to her screen, where she speaks, brings sign-in up as she
 * asks for it, then the price, then the conversation. Signing in for the
 * first time IS the onboarding; there is no plain form in front of it.
 *
 * A browser only lets a page make a sound that starts inside a tap. So the
 * tap that leads to Talk starts her speaking (`beginDoorway`), inside the
 * click, and she carries on across the move to /talk (lib/audio/lines keeps
 * her voice going). A plain link would arrive silent at "Tap to begin".
 *
 * The one exception is a provider applying to join: Talk's sign-in creates
 * patient accounts, and an account's role is fixed when it is made, so that
 * stays on /sign-up?role=provider.
 */

export const TALK = "/talk";

/**
 * Talk's screen. `signIn` opens it ready to sign in rather than to create an
 * account (somebody returning); `next` is where a person who is already set
 * up goes once they have.
 */
export function talkHref(options: { signIn?: boolean; next?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (options.signIn) q.set("signin", "1");
  if (options.next) q.set("next", options.next);
  const s = q.toString();
  return s ? `${TALK}?${s}` : TALK;
}

/** Whether an href is Talk's screen, with or without its parameters. */
export function isTalk(href: string): boolean {
  return href === TALK || href.startsWith(`${TALK}?`);
}

/**
 * Call SYNCHRONOUSLY inside the tap that leads to Talk. Signed out, she says
 * the way in ("Welcome… please sign in… you can use your email, or Google");
 * signed in but new, she says welcome and the screen carries on from there.
 */
export function beginDoorway(signedIn: boolean): void {
  if (typeof window === "undefined") return;
  voice.unlock();
  voice.say(signedIn ? ["welcome"] : ["welcome", "sign-in", "how"]);
}
