/**
 * The resource centre's articles and exercises: what staff can change about
 * each one, how it is checked, and how the site puts the published ones
 * together with the starter set that ships in code (../resources-seed).
 *
 * The starter articles keep showing exactly as written until somebody
 * publishes a change to one, takes one down, or adds a new one — so the
 * resource centre looks the same the day this goes live as the day before.
 *
 * Pure and shared, like ./schema: the editor checks with it as staff type,
 * the publishResource function (functions/src/content.ts) checks with it
 * again before anything goes live, and the server reader and the dashboard
 * read the published articles through it.
 *
 * Shape on disk:
 *   resources/{id}            status "published": the article (public read)
 *                             status "withdrawn": taken off the site — no words,
 *                               just the fact, so a starter article stops showing
 *                               (public read)
 *                             status "original": a starter article put back to
 *                               its words in code (staff only; the site shows the
 *                               starter copy)
 *   resourceDrafts/{id}       { data, baseRev, updatedAt, updatedBy } — staff
 *   resourceVersions/{auto}   what each change replaced, to put it back — staff
 *
 * An article's id is its document's: "seed-grief" for a starter article, a
 * Firestore auto id for one written here. Its web address is its slug, which
 * can change; the id never does.
 */

import { RESOURCE_TOPIC_LABELS, type ResourceFormat, type ResourceTopic } from "../models";
import type { Specialization } from "../matching";
import { SEED_RESOURCES } from "../resources-seed";
import {
  contentTag,
  mediaIdFromUrl,
  type ImageField,
  type ImageValue,
  type LongTextField,
  type RichTextField,
  type SelectField,
  type TextField,
} from "./schema";
import { fillTokens } from "./tokens";
import { checkValue, pathKey, shapeValue, usableValue, type Issue, type Path, type Validation } from "./validate";

export const RESOURCE_COLLECTIONS = {
  published: "resources",
  drafts: "resourceDrafts",
  versions: "resourceVersions",
} as const;

/**
 * The articles share their page's cache tag, "content:resources": refreshing
 * the resource centre after a change to the page around the library or to
 * an article refreshes both, and /api/revalidate needs nothing new to do it.
 */
export const RESOURCES_TAG = contentTag("resources");

/** "seed-grief", or a Firestore auto id. firestore.rules checks the same. */
export const RESOURCE_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isResourceId(value: unknown): value is string {
  return typeof value === "string" && RESOURCE_ID.test(value);
}

// ------------------------------------------------------------------- choices

/** What staff can make. Audio and video need a player the site does not have yet. */
export const RESOURCE_FORMATS = [
  { value: "article", label: "Article", description: "Something to read." },
  { value: "exercise", label: "Exercise", description: "Something to do, step by step." },
] as const satisfies readonly { value: ResourceFormat; label: string; description: string }[];

export type EditableFormat = (typeof RESOURCE_FORMATS)[number]["value"];

/** The library's filters, in the order the editor offers them. */
export const RESOURCE_TOPICS = Object.keys(RESOURCE_TOPIC_LABELS) as ResourceTopic[];

export const TOPICS_MIN = 1;
export const TOPICS_MAX = 4;
export const READING_MINUTES = { min: 1, max: 30 } as const;

export const SLUG_MIN = 3;
export const SLUG_MAX = 80;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// -------------------------------------------------------------------- fields

/**
 * The words and the picture, as field descriptors in ./schema's terms, so the
 * editor draws them with the same controls as every page and ./validate
 * checks them with the same rules: no prices typed in, no emergency numbers,
 * no HTML, links to this site or https only.
 */
export const RESOURCE_FIELDS: {
  title: TextField;
  summary: LongTextField;
  body: RichTextField;
  format: SelectField<EditableFormat>;
  cover: ImageField;
  slug: TextField;
} = {
  title: {
    kind: "text",
    label: "Title",
    max: 100,
    required: true,
    default: "",
    help: "What it is about, in plain words. Sentence case.",
  },
  summary: {
    kind: "longText",
    label: "Summary",
    max: 240,
    required: true,
    default: "",
    help: "One or two sentences: on its card in the library, under its title, and in search results.",
  },
  body: {
    kind: "richText",
    label: "The article",
    max: 20000,
    required: true,
    headings: true,
    default: "",
    help: "Short paragraphs and plain words. Headings break up anything longer than a few paragraphs.",
  },
  format: {
    kind: "select",
    label: "Kind",
    options: RESOURCE_FORMATS,
    default: "article",
  },
  cover: {
    kind: "image",
    label: "Cover picture",
    decorative: false,
    default: { src: "", alt: "" },
    help: "For people who cannot see it: who is in it and what they are doing.",
  },
  slug: {
    kind: "text",
    label: "Web address",
    max: SLUG_MAX,
    required: true,
    default: "",
  },
};

