import { signOut } from "./auth";

/**
 * Signing out from inside the app lands on the landing page.
 *
 * Without this, the app gate sees nobody signed in on a page that needs an
 * account and sends them to Talk to sign in — so pressing "Sign out" would
 * open the voice screen asking them to sign in again. The gate checks
 * isLeaving() and lets the move to "/" happen instead.
 */

let leaving = false;

export function isLeaving(): boolean {
  return leaving;
}

export async function signOutToHome(router: { replace: (href: string) => void }): Promise<void> {
  leaving = true;
  router.replace("/");
  try {
    await signOut();
  } finally {
    // Long enough for the landing page to take over; short enough that a
    // later visit to an app page while signed out is still sent to sign in.
    setTimeout(() => {
      leaving = false;
    }, 4000);
  }
}
