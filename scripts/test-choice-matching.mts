/**
 * Unit test for answering by voice (app/lib/ai/choiceMatch.ts).
 *
 *   node scripts/test-choice-matching.mts
 *
 * The owner's requirement in one line: "if you say 'Fula', automatically it
 * selects Fula". Many people using Talk cannot read the buttons, so whatever
 * they SAY has to land on the right one — and when what they said is a
 * sentence rather than an answer, nothing is chosen here: the model hears it.
 *
 * The "never" cases below are not hypothetical. Each was found by an
 * adversarial review of an earlier version, run against it, and shown to
 * answer a question on somebody's behalf.
 */

import { fold, matchChoice, mentions } from "../app/lib/ai/choiceMatch.ts";
import { LANGUAGE_ALIASES, LANGUAGE_CHOICES } from "../app/lib/ai/protocol.ts";
import type { Choice } from "../app/lib/ai/protocol.ts";

let failures = 0;
function check(ok: boolean, what: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

const show = (m: ReturnType<typeof matchChoice>) =>
  m.kind === "one" ? `one:${m.choice.id}` : m.kind === "many" ? `many:${m.choices.map((c) => c.id)}` : "none";

function picks(choices: Choice[], said: string, id: string, aliases?: Record<string, string[]>) {
  const m = matchChoice(said, choices, aliases);
  check(m.kind === "one" && m.choice.id === id, `"${said}" → ${id} (got ${show(m)})`);
}
function never(choices: Choice[], said: string, aliases?: Record<string, string[]>) {
  const m = matchChoice(said, choices, aliases);
  check(m.kind !== "one", `"${said}" chooses nothing (got ${show(m)})`);
}

const L = LANGUAGE_CHOICES;
const A = LANGUAGE_ALIASES;

console.log("Saying the language — in English, or in its own name");
for (const [said, id] of [
  ["Fula", "pulaar"],
  ["I speak Fula", "pulaar"],
  ["Fula please", "pulaar"],
  ["I want to speak Fula", "pulaar"],
  ["Fulfulde", "pulaar"],
  ["Peul", "pulaar"],
  ["Pulaar", "pulaar"],
  ["fulani please", "pulaar"],
  ["pulaa", "pulaar"],
  ["Wollof", "wolof"],
  ["Walaf", "wolof"],
  ["Yes, Wolof", "wolof"],
  ["Wolof rekk", "wolof"],
  ["Mandingo", "mandinka"],
  ["mandink", "mandinka"],
  ["Mandinka", "mandinka"],
  ["Angale", "english"],
  ["English", "english"],
  ["English please", "english"],
] as const) {
  picks(L, said, id, A);
}

console.log("\nBy position — and only when that is all it is");
for (const [said, id] of [
  ["the first one", "english"],
  ["number two", "wolof"],
  ["the second", "wolof"],
  ["second one", "wolof"],
  ["3", "mandinka"],
  ["the last one", "pulaar"],
  ["option four", "pulaar"],
] as const) {
  picks(L, said, id, A);
}

console.log("\nA sentence is not an answer — the model hears it instead");
for (const said of [
  "First of all, my name is Fatou",
  "My name is Fatou, my last name is Ceesay",
  "Last week I lost my job",
  "Give me a second, Fula",
  "My first language is Fula",
  "This is my first time",
  "Which one?",
  "No one",
  "Either one",
  "Not the first one",
  "I don't want the second one",
  "My English is not good",
  "I don't want to speak English",
  "I don't really speak English",
  "English no",
  "Mënuma English",
  "Dégguma angale",
  "Ŋ mang Angale moyi",
  "not Wolof, Mandinka",
  "I don't speak English, I speak Fula",
  "Wolof or Mandinka?",
  "I'm not sure",
  "I have two children and a job",
  "careful",
  "",
]) {
  never(L, said, A);
}

console.log("\nThe age question — an adult must never be recorded as under 18");
const ages: Choice[] = [
  { id: "under-18", label: "Under 18" },
  { id: "18-24", label: "18 to 24" },
  { id: "25-34", label: "25 to 34" },
  { id: "35-49", label: "35 to 49" },
  { id: "50-64", label: "50 to 64" },
  { id: "65-plus", label: "65 or over" },
];
picks(ages, "Under 18", "under-18");
picks(ages, "18 to 24", "18-24");
picks(ages, "the second one", "18-24");
for (const said of [
  "I understand",
  "I didn't understand",
  "Okay, understood",
  "Yes I understand",
  "Why do you need my age? I'm under a lot of stress",
  "Which one?",
  "Twenty-one",
  "Thirty two",
  "Twenty-five",
  "Forty six",
  "I'm 18",
]) {
  never(ages, said);
}
const wolofAges: Choice[] = [{ id: "under-18", label: "Ndaw 18" }, ...ages.slice(1)];
never(wolofAges, "I understand");
picks(wolofAges, "under 18", "under-18");

console.log("\nServices, places, gender — label words inside a sentence");
const services: Choice[] = [
  { id: "therapy", label: "Therapy" },
  { id: "psychotherapy", label: "Psychotherapy" },
  { id: "social-work", label: "Social work" },
  { id: "psychosocial-support", label: "Psychosocial support" },
];
picks(services, "Social work", "social-work");
picks(services, "psychotherapy please", "psychotherapy");
for (const said of ["What is psychotherapy?", "I don't know what social work is", "Problems at work", "I am socially anxious"]) {
  never(services, said);
}
const places: Choice[] = [
  { id: "kanifing", label: "Kanifing and Serrekunda" },
  { id: "north-bank", label: "North Bank" },
  { id: "west-coast", label: "West Coast" },
  { id: "banjul", label: "Banjul" },
];
picks(places, "Serrekunda", "kanifing");
picks(places, "North Bank", "north-bank");
picks(places, "west coast region", "west-coast");
for (const said of ["Me and my family move a lot", "Near the bank"]) never(places, said);
const genders: Choice[] = [
  { id: "woman", label: "Woman" },
  { id: "man", label: "Man" },
  { id: "other", label: "Other" },
  { id: "unsaid", label: "Rather not say" },
];
picks(genders, "a man please", "man");
picks(genders, "a woman", "woman");
picks(genders, "Rather not say", "unsaid");
picks(genders, "I'd rather not say", "unsaid");
for (const said of ["many thanks", "I'm not sure", "What did you say?", "Can you say that again", "Not really", "Otherwise I am fine"]) {
  never(genders, said);
}
const pref: Choice[] = [
  { id: "woman", label: "A woman" },
  { id: "man", label: "A man" },
  { id: "any", label: "Either is fine" },
];
for (const said of ["No one in particular", "I don't want any man", "Either one", "Any one", "Whichever one"]) never(pref, said);

console.log("\nProvider names — a name, not a word that starts like one");
const shortlist: Choice[] = [
  { id: "uid-awa", label: "Awa Ceesay" },
  { id: "uid-lamin", label: "Lamin Jallow" },
  { id: "uid-fanta", label: "Fanta Sowe" },
];
picks(shortlist, "Awa", "uid-awa");
picks(shortlist, "I'd like Awa", "uid-awa");
picks(shortlist, "Jallow please", "uid-lamin");
picks(shortlist, "Fanta Sowe", "uid-fanta");
picks([{ id: "uid-abu", label: "Abubacarr Sowe" }, ...shortlist.slice(0, 2)], "Abubacarr", "uid-abu");
for (const said of [
  "That's fantastic",
  "Is there anyone in Lamin?",
  "What does the second one charge?",
  "This is my first time",
  "No one",
]) {
  never(shortlist, said);
}

console.log("\nMentions — the server's narrower question: was the word said at all?");
const named = (said: string) => mentions(said, L, A).map((c) => c.id).sort().join(",");
check(named("I'm Fula but I prefer English") === "english,pulaar", `"I'm Fula but I prefer English" mentions english and pulaar (got ${named("I'm Fula but I prefer English")})`);
check(named("My name is Fatou") === "", `"My name is Fatou" mentions none (got ${named("My name is Fatou")})`);
check(named("careful") === "", `"careful" mentions none`);

console.log("\nHooked letters and accents fold to plain ones");
check(fold("Pulaar (Fula)") === "pulaar fula", `fold("Pulaar (Fula)") = "${fold("Pulaar (Fula)")}"`);
check(fold("ɗemngal") === "demngal", `ɗ folds to d (got "${fold("ɗemngal")}")`);
check(fold("Ŋaanaŋ") === "naanan", `ŋ folds to n (got "${fold("Ŋaanaŋ")}")`);
check(fold("Ñaama") === "naama", `ñ folds to n (got "${fold("Ñaama")}")`);
check(fold("Bëggatuma") === "beggatuma", `ë folds to e (got "${fold("Bëggatuma")}")`);
picks([{ id: "x", label: "Ɗemngal" }, { id: "y", label: "Wolof" }], "demngal", "x");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