type WordsKey = "title" | "summary" | "body";

/** One article, as staff write it. */
export type ResourceContent = {
  title: string;
  /** The end of its address: /resources/{slug}. */
  slug: string;
  summary: string;
  body: string;
  format: EditableFormat;
  topics: ResourceTopic[];
  readingMinutes: number;
  /** src "" when it has none. */
  cover: ImageValue;
};

/** Where a new article starts. */
export function blankResource(): ResourceContent {
  return {
    title: "",
    slug: "",
    summary: "",
    body: "",
    format: "article",
    topics: [],
    readingMinutes: 5,
    cover: { src: "", alt: "" },
  };
}

// --------------------------------------------------------------- the starters

type Seed = (typeof SEED_RESOURCES)[number];

const SEED_ORDER = new Map(SEED_RESOURCES.map((seed, i) => [seed.id, i]));

/** The starter articles' ids, in the order they ship. */
export const SEED_IDS: readonly string[] = SEED_RESOURCES.map((seed) => seed.id);

export function seedById(id: string): Seed | null {
  return SEED_RESOURCES.find((seed) => seed.id === id) ?? null;
}

export function isSeedId(id: string): boolean {
  return SEED_ORDER.has(id);
}

/** A starter article's words, as the editor holds them. */
export function seedContent(seed: Seed): ResourceContent {
  return {
    title: seed.title,
    slug: seed.slug,
    summary: seed.summary,
    body: seed.body,
    format: seed.format === "exercise" ? "exercise" : "article",
    topics: [...seed.topics],
    readingMinutes: seed.readingMinutes,
    cover: { src: "", alt: "" },
  };
}

// --------------------------------------------------------------- web address

/** A web address from a title: "Grief does not follow a schedule" → "grief-does-not-follow-a-schedule". */
export function slugify(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length <= SLUG_MAX) return words;
  // Cut at a word, not through one.
  const cut = words.slice(0, SLUG_MAX + 1);
  const end = cut.lastIndexOf("-");
  return (end >= SLUG_MIN ? cut.slice(0, end) : cut.slice(0, SLUG_MAX)).replace(/-+$/, "");
}

/**
 * Why an address cannot be used by article `id`, or null. A starter
 * article's address stays its own even after it is changed or taken down, so
 * a link somebody saved never opens a different article. `takenBy` names the
 * article already published at an address, when the caller knows.
 */
