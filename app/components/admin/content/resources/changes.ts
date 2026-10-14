/**
 * What changed between two versions of an article, in the editor's words —
 * for the publish dialog (the draft against what is live) and the history
 * (each change against the one after it). Either side may be null: nothing
 * on the site.
 */

import { RESOURCE_FIELDS, type ResourceContent } from "@/lib/content/resources";
import { sameContent, type Change } from "../changes";

const LABELS: Record<keyof ResourceContent, string> = {
  title: RESOURCE_FIELDS.title.label,
  slug: RESOURCE_FIELDS.slug.label,
  summary: RESOURCE_FIELDS.summary.label,
  body: RESOURCE_FIELDS.body.label,
  format: RESOURCE_FIELDS.format.label,
  topics: "Topics",
  readingMinutes: "Reading time",
  cover: RESOURCE_FIELDS.cover.label,
};

export function resourceChanges(before: ResourceContent | null, after: ResourceContent | null): Change[] {
  if (!before && !after) return [];
  if (!before) return [{ key: "", label: "Put on the site" }];
  if (!after) return [{ key: "", label: "Taken off the site" }];
  return (Object.keys(LABELS) as (keyof ResourceContent)[])
    .filter((key) => !sameContent(before[key], after[key]))
    .map((key) => ({ key, label: LABELS[key] }));
}
