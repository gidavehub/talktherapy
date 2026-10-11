/**
 * Talk RECOMMENDS the kind of help — she never asks somebody to choose it.
 *
 *   cd functions && npm run build && cd .. && node scripts/smoke-recommend.mjs
 *
 * People were asked "what kind of help are you looking for?" and heard
 * therapy, psychotherapy, counselling, psychosocial support, social work —
 * words most of them do not know. Talk is the one who knows. Once they have
 * said what is going on, she says in plain words what kind of person she will
 * find for them, records it, and moves on.
 *
 * Calls the brain in process (see scripts/lib/talk.mjs).
 */

import { turn } from "./lib/talk.mjs";

const { EMPTY_INTAKE } = await import("../functions/lib/app/lib/matching.js");

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

// The labels nobody should have to hear, in any language.
const JARGON = /psycho|counsel|psychosocial|social work|kind of help|type of (help|therapy)/i;
const SERVICE_IDS = ["therapy", "psychotherapy", "mental-health-counselling", "psychosocial-support", "social-work"];

const background = { ageRange: "25-34", location: "kanifing", gender: "woman", consented: true };

const CASES = [
  {
    language: "english",
    say: "My boss shouts at me every day and I can't sleep. I feel stressed all the time.",
  },
  {
    language: "english",
    say: "My husband lost his job, we can't pay the rent and the landlord wants us out.",
  },
  {
    language: "wolof",
    say: "Sama yaay dafa faatu weer wi weesu, te duma mëna nelaw guddi.",
  },
];

for (const c of CASES) {
  console.log(`\n${c.language}: ${c.say}`);
  const t = await turn({
    mode: "intake",
    intake: { ...EMPTY_INTAKE, ...background, language: c.language },
    history: [
      { role: "talk", text: "What has been weighing on you lately?", language: c.language },
    ],
    text: c.say,
  });
  console.log(`  Talk: ${t.reply}`);
  if (t.replyEnglish && t.replyEnglish !== t.reply) console.log(`  (en): ${t.replyEnglish}`);
  console.log(`  recorded: ${JSON.stringify(t.intake?.servicesWanted)} · choices: ${t.choices?.map((x) => x.id).join(", ") || "none"}`);
  check((t.intake?.servicesWanted ?? []).length > 0, "she chose the kind of help herself");
  check(!JARGON.test(t.reply) && !JARGON.test(t.replyEnglish ?? ""), "no clinical labels said, and no asking which kind");
  check(!(t.choices ?? []).some((x) => SERVICE_IDS.includes(x.id)), "no buttons of service names");
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
