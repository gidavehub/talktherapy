/**
 * Firestore's REST API writes every value with its type spelled out —
 * {"stringValue": "…"}, {"mapValue": {"fields": {…}}} — and this turns that
 * back into plain JSON. Only what content documents hold is understood;
 * anything else (a reference, a geopoint, bytes) reads as undefined, which
 * the merge then replaces with the field's default.
 *
 * Import-free, so scripts/test-content.mts can run it as it is.
 */

export type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
};

export type RestDocument = {
  name?: string;
  fields?: Record<string, RestValue>;
};

/** Content is not deeply nested; a document that is, is not content. */
const MAX_DEPTH = 24;

export function decodeValue(value: RestValue | undefined, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue ? Date.parse(value.timestampValue) : undefined;
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields, depth + 1);
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map((v) => decodeValue(v, depth + 1));
  return undefined;
}

export function decodeFields(fields: Record<string, RestValue> | undefined, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields || typeof fields !== "object") return out;
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value, depth);
  return out;
}

/** The document id at the end of a REST document name ("projects/…/documents/siteContent/home" → "home"). */
export function documentId(doc: RestDocument): string | null {
  const name = typeof doc.name === "string" ? doc.name : "";
  const id = name.slice(name.lastIndexOf("/") + 1);
  return id || null;
}
