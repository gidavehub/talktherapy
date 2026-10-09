/**
 * Which of the options on screen did somebody just SAY?
 *
 * Many of the people Talk is for cannot read the buttons. The owner's own
 * example is the whole requirement: "if you say 'Fula', automatically it
 * selects Fula". So every multiple-choice question — the language, the age
 * range, where they live, which provider — can be answered by speaking.
 *
 * It acts only when the WHOLE utterance is an answer. "Fula", "Fula please",
 * "I want Wolof", "the second one", "number two" — once the polite words
 * around it are set aside, nothing is left but the option. Anything with a
 * sentence in it ("Why do you need my age? I'm under a lot of stress", "This
 * is my first time", "My English is not good", "I didn't understand") is NOT
 * matched here: it goes to the model, which understands sentences, and whose
 * reply is then heard in full. An earlier version looked for option words
 * anywhere in what was said, and answered questions for people who were
 * asking one — recording an adult as under 18 because they said "I
 * understand". A missed match here costs one model turn. A wrong one answers
 * for somebody, and can set a safeguarding flag that never clears.
 *
 * Pure — no React, no server imports — so the Cloud Functions can use it too,
 * and so scripts/test-choice-matching.mts can test it on its own.
 */

import type { Choice } from "./protocol";

export type ChoiceMatch =
  | { kind: "none" }
  | { kind: "one"; choice: Choice }
  | { kind: "many"; choices: Choice[] };

/**
 * Letters that do NOT come apart under Unicode decomposition.
 *
 * NFD turns "é" into "e" + an accent, which the next step strips. The hooked
 * Pulaar and Mandinka letters are distinct code points with no decomposition
 * at all — ɗ is not d-plus-something — so a fold that relied on NFD alone
 * would fail silently on exactly the labels this feature exists for.
 */
const LETTERS: Record<string, string> = {
  "ɗ": "d",
  "ɓ": "b",
  "ƴ": "y",
  "ŋ": "n",
  "ñ": "n",
  "ɛ": "e",
  "ɔ": "o",
  "’": "",
  "'": "",
};

/** Lower-case, accent-free, hooked letters flattened, punctuation as spaces. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ɗɓƴŋñɛɔ’']/g, (c) => LETTERS[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The words AROUND an answer: "I'd like Fula please", "yes, Wolof", "a man".
 * Set aside before deciding whether what is left is an answer.
 *
 * A few common ones from Wolof, Mandinka and Pulaar too ("waaw", "rekk",
 * "haa", "eey"). Incomplete by nature, and safely so: a word missing from
 * this list leaves the utterance looking like a sentence, which sends it to
 * the model — never to a wrong option.
 */
const FILLER = new Set([
  // English
  "i", "im", "id", "ill", "ive", "me", "my", "am", "a", "an", "the", "to", "in", "is", "it", "its",
  "please", "pls", "ok", "okay", "yes", "yeah", "yep", "um", "uh", "er", "erm", "hmm", "mm", "so",
  "well", "just", "like", "want", "wanna", "would", "prefer", "choose", "pick", "take", "go", "with",
  "speak", "talk", "use", "language", "lets", "let", "us", "thank", "thanks", "you", "for", "can",
  "could", "will", "do", "say", "be", "that", "this", "region", "area", "in", "of",
  // Wolof: yes, only, I (emphatic), want
  "waaw", "rekk", "dama", "begg", "maa",
  // Mandinka: yes, I, want
  "haa", "nte", "lafita",
  // Pulaar: yes, I, want, only
  "eey", "mido", "yidi", "tan",
]);

/**
 * Words that make an utterance a refusal, or a hedge, rather than an answer.
 * If any is present nothing is chosen here — "not Wolof, Mandinka", "I don't
 * speak English", "no one" all go to the model. Wolof and Pulaar mostly
 * negate with a suffix (dégguma, jaɓaani), so those are caught by ending.
 */
const NEGATORS = new Set([
  "no", "not", "nope", "nah", "dont", "doesnt", "didnt", "cant", "cannot", "couldnt", "wont",
  "wouldnt", "isnt", "aint", "never", "neither", "nor", "without", "except", "instead",
  "deedeet", "du", "dul", "duma", "buka", "alaa", "hani", "mang",
]);
const NEGATIVE_ENDING = /(uma|aani)$/;

function negative(token: string): boolean {
  return NEGATORS.has(token) || (token.length >= 5 && NEGATIVE_ENDING.test(token));
}

const ORDINALS: Record<string, number> = {
  first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2,
  fourth: 3, "4th": 3, fifth: 4, "5th": 4, sixth: 5, "6th": 5, last: -1,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 0, two: 1, three: 2, four: 3, five: 4, six: 5,
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5,
};

/** Words that introduce a number as a position: "number two", "option three". */
const POSITION_NOUNS = new Set(["number", "option", "choice", "button"]);

