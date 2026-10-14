/**
 * Colour contrast, by the WCAG 2.x formula.
 *
 * Pure and import-free on purpose: the colour picker reads it in the browser,
 * and Cloud Functions import the same file to refuse a theme whose text would
 * be unreadable, so the two can never disagree about what passes.
 *
 * Colours are six-digit hex strings ("#C8754E"). Short forms, names and alpha
 * are not accepted — a translucent colour has no single contrast ratio until
 * you know what is underneath it.
 */

export type Rgb = { r: number; g: number; b: number };

export type ContrastRating = "AAA" | "AA" | "AA large" | "fail";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** True for a six-digit hex colour with its hash, in either case. */
export function isHex(value: string): boolean {
  return HEX.test(value);
}

/**
 * The 0–255 channels of a hex colour. Throws on anything `isHex` rejects, so
 * a typo surfaces where it was made rather than as a ratio of NaN later on.
 */
export function hexToRgb(hex: string): Rgb {
  if (!isHex(hex)) throw new RangeError(`Not a six-digit hex colour: ${hex}`);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** One sRGB channel (0–255) back to linear light (0–1). */
function linear(channel: number): number {
  const c = channel / 255;
  // 0.04045 is the sRGB standard's own threshold. WCAG 2.0 printed 0.03928,
  // a copying slip it has since corrected; no 8-bit value falls between the
  // two, so the answer is the same either way.
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** How bright a colour looks, from 0 (black) to 1 (white). */
export function relativeLuminance(colour: string | Rgb): number {
  const { r, g, b } = typeof colour === "string" ? hexToRgb(colour) : colour;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The contrast ratio between two colours, from 1 (identical) to 21 (black on
 * white). Order does not matter: the lighter one always goes on top.
 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The WCAG level a ratio reaches for text. Not rounded first: WCAG is explicit
 * that 4.49:1 fails AA, however close it looks.
 *
 * "AA large" passes only for large text — 24px, or 18.5px bold — and for
 * icons and borders, which need 3:1.
 */
export function rating(ratio: number): ContrastRating {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "fail";
}

/**
 * A ratio as people write it, "4.62:1". Truncated, never rounded up, so a
 * failing 4.497 cannot be shown as a passing-looking 4.50.
 */
export function formatRatio(ratio: number): string {
  // The tiny nudge undoes binary floating point: 1.15 × 100 comes out as
  // 114.999…, which plain truncation would show as 1.14.
  let shown = Math.floor(ratio * 100 + 1e-9) / 100;
  // And the nudge must never carry a ratio over a line it does not reach.
  if (rating(shown) !== rating(ratio)) shown -= 0.01;
  return `${shown.toFixed(2)}:1`;
}
