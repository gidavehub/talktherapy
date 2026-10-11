/**
 * Does Talk's Wolof, Mandinka and Pulaar come out Gambian — English-mixed,
 * with English numbers? Renders everyday sentences, the kind that pull French
 * into Dakar Wolof, and sentences full of numbers, through the same model and
 * rules the live conversation uses, and flags any French word or number.
 *
 *   cd functions && npm run build && cd .. && node scripts/check-gambian-languages.mjs
 *
 * People complained Talk sounded Senegalese, and then that she said numbers
 * in French. Gambians mix ENGLISH into all three languages, never French, and
 * say their numbers in English: "two hundred dalasi", "one-one-seven".
 */
import { renderInLanguage } from "./lib/talk.mjs";

const { englishNumbers } = await import("../functions/lib/functions/src/ai/spokenNumbers.js");

const FRENCH = [
  /\bkontin\w*/i, /\bkonfirm\w*/i, /\bmerci\b/i, /\bparce que\b/i, /\bmaintenant\b/i, /\bvraiment\b/i,
  /\bd'accord\b/i, /\ben tout cas\b/i, /\bportable\b/i, /\bt[ée]l[ée]phone\b/i, /\brendez-vous\b/i,
  /\bcarte\b/i, /\bl?opitaan\b/i, /\bdonc\b/i, /\bmais\b/i, /\bça va\b/i, /\bdoktoor\b/i, /\blekool\b/i,
  /\bnim[ée]ro\b/i,
  // French numbers.
  /\b(deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cents?|mille|heures?)\b/i,
];

const LANGUAGES = ["wolof", "mandinka", "pulaar"];

/** [English, what must be heard in English] */
const SENTENCES = [
  ["The consultation is D200.", [/two hundred/i]],
  ["If you are in danger, call 117 for the police or 116 for an ambulance.", [/one[- ]one[- ]seven/i, /one[- ]one[- ]six/i]],
  ["Your session is at 10:00 tomorrow.", [/\bten\b/i]],
  ["The first conversation lasts 8 minutes.", [/\beight\b/i]],
  ["You have 7 days to start it.", [/\bseven\b/i]],
  ["Please confirm your appointment.", []],
  ["Call me on my phone if you need me.", []],
  ["Let us continue when you are ready.", []],
  ["Okay, thank you for telling me.", []],
  ["Go to the hospital if it gets worse.", []],
  ["You can pay with Wave or your card.", []],
];

let flagged = 0;
let digits = 0;
for (const language of LANGUAGES) {
  console.log(`\n== ${language}`);
  for (const [en, heard] of SENTENCES) {
    const said = await renderInLanguage(language, en);
    const french = FRENCH.filter((re) => re.test(said)).map((re) => said.match(re)[0]);
    const missing = heard.filter((re) => !re.test(said)).map((re) => re.source);
    const bad = french.length || missing.length;
    if (bad) flagged++;
    const notes = [
      french.length ? `French: ${french.join(", ")}` : "",
      missing.length ? `no English number: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    console.log(`${bad ? "FAIL" : "ok  "}  ${en}\n      ${said}${notes.length ? `   <-- ${notes.join("; ")}` : ""}`);
    // Digits are against the rules, but never reach the voice: speak() turns
    // them into English words first. Shown so a drift is visible.
    if (/\d/.test(said)) {
      digits++;
      console.log(`      (digits — the voice hears: ${englishNumbers(said)})`);
    }
  }
}
const total = LANGUAGES.length * SENTENCES.length;
console.log(
  flagged
    ? `\n${flagged} of ${total} replies used French or did not say a number in English.`
    : `\nAll ${total} replies Gambian: English numbers, no French.`,
);
if (digits) console.log(`${digits} kept digits; the voice still says them in English.`);
process.exitCode = flagged ? 1 : 0;
