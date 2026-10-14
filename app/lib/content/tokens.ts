/**
 * Placeholders for the numbers in the site's words.
 *
 * Prices and minutes are never typed into the content: staff write
 * {firstPrice} and the page shows what the checkout actually charges, from
 * the same constants the payments use. When a price changes in code, every
 * sentence that mentions it changes with it — nothing in Firestore can go
 * stale and quote a number nobody is charged.
 *
 * Pure and shared: the editor previews with these, publishContent checks that
 * every placeholder is one of these, and the server fills them in.
 */

import { AI_TIERS, HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR } from "../models";
import { PLATFORM_FEE_RATE, formatDalasi } from "../money";

export const TOKENS = {
  firstPrice: {
    label: "Price of a first conversation with TALK",
    value: formatDalasi(AI_TIERS.initial.amountMinor),
  },
  firstMinutes: {
    label: "Minutes in a first conversation",
    value: String(AI_TIERS.initial.durationSec / 60),
  },
  longerPrice: {
    label: "Price of a longer talk with TALK",
    value: formatDalasi(AI_TIERS.extended.amountMinor),
  },
  longerMinutes: {
    label: "Minutes in a longer talk",
    value: String(AI_TIERS.extended.durationSec / 60),
  },
  providerFrom: {
    label: "The lowest fee a provider may set",
    value: formatDalasi(HUMAN_RATE_MIN_MINOR),
  },
  providerTo: {
    label: "The highest fee a provider may set",
    value: formatDalasi(HUMAN_RATE_MAX_MINOR),
  },
  feePercent: {
    label: "TALK's share of a session fee, as a number (write {feePercent}%)",
    value: String(Math.round(PLATFORM_FEE_RATE * 100)),
  },
} as const;

export type TokenName = keyof typeof TOKENS;

/** The placeholders as the editor offers them: what to type, what it means, what it shows today. */
export const TOKEN_LIST: { name: TokenName; placeholder: string; label: string; example: string }[] = (
  Object.keys(TOKENS) as TokenName[]
).map((name) => ({ name, placeholder: `{${name}}`, label: TOKENS[name].label, example: TOKENS[name].value }));

const PLACEHOLDER = /\{([^{}\s]*)\}/g;

export function isTokenName(name: string): name is TokenName {
  return Object.prototype.hasOwnProperty.call(TOKENS, name);
}

/** Every `{name}` in a piece of text, known or not. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** The `{name}`s in a piece of text that are not placeholders TALK knows. */
export function unknownPlaceholders(text: string): string[] {
  return placeholdersIn(text).filter((name) => !isTokenName(name));
}

/** A piece of text with its placeholders filled in. Unknown ones are left as typed. */
export function fillTokens(text: string): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (isTokenName(name) ? TOKENS[name].value : whole));
}

/** How long a piece of text is once filled in — what a visitor reads, and what length limits count. */
export function displayLength(text: string): number {
  return fillTokens(text).length;
}

/**
 * Every string in a section's content, filled in. Links and image addresses
 * are strings too, but a placeholder can never pass their checks, so filling
 * them changes nothing.
 */
export function fillContent<T>(value: T): T {
  if (typeof value === "string") return fillTokens(value) as T;
  if (Array.isArray(value)) return value.map((item) => fillContent(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = fillContent(item);
    return out as T;
  }
  return value;
}
