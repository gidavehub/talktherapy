/**
 * Does Talk's Wolof come out Gambian? Renders everyday sentences — the kind
 * that pull French loanwords into Dakar Wolof — through the same model and
 * rules the live conversation uses, and flags any French word.
 *
 *   cd functions && npm run build && cd .. && node scripts/check-gambian-wolof.mjs
 *
 * People complained Talk sounded Senegalese. Gambians mix ENGLISH into Wolof,
 * never French.
 */
import { renderInLanguage } from "./lib/talk.mjs";

const FRENCH = [
  /\bkontin\w*/i, /\bkonfirm\w*/i, /\bmerci\b/i, /\bparce que\b/i, /\bmaintenant\b/i, /\bvraiment\b/i,
  /\bd'accord\b/i, /\ben tout cas\b/i, /\bportable\b/i, /\bt[ée]l[ée]phone\b/i, /\brendez-vous\b/i,
  /\bcarte\b/i, /\bl?opitaan\b/i, /\bdonc\b/i, /\bmais\b/i, /\bça va\b/i, /\bdoktoor\b/i, /\blekool\b/i,
];

const SENTENCES = [
  "Please confirm your appointment.",
  "Call me on my phone if you need me.",
  "Let us continue when you are ready.",
  "Okay, thank you for telling me.",
  "Go to the hospital if it gets worse.",
  "You can pay with Wave or your card.",
  "Rest now, because you deserve it.",
  "Your provider will see you at school time tomorrow.",
];

let flagged = 0;
for (const en of SENTENCES) {
  const wo = await renderInLanguage("wolof", en);
  const hits = FRENCH.filter((re) => re.test(wo)).map((re) => wo.match(re)[0]);
  if (hits.length) flagged++;
  console.log(`${hits.length ? "FRENCH" : "ok    "}  ${en}\n        ${wo}${hits.length ? `   <-- ${hits.join(", ")}` : ""}`);
}
console.log(flagged ? `\n${flagged} of ${SENTENCES.length} replies used a French word.` : `\nAll ${SENTENCES.length} replies Gambian: no French words.`);
process.exitCode = flagged ? 1 : 0;
