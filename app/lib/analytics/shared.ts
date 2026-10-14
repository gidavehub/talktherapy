/**
 * What the three analytics signals share: whether they are on, and where the
 * functions they talk to live.
 */

/**
 * Only a production build reports. `next dev` runs against the live project
 * (there is no separate one), and a developer's afternoon of clicking would
 * otherwise become the site's busiest day.
 */
export const ANALYTICS_ON = process.env.NODE_ENV === "production";

/** The same base, and the same override, as app/lib/ai/endpoints.ts. */
export const FUNCTIONS_BASE = (
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || "https://us-east4-talk-therapy-509209.cloudfunctions.net"
).replace(/\/+$/, "");

/** A random id: for a tab, or for one conversation. */
export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
