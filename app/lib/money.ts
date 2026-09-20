/**
 * Gambian Dalasi formatting.
 *
 * All amounts move through the app as integer minor units (bututs), because
 * floats and money do not mix — D250.10 is not representable in binary and
 * quietly drifts once you start summing platform fees. Convert only at the
 * edges: `formatDalasi` for display, `toMinor` when reading user input.
 *
 * The concept note writes prices as "D250" / "D3,000", so that is the symbol
 * and grouping used here rather than the ISO "GMD 250.00".
 */

export const CURRENCY = "GMD" as const;
export const MINOR_PER_MAJOR = 100;

/** Bututs -> Dalasi, e.g. 25000 -> "D250". */
export function formatDalasi(
  amountMinor: number,
  options: { showDecimals?: boolean } = {},
): string {
  const { showDecimals = false } = options;
  const major = amountMinor / MINOR_PER_MAJOR;
  const hasFraction = amountMinor % MINOR_PER_MAJOR !== 0;

  return `D${major.toLocaleString("en-GB", {
    minimumFractionDigits: showDecimals || hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** "D700 – D3,000" for the human-counsellor range on marketing pages. */
export function formatDalasiRange(minMinor: number, maxMinor: number): string {
  return `${formatDalasi(minMinor)} – ${formatDalasi(maxMinor)}`;
}

/** Dalasi -> bututs. Rounds, so 250.005 does not become 25000.49999. */
export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR);
}

export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/**
 * Platform's share of a consultation fee.
 *
 * Kept as a single named constant so the counsellor-facing earnings screen and
 * the payment split can never disagree about the number.
 */
export const PLATFORM_FEE_RATE = 0.15;

export function platformFeeMinor(amountMinor: number): number {
  return Math.round(amountMinor * PLATFORM_FEE_RATE);
}

export function counsellorPayoutMinor(amountMinor: number): number {
  return amountMinor - platformFeeMinor(amountMinor);
}
