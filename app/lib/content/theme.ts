/**
 * The public site's colours: the brand tokens staff may change, the checks a
 * new palette has to pass, and the CSS that applies it.
 *
 * Pure and shared, like ../contrast: the theme editor runs these checks as
 * colours are picked, publishContent runs them again before anything goes
 * live, and the root layout builds its style tag with themeCss. One copy, so
 * the editor can never pass a palette the function then refuses.
 */

import { contrastRatio, hexToRgb, isHex, rating, type ContrastRating } from "../contrast";

/** The tokens in app/globals.css that the theme may override, by their CSS names. */
export const THEME_TOKENS = [
  "background",
  "cream",
  "sand",
  "surface",
  "foreground",
  "muted",
  "accent",
  "accent-soft",
  "accent-deep",
  "peach",
  "sage",
  "sage-deep",
  "sage-soft",
  "sage-pale",
  "dark",
  "stage",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColors = Record<ThemeToken, string>;

/**
 * Today's palette, exactly as app/globals.css declares it. scripts/test-content
 * reads globals.css and fails if the two ever drift apart.
 */
export const THEME_DEFAULTS: ThemeColors = {
  background: "#FBF7F1",
  cream: "#F4EADD",
  sand: "#EFE5D8",
  surface: "#FFFDFA",
  foreground: "#3B2C26",
  muted: "#7A6A61",
  accent: "#C8754E",
  "accent-soft": "#D68C68",
  "accent-deep": "#B3613C",
  peach: "#E7A381",
  sage: "#6E8763",
  "sage-deep": "#5B7351",
  "sage-soft": "#A9BC9C",
  "sage-pale": "#DDE5D3",
  dark: "#4A3530",
  stage: "#2E221E",
};

export function isThemeToken(value: string): value is ThemeToken {
  return (THEME_TOKENS as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ contrast

/** A colour by token, or a fixed colour such as the white on the buttons. */
type Ink = ThemeToken | `#${string}`;

/**
 * The pairs a new palette must keep readable. Each is held to the contrast
 * the original palette already has: a change may make a pair clearer, never
 * harder to read than it was on the day the site launched.
 */
export const CONTRAST_GUARDS: { id: string; label: string; text: Ink; on: ThemeToken }[] = [
  { id: "body", label: "Text on the page", text: "foreground", on: "background" },
  // Most of the site's reading happens on the white cards, not the page.
  { id: "cards", label: "Text on the cards", text: "foreground", on: "surface" },
  { id: "quiet", label: "Quieter text on the page", text: "muted", on: "background" },
  { id: "button", label: "White on the terracotta buttons", text: "#FFFFFF", on: "accent" },
  { id: "dark", label: "Cream on dark brown (the footer and dark bands)", text: "cream", on: "dark" },
];

/** WCAG AA for ordinary-sized text. Below it a pair is shown as a warning. */
export const AA_RATIO = 4.5;

export type ThemeCheck = {
  id: string;
  label: string;
  text: string;
  on: string;
  ratio: number;
  /** The original palette's ratio for this pair: the floor a change may not go under. */
  floor: number;
  rating: ContrastRating;
  /** "block" stops a publish; "warn" is shown but allowed. */
  status: "ok" | "warn" | "block";
  /** The token the editor should point at when this pair fails. */
  token: ThemeToken;
};

function ink(colors: ThemeColors, value: Ink): string {
  return isThemeToken(value) ? colors[value] : value;
}

/** Every guarded pair in a palette, worst first. Colours must already be valid hex. */
export function checkTheme(colors: ThemeColors): ThemeCheck[] {
  return CONTRAST_GUARDS.map((guard) => {
    const text = ink(colors, guard.text);
    const on = colors[guard.on];
    const ratio = contrastRatio(text, on);
    const floor = contrastRatio(ink(THEME_DEFAULTS, guard.text), THEME_DEFAULTS[guard.on]);
    // A hair of tolerance, so the original palette always passes its own floor
    // however the floating point falls.
    const status: ThemeCheck["status"] = ratio < floor - 1e-9 ? "block" : ratio < AA_RATIO ? "warn" : "ok";
    // Point at whichever side of the pair was changed from the original.
    const textChanged = isThemeToken(guard.text) && colors[guard.text].toUpperCase() !== THEME_DEFAULTS[guard.text];
    const token = textChanged && isThemeToken(guard.text) ? guard.text : guard.on;
    return { id: guard.id, label: guard.label, text, on, ratio, floor, rating: rating(ratio), status, token };
  }).sort((a, b) => a.ratio / a.floor - b.ratio / b.floor);
}

// ----------------------------------------------------------------------- CSS

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The tokens globals.css writes as rgba() of a brand colour — the border, the
 * shadows, the muted text on dark — rebuilt from the new colour, so a changed
 * brown or terracotta does not leave the old one behind in every shadow.
 * The alphas are the ones globals.css uses.
 */
function derived(token: ThemeToken, hex: string): [string, string][] {
  switch (token) {
    case "dark":
      return [
        ["border", rgba(hex, 0.12)],
        ["shadow-card", `0 12px 32px -20px ${rgba(hex, 0.28)}`],
        ["shadow-raised", `0 18px 40px -22px ${rgba(hex, 0.3)}`],
        ["shadow-floating", `0 30px 80px -30px ${rgba(hex, 0.32)}`],
      ];
    case "accent":
      return [["shadow-accent", `0 12px 26px -14px ${rgba(hex, 0.6)}`]];
    case "cream":
      return [["on-dark-muted", rgba(hex, 0.7)]];
    default:
      return [];
  }
}

/**
 * The style rule that applies a palette, or "" when it is the original one.
 *
 * Only tokens that differ from the original are written, and only six-digit
 * hex values ever reach the output — anything else is skipped, so nothing a
 * stored document says can break out of the rule. The selector is
 * `html:root` by default: one step more specific than the `:root` in
 * globals.css, so it wins whichever stylesheet the browser reads last.
 */
export function themeCss(colors: Partial<Record<string, unknown>>, selector = "html:root"): string {
  const declarations: string[] = [];
  for (const token of THEME_TOKENS) {
    const value = colors[token];
    if (typeof value !== "string" || !isHex(value)) continue;
    if (value.toUpperCase() === THEME_DEFAULTS[token]) continue;
    declarations.push(`--${token}:${value.toUpperCase()}`);
    for (const [name, css] of derived(token, value)) declarations.push(`--${name}:${css}`);
  }
  return declarations.length ? `${selector}{${declarations.join(";")}}` : "";
}

/**
 * Every token of a palette as CSS custom properties, the ones derived from it
 * included — for the theme editor's preview, which sets them on one element
 * so the samples inside it take the new colours and nothing else on the
 * screen does. All of them, defaults too: whatever the live palette is, the
 * preview shows exactly the palette being edited. Invalid values are left
 * out, so the element falls back to the page's own.
 */
export function themeVariables(colors: Partial<Record<string, unknown>>): Record<`--${string}`, string> {
  const vars: Record<`--${string}`, string> = {};
  for (const token of THEME_TOKENS) {
    const value = colors[token];
    if (typeof value !== "string" || !isHex(value)) continue;
    vars[`--${token}`] = value.toUpperCase();
    for (const [name, css] of derived(token, value)) vars[`--${name}`] = css;
  }
  return vars;
}
