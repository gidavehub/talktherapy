/**
 * Chart colours.
 *
 * Kept apart from the brand tokens on purpose. The brand has one terracotta
 * and one sage; a chart with four series needs four hues that stay apart for
 * somebody with a colour-vision deficiency, which the brand pair cannot do.
 * These were run through the palette validator against the card surface
 * (#FFFDFA): lightness band, chroma floor, adjacent-pair separation under
 * protan/deutan/tritan simulation and for full colour vision all pass.
 *
 * Three rules travel with them:
 *  - Categorical hues are handed out in this order and never cycled. A
 *    seventh series is not a seventh colour, it folds into "Other".
 *  - Slot 4 (the ochre) is under 3:1 against the surface, so any chart that
 *    shows it needs visible labels or the table view. ChartCard always offers
 *    the table, so inside a card that is covered.
 *  - The status tokens (--success, --warning, --danger) mean a state, never a
 *    series, and are never used here.
 */

export const CATEGORICAL = [
  "#C8603A", // terracotta
  "#3A6FB0", // blue
  "#2F8F63", // green
  "#C99012", // ochre: under 3:1 on the surface, needs labels or the table
  "#8E4E8C", // plum
  "#5E7D2A", // olive
] as const;

/** How many series keep their own colour before the rest fold into "Other". */
export const MAX_SERIES = CATEGORICAL.length;

/** Slots whose contrast against the surface is under 3:1. */
export const LOW_CONTRAST_SLOTS: readonly number[] = [3];

/**
 * Magnitude: one hue, light to dark, in the brand sage. Never a rainbow — a
 * reader should be able to say "darker means more" without a key.
 */
export const SEQUENTIAL = [
  "#EEF2E9",
  "#D3DFCB",
  "#AFC4A2",
  "#86A47A",
  "#5E7D55",
  "#3E5A38",
] as const;

/** The quiet warm grey for the folded "Other" series. 3.6:1 on the surface. */
export const OTHER_COLOR = "#958379";

/**
 * Chart furniture. Gridlines and axes sit one step off the surface so the
 * data is the only loud thing; text always uses the text tokens, never a
 * series colour (a light hue is illegible as text).
 */
export const CHART_INK = {
  grid: "var(--border)",
  axis: "rgba(74, 53, 48, 0.24)",
  crosshair: "rgba(74, 53, 48, 0.4)",
  text: "var(--muted)",
  strong: "var(--foreground)",
  surface: "var(--surface)",
  wash: "var(--sand)",
} as const;

/**
 * Small-cell suppression. Any count under this is withheld so that a person
 * cannot be picked out of a small group; charts draw a hatched placeholder
 * labelled "<10" instead of a value.
 */
export const SUPPRESSION_THRESHOLD = 10;
export const SUPPRESSED_LABEL = `<${SUPPRESSION_THRESHOLD}`;

/** The hatch for suppressed marks: 45 degree strokes on the nested surface. */
export const HATCH = {
  ink: "#C2B4A9",
  ground: "var(--surface-2)",
} as const;

/** The same hatch as a CSS background, for HTML swatches in legends. */
export const HATCH_CSS = `repeating-linear-gradient(45deg, ${HATCH.ink} 0 1.5px, var(--surface-2) 1.5px 4.5px)`;

/**
 * The colour for the series at position `index`. Anything past the sixth is
 * "Other" — the caller should already have folded it, but this keeps a stray
 * seventh series grey rather than inventing a hue.
 */
export function seriesColor(index: number): string {
  return index >= 0 && index < MAX_SERIES ? CATEGORICAL[index] : OTHER_COLOR;
}

/** Which of the six sequential steps a value falls in, given its 0..1 position. */
export function sequentialStep(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length));
}

/** The sequential colour for a 0..1 position. */
export function sequentialColor(t: number): string {
  return SEQUENTIAL[sequentialStep(t)];
}
