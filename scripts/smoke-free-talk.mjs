/**
 * Free access to TALK, against the DEPLOYED conversation functions.
 *
 *   node scripts/smoke-free-talk.mjs
 *
 * With the D200 gate on, an account carrying the `talkFree` claim (set by
 * scripts/grant-free-talk.mjs) is let in without having paid anything, and an
 * account without it is still asked to pay (402). Uses the `smoke-tests`
 * sign-in with the claim minted onto its token for this run only — nobody's
 * real account is touched, and nothing is written anywhere.
 */

import { BASE, idTokenFor } from "./lib/functions.mjs";

/** What the gate says to this token: 402 is "pay first"; 400 is past the gate (an empty summary). */
async function gateAnswer(token) {
  const res = await fetch(`${BASE}/companionSummarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ summary: "", turns: [] }),
  });
  return res.status;
}

let failures = 0;
const check = (ok, what) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
};

const unpaid = await gateAnswer(await idTokenFor());
check(unpaid === 402, `an account that has not paid is asked to pay (got ${unpaid})`);
const free = await gateAnswer(await idTokenFor({ talkFree: true }));
check(free !== 402 && free !== 401, `an account with free access is let in without paying (got ${free})`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nFree access works, and everyone else still pays.");
process.exitCode = failures ? 1 : 0;
