/**
 * Whether content may go on the public site, and what the site shows when a
 * stored value is not fit to.
 *
 *   validateSection   strict: every problem, by field, for the editor and for
 *                     publishContent, which refuses anything with an error.
 *   mergeSection      forgiving: published content laid over the defaults,
 *                     field by field — an unusable field shows its default,
 *                     never an error page. What the server reader uses.
 *   shapeSection      loose: a draft in the right shape for the editor, keeping
 *                     half-finished words so they can be finished.
 *
 * Pure and shared: the same rules in the browser, the function and the server.
 */

import { isHex } from "../contrast";
import { checkHref } from "./links";
import { parseRichText } from "./markdown";
import {
  BUILT_IN_IMAGES,
  SECTIONS,
  defaultContent,
  fieldDefault,
  mediaIdFromUrl,
  mediaPathFromUrl,
  type ContentOf,
  type Field,
  type Fields,
  type SectionId,
  type ValueOf,
} from "./schema";
import { checkTheme, type ThemeColors } from "./theme";
import { TOKEN_LIST, displayLength, unknownPlaceholders } from "./tokens";

/** Where a value sits in a section: ["faq", "items", 2, "a"]. */
export type Path = (string | number)[];

export type Issue = {
  path: Path;
  /** The path as one string, "faq.items.2.a" — for matching an issue to its control. */
  key: string;
  message: string;
};

export type Validation<T> = {
  ok: boolean;
  /** The content as it would be published: trimmed, unknown keys gone, colours in capitals. */
  value: T;
  errors: Issue[];
  /** Allowed, but worth a second look — a colour pair below WCAG AA. */
  warnings: Issue[];
};

export function pathKey(path: Path): string {
  return path.join(".");
}

function issue(path: Path, message: string): Issue {
  return { path, key: pathKey(path), message };
}

// ---------------------------------------------------------------- the words

const PLACEHOLDERS = TOKEN_LIST.map((t) => t.placeholder).join(", ");
// Everything below a space except tab and newline, and DEL: invisible
// characters that come along when text is pasted from another program.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_TAG = /<\/?[a-z][^>]*>/i;
/** D200, D 3,000, GMD 500, 500 dalasi — an amount written in by hand. */
const PRICE = [/(?<![\p{L}\p{N}])D ?\d/u, /\bGMD ?\d/i, /\d[\d,.]* ?(?:dalasis?|GMD)\b/i];
/** 117 police, 116 ambulance, 118 fire. */
const EMERGENCY = /(?<!\d)11[678](?!\d)/;

/**
 * Why a piece of the site's words cannot be published, or null. The same
 * rules for every kind of text: no hand-written prices (they go stale), no
 * emergency numbers (they live in code), the brand written as TALK.
 */
export function checkCopy(text: string): string | null {
  if (CONTROL.test(text)) return "Remove the hidden characters — they came along when this was pasted.";
  if (HTML_TAG.test(text)) return "HTML is not used here. Write plain words.";
  if (PRICE.some((re) => re.test(text))) {
    return `Write prices as placeholders such as {firstPrice}, never as an amount, so the page always shows what TALK charges. The placeholders are ${PLACEHOLDERS}.`;
  }
  const unknown = unknownPlaceholders(text);
  if (unknown.length) return `{${unknown[0]}} is not a placeholder TALK knows. Use one of ${PLACEHOLDERS}.`;
  if (EMERGENCY.test(text)) {
    return "Emergency numbers are set in code, not here, so they are never out of date. Link to /crisis instead.";
  }
  if (/\btalk\s+therapy\b/i.test(text)) return "Write the name as TALK.";
  if (/\bfrench\b/i.test(text)) return "TALK speaks English, Wolof, Mandinka and Pulaar.";
  return null;
}

/** Why a string does not fit a length limit, counted as a visitor reads it (placeholders filled in). */
function checkLength(value: string, max: number): string | null {
  const shown = displayLength(value);
  if (shown > max) return `Keep this to ${max} characters. It is ${shown}.`;
  // Placeholders are longer than what they show, but not without end.
  if (value.length > max * 2 + 40) return `Keep this to ${max} characters.`;
  return null;
}

function checkImageSrc(src: string): string | null {
  if ((BUILT_IN_IMAGES as readonly string[]).includes(src)) return null;
  if (mediaPathFromUrl(src)) return null;
  return "Choose a picture from the library.";
}

// ------------------------------------------------------------------ walking

type Mode = "strict" | "merge" | "shape";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One line: no line breaks, no spaces at the ends. */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

/**
 * Why a scalar value cannot be used, or null — and the value as it would be
 * stored. Groups and lists are walked by `walk`.
 */
