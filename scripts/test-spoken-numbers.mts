/**
 * Unit test for numbers in Talk's Wolof, Mandinka and Pulaar voice
 * (functions/src/ai/spokenNumbers.ts).
 *
 *   node scripts/test-spoken-numbers.mts
 *
 * Handed digits, the voice read them in French ("cent dix-sept"). Everything
 * she says in those three languages passes through englishNumbers first, so
 * no digit is left for it to read.
 */

import { englishNumbers, numberWords } from "../functions/src/ai/spokenNumbers.ts";

let failures = 0;
function check(input: string, expected: string) {
  const got = englishNumbers(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${input}${ok ? "" : `\n        got      ${got}\n        expected ${expected}`}`);
}

// Emergency numbers, as the crisis lines say them.
check("woo 117 ngir police, walla 116 ngir ambulance", "woo one-one-seven ngir police, walla one-one-six ngir ambulance");
check("call 118.", "call one-one-eight.");
// Prices.
check("consultation bi D200 la", "consultation bi two hundred dalasi la");
check("D 1,500 a session", "one thousand five hundred dalasi a session");
check("D2,500.50", "two thousand five hundred dalasi and fifty bututs");
check("500 GMD", "five hundred dalasi");
check("200 dalasi", "two hundred dalasi");
// Times, as the booking screens show them.
check("Times free: 09:00, 10:30, 14:00", "Times free: nine o'clock, ten thirty, two o'clock in the afternoon");
check("09:00–10:00", "nine o'clock to ten o'clock");
check("at 9am or 6.30 pm", "at nine o'clock or six thirty in the evening");
check("12:00", "twelve noon");
check("08:05", "eight oh five");
// Phone numbers, one digit at a time.
check("+220 390 1234", "plus two-two-zero, three-nine-zero, one-two-three-four");
check("3901234", "three-nine-zero, one-two-three-four");
// Counts, ages, minutes, years.
check("8 minutes", "eight minutes");
check("under 18", "under eighteen");
check("25 years", "twenty-five years");
check("2026", "two thousand and twenty-six");
check("1005", "one thousand and five");
check("the 3rd and 21st", "the third and twenty-first");
check("50%", "fifty percent");
check("1.5 hours", "one point five hours");
check("code 07", "code zero-seven");
// Nothing to change.
check("Jërëjëf. Léegi, nanu tàmbli.", "Jërëjëf. Léegi, nanu tàmbli.");
check("Am na fi lu am solo", "Am na fi lu am solo");

// numberWords on its own.
for (const [n, words] of [
  [0, "zero"], [13, "thirteen"], [40, "forty"], [99, "ninety-nine"], [100, "one hundred"],
  [250, "two hundred and fifty"], [1000, "one thousand"], [1_000_000, "one million"],
] as const) {
  const ok = numberWords(n) === words;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  numberWords(${n}) = ${numberWords(n)}`);
}

console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exitCode = failures ? 1 : 0;