/** Joining words inside a label ("18 to 24", "Kanifing and Serrekunda") — never an answer alone. */
const LABEL_STOP = new Set(["and", "or", "the", "of", "to", "a", "an", "in", "not", "say", "rather", "prefer", "for", "with", "me"]);

/**
 * An answer given by position, and only when that is ALL it is: "second",
 * "the second one", "number two", "option four", "two". A position word
 * inside a sentence — "this is my first time", "first of all, my name is
 * Fatou" — is not one.
 */
function position(rest: string[], count: number): number | null {
  let index: number | null = null;
  if (rest.length === 1 && rest[0] in ORDINALS) index = ORDINALS[rest[0]];
  else if (rest.length === 2 && rest[0] in ORDINALS && (rest[1] === "one" || POSITION_NOUNS.has(rest[1]))) {
    index = ORDINALS[rest[0]];
  } else if (rest.length === 2 && POSITION_NOUNS.has(rest[0]) && rest[1] in NUMBER_WORDS) {
    index = NUMBER_WORDS[rest[1]];
  } else if (rest.length === 1 && rest[0] in NUMBER_WORDS) index = NUMBER_WORDS[rest[0]];
  if (index === null) return null;
  if (index < 0) index = count - 1;
  return index >= 0 && index < count ? index : null;
}

/**
 * The words that can stand for a choice: its label's words, its aliases, and
 * the parts of its id — so "under 18" still answers when the label on screen
 * is in Wolof. Joining words are left out, so "and" or "not" can never be an
 * answer on their own.
 */
function wordsFor(choice: Choice, aliases?: Record<string, string[]>): Set<string> {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const w of fold(text).split(" ")) if (w && !LABEL_STOP.has(w)) words.add(w);
  };
  add(choice.label);
  for (const alias of aliases?.[choice.id] ?? []) add(alias);
  for (const part of choice.id.split(/[-_]/)) add(part);
  return words;
}

/**
 * Is `token` one of `words`? Exactly — or as a truncation of a longer word
 * that leaves at most two letters off ("mandink", "pulaa"). Never the other
 * way round: "fantastic" does not mean Fanta, and "understand" does not mean
 * under.
 */
function heardAs(token: string, words: Set<string>): boolean {
  if (words.has(token)) return true;
  if (token.length < 5) return false;
  for (const w of words) if (w.startsWith(token) && w.length - token.length <= 2) return true;
  return false;
}

function labelsOf(choice: Choice, aliases?: Record<string, string[]>): string[] {
  return [choice.label, ...(aliases?.[choice.id] ?? [])].map(fold).filter(Boolean);
}

/** Is `label` said as one run of words, with nothing but filler around it? */
function saidWhole(tokens: string[], label: string): boolean {
  const words = label.split(" ");
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (!words.every((w, j) => tokens[i + j] === w)) continue;
    const around = [...tokens.slice(0, i), ...tokens.slice(i + words.length)];
    if (around.every((t) => FILLER.has(t))) return true;
  }
  return false;
}

export function matchChoice(
  said: string,
  choices: Choice[],
  aliases?: Record<string, string[]>,
): ChoiceMatch {
  if (!choices.length) return { kind: "none" };
  const tokens = fold(said).split(" ").filter(Boolean);
  if (!tokens.length) return { kind: "none" };
  const rest = tokens.filter((t) => !FILLER.has(t));

  // A label said in full, even one with "not" in it: "Rather not say",
  // "I'd rather not say".
  const exact = choices.filter((c) => labelsOf(c, aliases).some((l) => saidWhole(tokens, l)));
  if (exact.length === 1) return { kind: "one", choice: exact[0] };

  if (!rest.length) return { kind: "none" };
  if (tokens.some(negative)) return { kind: "none" };

  const at = position(rest, choices.length);
  if (at !== null) return { kind: "one", choice: choices[at] };

  // Every word left must belong to the same one option.
  const covering = choices.filter((c) => {
    const words = wordsFor(c, aliases);
    return rest.every((t) => heardAs(t, words));
  });
  if (covering.length === 1) return { kind: "one", choice: covering[0] };
  if (covering.length > 1) return { kind: "many", choices: covering };
  return { kind: "none" };
}

/**
 * Which options are MENTIONED anywhere in what was said — no judgement about
 * whether they were chosen, refused or just talked about.
 *
 * For the server's language check, which asks a narrower question than
 * matchChoice does: when the model records English, did the person say the
 * word English at all? "I'm Fula, but I prefer English" mentions it; "My name
 * is Fatou" does not.
 */
export function mentions(
  said: string,
  choices: Choice[],
  aliases?: Record<string, string[]>,
): Choice[] {
  const tokens = new Set(fold(said).split(" ").filter(Boolean));
  return choices.filter((c) => {
    for (const w of wordsFor(c, aliases)) if (tokens.has(w)) return true;
    return false;
  });
}
