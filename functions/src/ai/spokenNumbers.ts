/**
 * Numbers, said in English — for Talk's Wolof, Mandinka and Pulaar voice.
 *
 * Gambians say numbers in English inside all three: "two hundred dalasi",
 * "call one-one-seven". The voice model does not know that. Handed digits in
 * Wolof — "117", "D200", "10:00" — it reads them the Senegalese way, which is
 * in French ("cent dix-sept"), and people heard it. The rules tell the
 * conversation model to write numbers as English words; this catches every
 * digit it, or a fixed script, or the screen being read aloud, still leaves.
 *
 * Only what is SPOKEN is rewritten. The captions keep their digits.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", " thousand", " million", " billion"];

function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${underThousand(rest)}` : ""}`;
}

/** 1500 → "one thousand five hundred"; 250 → "two hundred and fifty". British, as in The Gambia. */
export function numberWords(n: number): string {
  if (n < 1000) return underThousand(n);
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const group = n % 1000;
    if (group) groups.unshift(underThousand(group) + SCALES[scale]);
  }
  // "one thousand and five", as said, when the last group is under a hundred.
  const last = groups.length > 1 ? groups[groups.length - 1] : "";
  if (last && !/hundred|thousand|million|billion/.test(last)) groups[groups.length - 1] = `and ${last}`;
  return groups.join(" ");
}

/** "117" → "one-one-seven": phone and emergency numbers, one digit at a time. */
export function digitWords(digits: string): string {
  return [...digits].map((d) => ONES[Number(d)]).join("-");
}

const ORDINAL: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth",
};

function ordinalWords(n: number): string {
  const words = numberWords(n);
  return words.replace(/[a-z]+$/, (last) => ORDINAL[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`));
}

function count(text: string): string {
  // A leading zero is a code, not an amount: "07" is "zero-seven".
  if (text.length > 1 && text.startsWith("0")) return digitWords(text);
  return text.length > 12 ? digitWords(text) : numberWords(Number(text));
}

function clock(hour: number, minute: number): string {
  if (hour === 12 && minute === 0) return "twelve noon";
  if (hour === 0 && minute === 0) return "midnight";
  const h = hour % 12 || 12;
  const m = minute === 0 ? " o'clock" : minute < 10 ? ` oh ${ONES[minute]}` : ` ${numberWords(minute)}`;
  const part = hour < 12 ? "" : hour < 17 ? " in the afternoon" : " in the evening";
  return `${numberWords(h)}${m}${part}`;
}

const NOT_DIGIT_BEFORE = String.raw`(?<![\d.,:])`;
const NOT_DIGIT_AFTER = String.raw`(?![\d:]|[.,]\d)`;
const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;

function amount(whole: string, cents: string | undefined): string {
  const dalasi = numberWords(Number(whole.replace(/,/g, "")));
  const bututs = cents ? Number(cents.padEnd(2, "0")) : 0;
  return `${dalasi} dalasi${bututs ? ` and ${numberWords(bututs)} bututs` : ""}`;
}

/**
 * Every number in `text`, as an English speaker in The Gambia says it.
 * Prices in dalasi, clock times, phone and emergency numbers digit by digit,
 * percentages, ordinals, decimals — then any count that is left.
 */
export function englishNumbers(text: string): string {
  return (
    text
      // Ranges of times: "09:00–10:00" → "… to …".
      .replace(/(\d{1,2}:\d{2})\s?[–—-]\s?(\d{1,2}:\d{2})/g, "$1 to $2")
      // Clock times with am/pm: "9am", "9.30 pm".
      .replace(/(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s?([ap])\.?m\.?(?![a-z])/gi, (_, h, m, ap) => {
        const hour = (Number(h) % 12) + (ap.toLowerCase() === "p" ? 12 : 0);
        return clock(hour, Number(m ?? 0));
      })
      // 24-hour clock times: "14:30".
      .replace(/(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g, (_, h, m) => clock(Number(h), Number(m)))
      // Dalasi: "D200", "D 1,500", "GMD 200", "200 GMD".
      .replace(new RegExp(String.raw`\b(?:D|GMD)\s?${AMOUNT}${NOT_DIGIT_AFTER}`, "g"), (_, w, c) => amount(w, c))
      .replace(new RegExp(String.raw`${NOT_DIGIT_BEFORE}${AMOUNT}\s?GMD\b`, "g"), (_, w, c) => amount(w, c))
      // Phone numbers: "+220 390 1234", "3901234".
      .replace(
        new RegExp(String.raw`(\+\d{1,3}[ -]?)?${NOT_DIGIT_BEFORE}(\d{3})[ -]?(\d{4})${NOT_DIGIT_AFTER}`, "g"),
        (_, country: string | undefined, a: string, b: string) =>
          `${country ? `plus ${digitWords(country.replace(/\D/g, ""))}, ` : ""}${digitWords(a)}, ${digitWords(b)}`,
      )
      // Emergency numbers: 112–119, one digit at a time.
      .replace(new RegExp(String.raw`${NOT_DIGIT_BEFORE}(11\d)${NOT_DIGIT_AFTER}`, "g"), (_, n) => digitWords(n))
      .replace(new RegExp(String.raw`${NOT_DIGIT_BEFORE}(\d+(?:\.\d+)?)\s?%`, "g"), (_, n: string) => {
        const [whole, frac] = n.split(".");
        return `${count(whole)}${frac ? ` point ${[...frac].map((d) => ONES[Number(d)]).join(" ")}` : ""} percent`;
      })
      .replace(/(?<![\d.,])(\d+)(?:st|nd|rd|th)\b/gi, (_, n) => ordinalWords(Number(n)))
      .replace(new RegExp(String.raw`${NOT_DIGIT_BEFORE}(\d+)\.(\d+)${NOT_DIGIT_AFTER}`, "g"), (_, w, f: string) =>
        `${count(w)} point ${[...f].map((d) => ONES[Number(d)]).join(" ")}`,
      )
      .replace(/\d{1,3}(?:,\d{3})+(?!\d)/g, (n) => numberWords(Number(n.replace(/,/g, ""))))
      .replace(/\d+/g, count)
  );
}
