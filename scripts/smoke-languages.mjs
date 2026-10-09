/**
 * The language-fidelity regression, against the DEPLOYED companion functions.
 *
 *   node scripts/smoke-languages.mjs
 *
 * Calls them the way the browser does, with a real ID token minted by
 * scripts/lib/functions.mjs. It used to POST to /api/companion/* on a dev
 * server; those routes moved into Cloud Functions and this was the one test
 * left behind — which meant the regression for the exact bug the team reported
 * would 404 rather than fail.
 *
 * The reported bug: speak Fula or Mandinka, get answered in Wolof. The fix is
 * that the language is CHOSEN, not guessed, and never silently changed. This
 * checks all three of those, per language:
 *
 *   1. the opening greeting offers the four languages as choices
 *   2. once chosen, Talk opens in that language — not English, not Wolof
 *   3. she stays in it for a normal turn
 *   4. she stays in it even when the person says something in English
 *
 * Typed turns, so it tests judgement rather than transcription.
 */

import { BASE, authHeader } from "./lib/functions.mjs";

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return events.find((e) => e.type === "turn");
}

/** Does this read as an English sentence? Crude, but it is what went wrong. */
const ENGLISH = /\b(the|and|you|your|what|would|please|hello|welcome|how|are|is|that|with|for|thank)\b/gi;
function englishiness(text) {
  const words = text.trim().split(/[ ]+/).length || 1;
  return ((text.match(ENGLISH) ?? []).length / words) * 100;
}

let failures = 0;
const check = (ok, what) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

console.log("greeting offers the four languages");
{
  const t = await call("/companionGreet", { mode: "intake", intake: {}, displayName: null });
  check(t.awaitingLanguage === true, "waits for the language to be chosen");
  check((t.choices ?? []).length === 4, `four choices offered: ${(t.choices ?? []).map((c) => c.label).join(", ")}`);
  check(/English/.test(t.reply) && /Wolof/.test(t.reply), "names them out loud too");
}

// A short line in each language, plus an English interruption that must NOT
// make her switch.
const CASES = [
  ["wolof", "Maa ngi tudd Awa.", 30],
  ["mandinka", "N too mu Awa le ti.", 30],
  ["pulaar", "Innde am ko Awa.", 30],
  ["english", "My name is Awa.", 101],
];

for (const [language, line, maxEnglish] of CASES) {
  console.log(`\n${language}`);
  const intake = { language };

  const greeting = await call("/companionGreet", { mode: "intake", intake, displayName: null });
  console.log(`   opens: ${greeting.reply}`);
  check(Boolean(greeting.reply), "opens with something");
  check(englishiness(greeting.reply) <= maxEnglish, `the opening is in ${language} (englishiness ${englishiness(greeting.reply).toFixed(0)}%)`);

  const history = [{ role: "talk", text: greeting.reply }];
  const turn = await call("/companionTurn", { text: line, history, summary: "", mode: "intake", intake });
  console.log(`   replies: ${turn.reply}`);
  check(turn.intake?.language === language, `language stays ${language} (got ${turn.intake?.language})`);
  check(englishiness(turn.reply) <= maxEnglish, `reply is in ${language} (englishiness ${englishiness(turn.reply).toFixed(0)}%)`);

  // The old failure mode, inverted: an English sentence mid-conversation must
  // not drag her out of the language they chose.
  history.push({ role: "user", text: line, language }, { role: "talk", text: turn.reply, language });
  const after = await call("/companionTurn", {
    text: "Sorry, can you say that again?",
    history,
    summary: "",
    mode: "intake",
    intake: turn.intake ?? intake,
  });
  console.log(`   after English: ${after.reply}`);
  check(
    englishiness(after.reply) <= maxEnglish,
    `still ${language} after an English sentence (englishiness ${englishiness(after.reply).toFixed(0)}%)`,
  );
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