function checkScalar(field: Field, value: unknown): { problem: string | null; clean: unknown } {
  switch (field.kind) {
    case "text":
    case "longText": {
      if (typeof value !== "string") return { problem: "This should be words.", clean: field.default };
      const clean = oneLine(value);
      if (field.required && !clean) return { problem: "Write something here.", clean };
      return { problem: checkLength(clean, field.max) ?? (clean ? checkCopy(clean) : null), clean };
    }
    case "richText": {
      if (typeof value !== "string") return { problem: "This should be words.", clean: field.default };
      const clean = value.replace(/\r\n?/g, "\n").trim();
      if (field.required && !clean) return { problem: "Write something here.", clean };
      const problem =
        checkLength(clean, field.max) ??
        (clean ? checkCopy(clean) : null) ??
        parseRichText(clean, { headings: field.headings }).problems[0] ??
        null;
      return { problem, clean };
    }
    case "image": {
      if (!isRecord(value) || typeof value.src !== "string" || typeof value.alt !== "string") {
        return { problem: "Choose a picture.", clean: { ...field.default } };
      }
      const clean = { src: value.src.trim(), alt: oneLine(value.alt) };
      const problem =
        checkImageSrc(clean.src) ??
        (!field.decorative && !clean.alt ? "Describe the picture for people who cannot see it." : null) ??
        (clean.alt ? (checkLength(clean.alt, 200) ?? checkCopy(clean.alt)) : null);
      return { problem, clean };
    }
    case "link": {
      if (!isRecord(value) || typeof value.label !== "string" || typeof value.href !== "string") {
        return { problem: "Add the link's words and where it goes.", clean: { ...field.default } };
      }
      const clean = { label: oneLine(value.label), href: value.href.trim() };
      const problem =
        (!clean.label ? "Write the words on the button." : null) ??
        checkLength(clean.label, field.maxLabel) ??
        checkCopy(clean.label) ??
        checkHref(clean.href);
      return { problem, clean };
    }
    case "select": {
      const ok = typeof value === "string" && field.options.some((o) => o.value === value);
      return { problem: ok ? null : "Choose one of the options.", clean: ok ? value : field.default };
    }
    case "boolean":
      return typeof value === "boolean"
        ? { problem: null, clean: value }
        : { problem: "This should be on or off.", clean: field.default };
    case "color":
      return typeof value === "string" && isHex(value)
        ? { problem: null, clean: value.toUpperCase() }
        : { problem: "Use a six-digit colour such as #C8754E.", clean: field.default };
    default:
      return { problem: null, clean: value };
  }
}

/** In shape mode a scalar keeps whatever it is, if it is the right kind of thing. */
function shapeScalar(field: Field, value: unknown): unknown {
  switch (field.kind) {
    case "text":
    case "longText":
    case "richText":
    case "color":
      return typeof value === "string" ? value : fieldDefault(field);
    case "image":
      return isRecord(value)
        ? { src: typeof value.src === "string" ? value.src : "", alt: typeof value.alt === "string" ? value.alt : "" }
        : fieldDefault(field);
    case "link":
      return isRecord(value)
        ? {
            label: typeof value.label === "string" ? value.label : "",
            href: typeof value.href === "string" ? value.href : "",
          }
        : fieldDefault(field);
    case "select":
      return typeof value === "string" && field.options.some((o) => o.value === value) ? value : fieldDefault(field);
    case "boolean":
      return typeof value === "boolean" ? value : fieldDefault(field);
    default:
      return fieldDefault(field);
  }
}

function walkGroup(fields: Fields, value: unknown, path: Path, mode: Mode, issues: Issue[]): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(fields)) out[key] = walk(child, source[key], [...path, key], mode, issues);
  return out;
}

/**
 * In strict and merge mode every problem is recorded, merge included: a merge
 * throws its problems away at the top, but a list needs to hear about a bad
 * item inside it (see below).
 */
function walk(field: Field, value: unknown, path: Path, mode: Mode, issues: Issue[]): unknown {
  if (value === undefined) {
    if (mode === "shape") return fieldDefault(field);
    // A field the stored content does not have yet — added to the page since
    // it was published — takes its default, and the default is checked like
    // anything else. On the page that is never a problem (every page default
    // passes); inside a list item the default is a blank, and a blank is.
    value = fieldDefault(field);
  }

  if (field.kind === "group") {
    if (!isRecord(value) && mode !== "shape") issues.push(issue(path, "This part is missing."));
    return walkGroup(field.fields, value, path, mode, issues);
  }

  if (field.kind === "list") {
    if (!Array.isArray(value)) {
      if (mode !== "shape") issues.push(issue(path, "This list is missing."));
      return fieldDefault(field);
    }
    const own: Issue[] = [];
    const items = value.map((item, i) => walk(field.item, item, [...path, i], mode, own));
    if (mode === "shape") return items;
    if (items.length < field.min) {
      own.push(issue(path, `Add at least ${field.min} ${field.itemLabel.toLowerCase()}${field.min === 1 ? "" : "s"}.`));
    }
    if (items.length > field.max) {
      own.push(issue(path, `Keep this to ${field.max} ${field.itemLabel.toLowerCase()}${field.max === 1 ? "" : "s"}.`));
    }
    // A list is shown whole or not at all. An item's own default is a blank,
    // so mending one bad item would put an empty question or card on the
    // page; the list's default — the original items — is shown instead.
    // Settled here, so a list inside something bigger does not spoil it too.
    if (mode === "merge" && own.length) return fieldDefault(field);
    issues.push(...own);
    return items;
  }

  if (mode === "shape") return shapeScalar(field, value);
  const { problem, clean } = checkScalar(field, value);
  if (!problem) return clean;
  issues.push(issue(path, problem));
  return mode === "strict" ? clean : fieldDefault(field);
}

