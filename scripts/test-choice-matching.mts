/**
 * Unit test for answering by voice (app/lib/ai/choiceMatch.ts).
 *
 *   node scripts/test-choice-matching.mts
 *
 * The owner's requirement in one line: "if you say 'Fula', automatically it
 * selects Fula". Many people using Talk cannot read the buttons, so whatever
 * they SAY has to land on the right one — and when it is unclear, nothing
 * should be chosen for them.
 */

import { fold, matchChoice } from "../app/lib/ai/choiceMatch.ts";
import { LANGUAGE_ALIASES, LANGUAGE_CHOICES } from "../app/lib/ai/protocol.ts";
import type { Choice } from "../app/lib/ai/protocol.ts";

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

const lang = (said: string) => matchChoice(said, LANGUAGE_CHOICES, LANGUAGE_ALIASES);
const picks = (said: string, id: string) => {
  const m = lang(said);
  return m.kind === "one" && m.choice.id === id;
};

console.log("Saying the language — in English, or in its own name");
for (const [said, id] of [
  ["Fula", "pulaar"],
  ["I speak Fula", "pulaar"],
  ["Fulfulde", "pulaar"],
  ["Peul", "pulaar"],
  ["Pulaar", "pulaar"],
  ["fulani please", "pulaar"],
  ["Wollof", "wolof"],
  ["Walaf", "wolof"],
  ["Wolof", "wolof"],
  ["Mandingo", "mandinka"],
  ["mandink", "mandinka"],
  ["Mandinka", "mandinka"],
  ["Angale", "english"],
  ["English", "english"],
] as const) {
  check(picks(said, id), `"${said}" → ${id} (got ${JSON.stringify(lang(said))})`);
}

console.log("\nBy position — for somebody who cannot pronounce the label");
for (const [said, id] of [
  ["the first one", "english"],
  ["number two", "wolof"],
  ["the second", "wolof"],
  ["3", "mandinka"],
  ["the last one", "pulaar"],
  ["option four", "pulaar"],
] as const) {
  check(picks(said, id), `"${said}" → ${id} (got ${JSON.stringify(lang(said))})`);
}

console.log("\nRefusing one language to choose another");
check(picks("I don't speak English, I speak Fula", "pulaar"), `"I don't speak English, I speak Fula" → pulaar (got ${JSON.stringify(lang("I don't speak English, I speak Fula"))})`);
check(picks("not Wolof, Mandinka", "mandinka"), `"not Wolof, Mandinka" → mandinka`);
check(picks("No, English please", "english"), `"No, English please" → english — a bare "no" beside it is not a refusal`);

console.log("\nNever guess between two");
check(lang("Wolof or Mandinka?").kind === "many", `"Wolof or Mandinka?" → many`);
check(lang("I'm not sure").kind === "none", `"I'm not sure" → none`);
check(lang("").kind === "none", `"" → none`);
check(lang("I have two children and a job").kind === "none", `a number inside a sentence is not a position`);

console.log("\nShort words only as whole words");
const gender: Choice[] = [
  { id: "woman", label: "Woman" },
  { id: "man", label: "Man" },
  { id: "any", label: "Any" },
];
check(matchChoice("many thanks", gender).kind === "none", `"many thanks" does not choose Man`);
check(matchChoice("careful", LANGUAGE_CHOICES, LANGUAGE_ALIASES).kind === "none", `"careful" does not choose Fula`);
const m = matchChoice("a man please", gender);
check(m.kind === "one" && m.choice.id === "man", `"a man please" → man`);
const w = matchChoice("a woman", gender);
check(w.kind === "one" && w.choice.id === "woman", `"a woman" → woman, not man as well`);

console.log("\nHooked letters and accents fold to plain ones");
check(fold("Pulaar (Fula)") === "pulaar fula", `fold("Pulaar (Fula)") = "${fold("Pulaar (Fula)")}"`);
check(fold("ɗemngal") === "demngal", `ɗ folds to d (got "${fold("ɗemngal")}")`);
check(fold("Ŋaanaŋ") === "naanan", `ŋ folds to n (got "${fold("Ŋaanaŋ")}")`);
check(fold("Ñaama") === "naama", `ñ folds to n (got "${fold("Ñaama")}")`);
check(fold("Bëggatuma") === "beggatuma", `ë folds to e (got "${fold("Bëggatuma")}")`);
const hooked: Choice[] = [{ id: "x", label: "Ɗemngal" }, { id: "y", label: "Wolof" }];
const h = matchChoice("demngal", hooked);
check(h.kind === "one" && h.choice.id === "x", `a hooked-letter label is matched by its plain spelling`);

console.log("\nIds as terms — age ranges and places");
const ages: Choice[] = [
  { id: "under-18", label: "Under 18" },
  { id: "18-24", label: "18 to 24" },
  { id: "25-34", label: "25 to 34" },
];
const u = matchChoice("I am under eighteen", ages);
check(u.kind === "one" && u.choice.id === "under-18", `"I am under eighteen" → under-18 (got ${JSON.stringify(u)})`);
const places: Choice[] = [
  { id: "west-coast", label: "West Coast" },
  { id: "banjul", label: "Banjul" },
];
const pl = matchChoice("west coast region", places);
check(pl.kind === "one" && pl.choice.id === "west-coast", `"west coast region" → west-coast`);

console.log("\nProvider names — first name or surname");
const shortlist: Choice[] = [
  { id: "uid-awa", label: "Awa Ceesay" },
  { id: "uid-lamin", label: "Lamin Jallow" },
];
// "but" ends a clause only as a whole word. A Gambian name like Abubacarr
// contains it, and splitting the name in two would lose it.
const abu = matchChoice("Abubacarr", [{ id: "uid-abu", label: "Abubacarr Sowe" }, ...shortlist]);
check(abu.kind === "one" && abu.choice.id === "uid-abu", `"Abubacarr" stays one name (got ${JSON.stringify(abu)})`);
check(
  picks("not English but Wolof", "wolof"),
  `"not English but Wolof" → wolof — "but" ends the refusal`,
);

const a = matchChoice("I'd like Awa", shortlist);
check(a.kind === "one" && a.choice.id === "uid-awa", `"I'd like Awa" → Awa Ceesay`);
const j = matchChoice("Jallow please", shortlist);
check(j.kind === "one" && j.choice.id === "uid-lamin", `"Jallow please" → Lamin Jallow`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