export function checkSlug(id: string, slug: string, takenBy?: (slug: string) => string | null): string | null {
  if (!slug) return "Give it a web address.";
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters.`;
  if (slug.length > SLUG_MAX) return `Keep it to ${SLUG_MAX} characters.`;
  if (!SLUG.test(slug)) return "Use small letters, numbers and single dashes between words — no spaces.";
  const starter = SEED_RESOURCES.find((seed) => seed.slug === slug);
  if (starter && starter.id !== id) return `“${starter.title}” lives at this address. Choose another.`;
  const other = takenBy?.(slug);
  if (other && other !== id) return "Another article is published at this address. Choose another.";
  return null;
}

// ---------------------------------------------------------------- validation

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function issue(path: Path, message: string): Issue {
  return { path, key: pathKey(path), message };
}

function topicsFrom(value: unknown): { topics: ResourceTopic[]; problem: string | null } {
  if (!Array.isArray(value)) return { topics: [], problem: "Choose what it is about." };
  const topics = [...new Set(value.filter((t): t is ResourceTopic => (RESOURCE_TOPICS as unknown[]).includes(t)))];
  if (topics.length !== value.length) return { topics, problem: "Choose from the topics listed." };
  if (topics.length < TOPICS_MIN) return { topics, problem: "Choose at least one topic." };
  if (topics.length > TOPICS_MAX) return { topics, problem: `Choose at most ${TOPICS_MAX} topics.` };
  return { topics, problem: null };
}

function minutesProblem(value: unknown): string | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= READING_MINUTES.min &&
    value <= READING_MINUTES.max
    ? null
    : `Say how long it takes, from ${READING_MINUTES.min} to ${READING_MINUTES.max} minutes.`;
}

/**
 * Every problem with an article, and the article as it would be published:
 * trimmed, unknown keys gone. The same rules as a page's words, plus its own:
 * a web address that is free, one to four topics, a reading time, and a
 * description for any cover picture.
 */
export function validateResource(
  id: string,
  data: unknown,
  takenBy?: (slug: string) => string | null,
): Validation<ResourceContent> {
  const raw = isRecord(data) ? data : {};
  const errors: Issue[] = [];
  if (!isRecord(data)) errors.push(issue([], "There is nothing to publish."));

  const text = (key: WordsKey): string => {
    const out = checkValue(RESOURCE_FIELDS[key], raw[key], [key]);
    errors.push(...out.errors);
    return out.value;
  };
  const title = text("title");
  const summary = text("summary");
  const body = text("body");

  const format = checkValue(RESOURCE_FIELDS.format, raw.format, ["format"]);
  errors.push(...format.errors);

  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const slugProblem = checkSlug(id, slug, takenBy);
  if (slugProblem) errors.push(issue(["slug"], slugProblem));

  const { topics, problem: topicProblem } = topicsFrom(raw.topics);
  if (topicProblem) errors.push(issue(["topics"], topicProblem));

  const minutesWrong = minutesProblem(raw.readingMinutes);
  if (minutesWrong) errors.push(issue(["readingMinutes"], minutesWrong));
  const readingMinutes = minutesWrong ? blankResource().readingMinutes : (raw.readingMinutes as number);

  // No picture is fine. A picture is held to the page rules: from the
  // library or the site's own, and described.
  let cover: ImageValue = { src: "", alt: "" };
  const coverSrc = isRecord(raw.cover) && typeof raw.cover.src === "string" ? raw.cover.src.trim() : "";
  if (coverSrc) {
    const out = checkValue(RESOURCE_FIELDS.cover, raw.cover, ["cover"]);
    errors.push(...out.errors);
    cover = out.value;
  } else if (raw.cover !== undefined && raw.cover !== null && !isRecord(raw.cover)) {
    errors.push(issue(["cover"], "Choose a picture, or none."));
  }

  return {
    ok: errors.length === 0,
    value: { title, slug, summary, body, format: format.value, topics, readingMinutes, cover },
    errors,
    warnings: [],
  };
}

/**
 * A stored article as the site can show it, or null when it cannot: a
 * field that fails its checks takes its value from `base` (what is live, in
 * the editor's preview) or a safe default — and an article whose title,
 * address, summary or words are unusable is not shown at all. Never throws.
 */
export function mergeResource(raw: unknown, base: ResourceContent | null = null): ResourceContent | null {
  try {
    if (!isRecord(raw)) return base;
    const fallback = base ?? blankResource();
    const pick = (key: WordsKey): string => usableValue(RESOURCE_FIELDS[key], raw[key]) ?? fallback[key];
    const title = pick("title");
    const summary = pick("summary");
    const body = pick("body");
    const slug = typeof raw.slug === "string" && SLUG.test(raw.slug) && raw.slug.length <= SLUG_MAX ? raw.slug : fallback.slug;
    if (!title || !summary || !body || !slug) return null;

    const format = usableValue(RESOURCE_FIELDS.format, raw.format) ?? fallback.format;
    const { topics, problem } = topicsFrom(raw.topics);
    const cover =
      isRecord(raw.cover) && typeof raw.cover.src === "string" && raw.cover.src
        ? (usableValue(RESOURCE_FIELDS.cover, raw.cover) ?? fallback.cover)
        : raw.cover === null || (isRecord(raw.cover) && raw.cover.src === "")
          ? { src: "", alt: "" }
          : fallback.cover;
    return {
      title,
      slug,
      summary,
      body,
      format,
      topics: problem ? fallback.topics : topics,
      readingMinutes: minutesProblem(raw.readingMinutes) ? fallback.readingMinutes : (raw.readingMinutes as number),
      cover,
    };
  } catch {
    return base;
  }
}

/** A stored draft in the shape the editor expects, unfinished words kept as they are. */
export function shapeResource(raw: unknown): ResourceContent {
  const blank = blankResource();
  if (!isRecord(raw)) return blank;
  return {
    title: shapeValue(RESOURCE_FIELDS.title, raw.title),
    slug: typeof raw.slug === "string" ? raw.slug : "",
    summary: shapeValue(RESOURCE_FIELDS.summary, raw.summary),
    body: shapeValue(RESOURCE_FIELDS.body, raw.body),
    format: shapeValue(RESOURCE_FIELDS.format, raw.format),
    topics: Array.isArray(raw.topics)
      ? [...new Set(raw.topics.filter((t): t is ResourceTopic => (RESOURCE_TOPICS as unknown[]).includes(t)))]
      : blank.topics,
    readingMinutes:
      typeof raw.readingMinutes === "number" && Number.isFinite(raw.readingMinutes)
        ? Math.round(raw.readingMinutes)
        : blank.readingMinutes,
    cover: isRecord(raw.cover) ? shapeValue(RESOURCE_FIELDS.cover, raw.cover) : blank.cover,
  };
}

/** The library picture an article shows, if it shows one from the library. */
export function coverMediaId(content: ResourceContent | null): string | null {
  return content?.cover.src ? mediaIdFromUrl(content.cover.src) : null;
}

// ----------------------------------------------------------- stored shapes

export type ResourceStatus = "published" | "withdrawn" | "original";

/** resources/{id} while published: the Resource of ../models, with the cover as a picture and alt. */
export type StoredResource = {
  id: string;
  status: "published";
  slug: string;
  title: string;
  summary: string;
  body: string;
  format: EditableFormat;
  topics: ResourceTopic[];
  locales: ["en"];
  readingMinutes: number;
  cover: ImageValue | null;
  /** Goes up by one with every change to what the site shows. */
  rev: number;
  /** When it first went live: the library lists newest first. */
  publishedAt: number;
  updatedAt: number;
};

/** The document to store for an article going live. */
export function storedResource(
  id: string,
  content: ResourceContent,
  stamp: { rev: number; publishedAt: number; updatedAt: number },
): StoredResource {
  return {
    id,
    status: "published",
    slug: content.slug,
    title: content.title,
    summary: content.summary,
    body: content.body,
    format: content.format,
    topics: content.topics,
    locales: ["en"],
    readingMinutes: content.readingMinutes,
    cover: content.cover.src ? content.cover : null,
    ...stamp,
  };
}

/** resourceDrafts/{id}: work in progress, saved as staff type. */
export type ResourceDraftDoc = {
  data: ResourceContent;
  /** The rev of resources/{id} the draft started from (0 before there was one). */
  baseRev: number;
  updatedAt: number;
  updatedBy: string;
};

/**
 * resourceVersions/{autoId}: what a change replaced, so it can be put back.
 * `live` false: the article was not on the site. `live` true and `data` null:
 * a starter article was showing its words from code.
 */
export type ResourceVersion = {
  id: string;
  resourceId: string;
  live: boolean;
  data: ResourceContent | null;
  /** The title at the time, for the history and the audit log. */
  title: string;
  rev: number;
  publishedAt: number | null;
  replacedAt: number;
  replacedBy: string;
  action: "publish" | "unpublish" | "revert";
  note: string | null;
};

// ------------------------------------------------------------- what is shown

/** An article as the public site and the dashboard show it: placeholders filled in. */
export type PublicResource = ResourceContent & {
  id: string;
  publishedAt: number;
  updatedAt: number;
};

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function statusOf(raw: unknown): ResourceStatus | null {
  const status = isRecord(raw) ? raw.status : null;
  return status === "published" || status === "withdrawn" || status === "original" ? status : null;
}

function filled(id: string, content: ResourceContent, publishedAt: number, updatedAt: number): PublicResource {
  return {
    ...content,
    title: fillTokens(content.title),
    summary: fillTokens(content.summary),
    body: fillTokens(content.body),
    cover: { src: content.cover.src, alt: fillTokens(content.cover.alt) },
    id,
    publishedAt,
    updatedAt,
  };
}

/**
 * Everything the resource centre shows, newest first.
 *
 *   stored   resources/{id} as read, by id — null when they could not be read,
 *            in which case the starter articles show as they ship
 *   drafts   the editor's preview only: resourceDrafts/{id}, by id, each shown
 *            as if it were published
 *
 * A starter article shows from code until it has a document of its own; a
 * published one replaces it, a withdrawn one hides it. Two articles never
 * share an address: the first in the list keeps it.
 */
export function resourceCatalogue(
  stored: Map<string, unknown> | null,
  drafts: Map<string, unknown> | null = null,
): PublicResource[] {
  const shown = new Map<string, { content: ResourceContent; publishedAt: number; updatedAt: number }>();

  for (const seed of SEED_RESOURCES) {
    const raw = stored?.get(seed.id);
    const status = raw === undefined ? "original" : statusOf(raw);
    if (status === "original") {
      shown.set(seed.id, { content: seedContent(seed), publishedAt: seed.publishedAt, updatedAt: seed.updatedAt });
    } else if (status === "published") {
      const content = mergeResource(raw);
      if (content) {
        const r = raw as Record<string, unknown>;
        shown.set(seed.id, { content, publishedAt: seed.publishedAt, updatedAt: num(r.updatedAt, seed.updatedAt) });
      }
    }
  }
  for (const [id, raw] of stored ?? new Map<string, unknown>()) {
    if (isSeedId(id) || !isResourceId(id) || statusOf(raw) !== "published") continue;
    const content = mergeResource(raw);
    const r = raw as Record<string, unknown>;
    if (content) shown.set(id, { content, publishedAt: num(r.publishedAt, 0), updatedAt: num(r.updatedAt, 0) });
  }
  for (const [id, raw] of drafts ?? new Map<string, unknown>()) {
    if (!isResourceId(id) || !isRecord(raw)) continue;
    const before = shown.get(id);
    const content = mergeResource(raw.data, before?.content ?? null);
    const at = num(raw.updatedAt, 0);
    if (content) shown.set(id, { content, publishedAt: before?.publishedAt ?? at, updatedAt: at });
  }

  const order = (id: string) => SEED_ORDER.get(id) ?? -1;
  const sorted = [...shown.entries()].sort(
    ([a, x], [b, y]) => y.publishedAt - x.publishedAt || order(a) - order(b) || x.content.title.localeCompare(y.content.title),
  );
  const slugs = new Set<string>();
  const out: PublicResource[] = [];
  for (const [id, item] of sorted) {
    if (slugs.has(item.content.slug)) continue;
    slugs.add(item.content.slug);
    out.push(filled(id, item.content, item.publishedAt, item.updatedAt));
  }
  return out;
}

// --------------------------------------------------------------- suggestions

/** What each concern from the intake conversation points to in the library. */
const CONCERN_TOPICS: Record<Specialization, ResourceTopic[]> = {
  anxiety: ["stress", "emotional-regulation"],
  depression: ["emotional-regulation", "coping"],
  grief: ["grief"],
  trauma: ["coping", "emotional-regulation"],
  relationships: ["relationships"],
  family: ["family", "relationships"],
  workplace: ["workplace", "stress"],
  academic: ["academic"],
  "self-esteem": ["self-esteem"],
  substance: ["coping"],
  youth: ["personal-development", "academic"],
  sleep: ["stress", "coping"],
};

/**
 * The article to suggest on somebody's home screen: the one that covers most
 * of what they told TALK about, the newest of equals — or, with nothing to go
 * on, the newest. Null only when nothing is published.
 */
export function suggestResource(
  resources: PublicResource[],
  concerns: readonly Specialization[],
  goals: readonly string[] = [],
): PublicResource | null {
  const wanted = new Set<string>(concerns.flatMap((c) => CONCERN_TOPICS[c] ?? []));
  // Older accounts carry free-text goals; a goal that names a topic counts too.
  for (const goal of goals) {
    for (const topic of RESOURCE_TOPICS) if (topic.includes(goal) || goal.includes(topic.split("-")[0])) wanted.add(topic);
  }
  let best: PublicResource | null = resources[0] ?? null;
  let bestScore = 0;
  for (const resource of resources) {
    const score = resource.topics.filter((t) => wanted.has(t)).length;
    if (score > bestScore) {
      best = resource;
      bestScore = score;
    }
  }
  return best;
}