// ------------------------------------------------------------------ sections

/** The theme's own rule: its text must stay readable. Blocks are errors, AA misses are warnings. */
function themeIssues(colors: ThemeColors): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const check of checkTheme(colors)) {
    const path = ["colors", check.token];
    const ratio = check.ratio.toFixed(2);
    if (check.status === "block") {
      errors.push(
        issue(
          path,
          `${check.label} would be harder to read than it is today (${ratio}:1, where the original is ${check.floor.toFixed(2)}:1). Choose a colour with more contrast.`,
        ),
      );
    } else if (check.status === "warn") {
      warnings.push(issue(path, `${check.label} is ${ratio}:1, below the 4.5:1 that small text needs to be easy to read.`));
    }
  }
  return { errors, warnings };
}

/** Every problem with a section's content, and the content as it would be published. */
export function validateSection<S extends SectionId>(id: S, data: unknown): Validation<ContentOf<S>> {
  const errors: Issue[] = [];
  let warnings: Issue[] = [];
  if (!isRecord(data)) errors.push(issue([], "There is nothing to publish."));
  const value = walkGroup(SECTIONS[id].fields, data, [], "strict", errors) as ContentOf<S>;
  if (id === "theme" && errors.length === 0) {
    const colors = (value as ContentOf<"theme">).colors as ThemeColors;
    const theme = themeIssues(colors);
    errors.push(...theme.errors);
    warnings = theme.warnings;
  }
  return { ok: errors.length === 0, value, errors, warnings };
}

/** The problems with one field's value — for checking a control as it is typed in. */
export function validateField(field: Field, value: unknown, path: Path = []): Issue[] {
  const issues: Issue[] = [];
  walk(field, value === undefined ? null : value, path, "strict", issues);
  return issues;
}

/**
 * One field checked on its own, as validateSection checks it inside a page:
 * its problems, and the value as it would be stored. For content that is not
 * a section of a page — an article in the resource centre (./resources).
 */
export function checkValue<F extends Field>(field: F, value: unknown, path: Path): { value: ValueOf<F>; errors: Issue[] } {
  const errors: Issue[] = [];
  const clean = walk(field, value === undefined ? null : value, path, "strict", errors) as ValueOf<F>;
  return { value: clean, errors };
}

/** One field as mergeSection reads it: as stored when usable, otherwise null. */
export function usableValue<F extends Field>(field: F, value: unknown): ValueOf<F> | null {
  const errors: Issue[] = [];
  const clean = walk(field, value === undefined ? null : value, [], "strict", errors) as ValueOf<F>;
  return errors.length ? null : clean;
}

/** One field as shapeSection reads it: unfinished words kept, the wrong kind of thing replaced. */
export function shapeValue<F extends Field>(field: F, value: unknown): ValueOf<F> {
  return walk(field, value, [], "shape", []) as ValueOf<F>;
}

/**
 * Published content laid over the defaults: every usable field as published,
 * every unusable one as its default. Never throws — whatever is stored, the
 * page renders.
 */
export function mergeSection<S extends SectionId>(id: S, raw: unknown): ContentOf<S> {
  try {
    if (!isRecord(raw)) return defaultContent(id);
    const merged = walkGroup(SECTIONS[id].fields, raw, [], "merge", []) as ContentOf<S>;
    if (id === "theme") {
      // A palette is all or nothing: half of one and half of the original
      // could be unreadable in a way neither is alone.
      const colors = (merged as ContentOf<"theme">).colors as ThemeColors;
      if (themeIssues(colors).errors.length) return defaultContent(id);
    }
    return merged;
  } catch {
    return defaultContent(id);
  }
}

/**
 * A stored draft in the shape the editor expects, keeping unfinished words as
 * they are: an empty line or a too-long answer stays, for the editor to point
 * at. Only things of the wrong kind are replaced by their default.
 */
export function shapeSection<S extends SectionId>(id: S, raw: unknown): ContentOf<S> {
  try {
    return walkGroup(SECTIONS[id].fields, raw, [], "shape", []) as ContentOf<S>;
  } catch {
    return defaultContent(id);
  }
}

// --------------------------------------------------------------------- media

/** The media library ids a section's content shows. */
export function mediaIdsIn<S extends SectionId>(id: S, data: ContentOf<S>): string[] {
  const found = new Set<string>();
  const visit = (field: Field, value: unknown) => {
    if (field.kind === "image" && isRecord(value) && typeof value.src === "string") {
      const media = mediaIdFromUrl(value.src);
      if (media) found.add(media);
    } else if (field.kind === "group" && isRecord(value)) {
      for (const [key, child] of Object.entries(field.fields)) visit(child, value[key]);
    } else if (field.kind === "list" && Array.isArray(value)) {
      for (const item of value) visit(field.item, item);
    }
  };
  for (const [key, child] of Object.entries(SECTIONS[id].fields as Fields)) visit(child, (data as Record<string, unknown>)[key]);
  return [...found];
}

