/**
 * What changed between two versions of a section, in the editor's own words:
 * "Welcome › Heading", "Questions (5 → 6)". For the publish dialog (the draft
 * against what is live) and the history (each change against the one before).
 */

import { SECTIONS, type Field, type Fields, type SectionId } from "@/lib/content/schema";
import { shapeSection } from "@/lib/content/validate";

export type Change = { key: string; label: string };

/** Content is plain data — strings, numbers, booleans, arrays, objects — so this is enough. */
export function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameContent(item, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => sameContent((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function walk(fields: Fields, before: unknown, after: unknown, trail: string[], key: string, out: Change[]) {
  const b = record(before);
  const a = record(after);
  for (const [name, field] of Object.entries(fields) as [string, Field][]) {
    const here = key ? `${key}.${name}` : name;
    const label = [...trail, field.label];
    if (field.kind === "group") {
      walk(field.fields, b[name], a[name], label, here, out);
      continue;
    }
    if (sameContent(b[name], a[name])) continue;
    if (field.kind === "list") {
      const was = Array.isArray(b[name]) ? (b[name] as unknown[]).length : 0;
      const now = Array.isArray(a[name]) ? (a[name] as unknown[]).length : 0;
      const count = was === now ? "" : ` (${was} → ${now})`;
      out.push({ key: here, label: `${label.join(" › ")}${count}` });
    } else {
      out.push({ key: here, label: label.join(" › ") });
    }
  }
}

/**
 * Every field that differs, top to bottom in the editor's order. Either side
 * may be null — the built-in defaults — or stored data of any age: both are
 * shaped to today's fields first, so a field added since reads as a change
 * only if its value really differs.
 */
export function changedFields<S extends SectionId>(id: S, before: unknown, after: unknown): Change[] {
  const out: Change[] = [];
  walk(SECTIONS[id].fields, shapeSection(id, before ?? undefined), shapeSection(id, after ?? undefined), [], "", out);
  return out;
}

/** "Welcome › Heading, Questions and 3 more". */
export function summarise(changes: Change[], max = 3): string {
  if (changes.length === 0) return "No changes";
  const shown = changes.slice(0, max).map((c) => c.label);
  const more = changes.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}
