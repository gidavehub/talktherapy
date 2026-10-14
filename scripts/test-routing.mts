/**
 * Unit test for where people are sent (app/lib/routing.ts).
 *
 *   node scripts/test-routing.mts
 *
 * safeNext guards every "sign in, then go back to where you were": a value
 * that leaves the site is an open redirect — a link that signs someone in on
 * Talk and drops them on a look-alike page asking for their password. The
 * tab and backslash cases below got past an earlier version; a browser strips
 * a tab when it parses a URL, so "/<TAB>/evil.example" becomes another site.
 */

import { afterSignIn, homeFor, safeNext } from "../app/lib/routing.ts";
import type { UserDoc } from "../app/lib/models.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

// --- safeNext ----------------------------------------------------------------
const kept: [string, string][] = [
  ["/dashboard", "/dashboard"],
  ["/chats/abc?x=1#m", "/chats/abc?x=1#m"],
  ["/providers/u1", "/providers/u1"],
  ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
];
for (const [input, want] of kept) {
  const got = safeNext(input);
  check(`keeps ${JSON.stringify(input)}`, got === want, `got ${JSON.stringify(got)}`);
}
const dropped = [
  "//evil.example",
  "/\\evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/\t\\evil.example",
  "https://evil.example",
  "javascript:alert(1)",
  "evil.example",
  "",
];
for (const input of dropped) {
  const got = safeNext(input);
  check(`drops ${JSON.stringify(input)}`, got === null, `got ${JSON.stringify(got)}`);
}
check("drops nothing given", safeNext(null) === null && safeNext(undefined) === null);

// --- afterSignIn / homeFor --------------------------------------------------
const patient = (onboarded: boolean) => ({ role: "patient", onboarded }) as unknown as UserDoc;
const provider = (verified: boolean) => ({ role: "provider", verified }) as unknown as UserDoc;
const admin = { role: "admin", onboarded: false } as unknown as UserDoc;

check("signed out: home is Talk", homeFor(null) === "/talk");
check("a new patient's home is Talk", homeFor(patient(false)) === "/talk");
check("an onboarded patient's home is the dashboard", homeFor(patient(true)) === "/dashboard");
check("a verified provider's home is messages", homeFor(provider(true)) === "/chats");
check("a provider not yet approved goes to their application", homeFor(provider(false)) === "/apply");
check("a provider not yet approved signing up lands on the application", afterSignIn(provider(false), null) === "/apply");
check("staff's home is the overview", homeFor(admin) === "/admin");

check("someone set up goes where they were heading", afterSignIn(patient(true), "/settings") === "/settings");
check("a provider goes where they were heading", afterSignIn(provider(true), "/chats/abc") === "/chats/abc");
check("staff go where they were heading", afterSignIn(admin, "/admin/users") === "/admin/users");
check("someone new meets Talk first, whatever next says", afterSignIn(patient(false), "/settings") === "/talk");
for (const loop of ["/talk", "/talk?signin=1", "/sign-in", "/sign-in?next=/x", "/sign-up"]) {
  check(`never sent back to ${loop} (no loop)`, afterSignIn(patient(true), loop) === "/dashboard");
}

console.log(failures === 0 ? "\nAll routing checks passed." : `\n${failures} routing check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
