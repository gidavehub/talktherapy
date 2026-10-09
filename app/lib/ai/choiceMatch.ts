/**
 * Which of the options on screen did somebody just SAY?
 *
 * Many of the people Talk is for cannot read the buttons. The owner's own
 * example is the whole requirement: "if you say 'Fula', automatically it
 * selects Fula". So every multiple-choice question — the language, the age
 * range, where they live, which provider — can be answered by speaking, and
 * this is the one place that decides what was meant.
 *
 * It is deliberately conservative. It acts only on ONE clear match and never
 * guesses between two: answering the wrong question for somebody is worse
 * than asking again.
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

const ORDINALS: Record<string, number> = {
  first: 0,
  "1st": 0,
  second: 1,
  "2nd": 1,
  third: 2,
  "3rd": 2,
  fourth: 3,
  "4th": 3,
  fifth: 4,
  "5th": 4,
  sixth: 5,
  "6th": 5,
  last: -1,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  five: 4,
  six: 5,
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
};

/** A number only counts as a position when it is introduced as one. */
const POSITION_WORDS = new Set(["number", "option", "choice", "no"]);

/**
 * Words that turn a mention into a refusal: "I don't speak English, I speak
 * Fula" is an answer of Pulaar, not of both.
 *
 * A HEURISTIC, and stated as one. It knows the common English framings and a
 * few short negators from the other languages; a negation it does not know
 * leaves two hits standing, which resolves to "many" — and "many" asks again
 * rather than guessing. So a miss here costs a repeated question, never a
 * wrong answer.
 */
const NEGATORS = new Set([
  "not",
  "no",
  "nope",
  "dont",
  "doesnt",
  "cant",
  "cannot",
  "never",
  "du",
  "dul",
  "buka",
  "alaa",
]);

/**
 * Is the word at `at` being refused rather than chosen?
 *
 * Looks one word back and two — "I don't speak English" puts a verb between
 * the negator and the thing negated — but NEVER across a clause. A comma ends
 * a negation's reach: "No, English please" is an answer of English, and "not
 * Wolof, Mandinka" refuses Wolof and chooses Mandinka. Fold throws punctuation
 * away, which is why the clause of every word is kept alongside it.
 */
function negated(tokens: string[], clauses: number[], at: number): boolean {
  for (const back of [1, 2]) {
    const i = at - back;
    if (i < 0 || clauses[i] !== clauses[at]) break;
    if (NEGATORS.has(tokens[i])) return true;
  }
  return false;
}

/**
 * The words of an utterance, and which clause each belongs to.
 *
 * Clauses end at , ; . ! ? and at "but" — the places a spoken refusal stops
 * applying. Speech transcripts carry this punctuation; typed answers usually
 * do too.
 */
function tokenize(said: string): { tokens: string[]; clauses: number[] } {
  const tokens: string[] = [];
  const clauses: number[] = [];
  said.split(/[,;.!?]|\bbut\b/i).forEach((clause, index) => {
    for (const word of fold(clause).split(" ")) {
      if (!word) continue;
      tokens.push(word);
      clauses.push(index);
    }
  });
  return { tokens, clauses };
}

function ordinalHit(tokens: string[], count: number): number[] {
  const hits = new Set<number>();
  tokens.forEach((token, i) => {
    if (token in ORDINALS) {
      const index = ORDINALS[token];
      hits.add(index < 0 ? count - 1 : index);
      return;
    }
    if (token in NUMBER_WORDS) {
      const introduced = i > 0 && POSITION_WORDS.has(tokens[i - 1]);
      // "two" or "two please" on its own is an answer by position; "I have
      // two children" is not.
      const bare = tokens.length <= 2;
      if (introduced || bare) hits.add(NUMBER_WORDS[token]);
    }
  });
  return [...hits].filter((i) => i >= 0 && i < count);
}

/** The words that can stand for a choice. */
function termsFor(choice: Choice, aliases?: Record<string, string[]>): string[] {
  const label = fold(choice.label);
  const terms = new Set<string>([label, ...(aliases?.[choice.id] ?? []).map(fold)]);
  for (const part of label.split(" ")) if (part.length >= 3) terms.add(part);
  for (const part of choice.id.split(/[-_]/)) {
    const folded = fold(part);
    if (folded.length >= 3) terms.add(folded);
  }
  terms.delete("");
  return [...terms];
}

/**
 * Where in `tokens` a term is heard, or -1.
 *
 *   - several words: a contiguous run of exactly those words;
 *   - one word of 4+ letters: equal, or a shared 4+ letter beginning either
 *     way round, so "mandink", "pulaa" and "fatou" all count;
 *   - one word of under 4 letters: the whole word only — which is what stops
 *     "man" being heard in "many" and "ful" in "careful".
 */
function findTerm(term: string, tokens: string[]): number {
  const words = term.split(" ");
  if (words.length > 1) {
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (words.every((w, j) => tokens[i + j] === w)) return i;
    }
    return -1;
  }
  if (term.length < 4) return tokens.indexOf(term);
  return tokens.findIndex((token) => {
    if (token === term) return true;
    if (token.length < 4) return false;
    return token.startsWith(term) || (term.startsWith(token) && token.length >= 4);
  });
}

export function matchChoice(
  said: string,
  choices: Choice[],
  aliases?: Record<string, string[]>,
): ChoiceMatch {
  if (!choices.length) return { kind: "none" };
  const { tokens, clauses } = tokenize(said);
  if (!tokens.length) return { kind: "none" };

  // By position first. Somebody who understands none of the sentence around
  // the options can still say "the second one" — and for them it is the only
  // way in that does not depend on pronouncing a label.
  const positions = ordinalHit(tokens, choices.length);
  if (positions.length === 1) return { kind: "one", choice: choices[positions[0]] };
  if (positions.length > 1) {
    return { kind: "many", choices: positions.map((i) => choices[i]) };
  }

  // Then by what they named.
  const hit: Choice[] = [];
  for (const choice of choices) {
    const heard = termsFor(choice, aliases).some((term) => {
      const at = findTerm(term, tokens);
      if (at < 0) return false;
      return !negated(tokens, clauses, at);
    });
    if (heard) hit.push(choice);
  }

  if (hit.length === 1) return { kind: "one", choice: hit[0] };
  if (hit.length > 1) return { kind: "many", choices: hit };
  return { kind: "none" };
}
