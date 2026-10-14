/**
 * What staff can change on the public site, and what it says until they do.
 *
 * One section per public page and per shared block (header, footer, page
 * titles, colours). Each section is a tree of fields; every field carries its
 * own default, and the defaults are the site's words, pictures and links as
 * they were written in code — so with nothing published, the site looks
 * exactly as it did before the CMS existed.
 *
 * Pure and shared on purpose, like ../providerApplication: the editor draws
 * its controls from these descriptors, publishContent (functions/src/content.ts)
 * validates with them, and the server reader merges published content onto
 * them. Three readers, one definition.
 *
 * Code-owned, never here: the /crisis page, the emergency numbers wherever
 * they appear, where buttons that start a conversation lead, the provider
 * directory itself, prices (written as placeholders — see ./tokens).
 *
 * Shape on disk:
 *   siteContent/{sectionId}          { data, rev, publishedAt } — public read
 *   siteContentDrafts/{sectionId}    { data, baseRev, updatedAt, updatedBy } — staff
 *   siteContentVersions/{autoId}     what a publish or revert replaced — staff read
 *   siteMedia/{id}                   an uploaded image — public read
 */

import { THEME_DEFAULTS, type ThemeToken } from "./theme";

// --------------------------------------------------------------- the project

export const FIREBASE_PROJECT_ID = "talk-therapy-509209";
export const STORAGE_BUCKET = "talk-therapy-509209.firebasestorage.app";

export const CONTENT_COLLECTIONS = {
  published: "siteContent",
  drafts: "siteContentDrafts",
  versions: "siteContentVersions",
  media: "siteMedia",
} as const;

/** Said in the editor wherever it matters. */
export const CODE_OWNED_NOTICE =
  "The emergency contacts page and the emergency numbers (117 police, 116 ambulance, 118 fire) are set in code, " +
  "not here, so they can never be changed by mistake.";

// ----------------------------------------------------------------- the fields

type Base = {
  label: string;
  /** A line under the label in the editor. */
  help?: string;
};

/** One line of text: a heading line, a label, a button's words. */
export type TextField = Base & { kind: "text"; max: number; required: boolean; default: string };

/** A paragraph of plain text. Line breaks are not kept. */
export type LongTextField = Base & { kind: "longText"; max: number; required: boolean; default: string };

/** Formatted text in the small markdown of ./markdown: bold, italics, links, lists, and ## headings if allowed. */
export type RichTextField = Base & {
  kind: "richText";
  max: number;
  required: boolean;
  headings: boolean;
  default: string;
};

export type ImageValue = { src: string; alt: string };
/** A built-in picture from /people, or one uploaded to the media library. */
export type ImageField = Base & {
  kind: "image";
  /** Decorative pictures may have no description: a screen reader skips them. */
  decorative: boolean;
  default: ImageValue;
};

export type LinkValue = { label: string; href: string };
/** A button or link: its words, and a page here (/…), a section (#…) or an https:// address. */
export type LinkField = Base & { kind: "link"; maxLabel: number; default: LinkValue };

export type SelectOption<V extends string = string> = { value: V; label: string };
export type SelectField<V extends string = string> = Base & {
  kind: "select";
  options: readonly SelectOption<V>[];
  default: V;
};

export type BooleanField = Base & { kind: "boolean"; default: boolean };

/** A brand colour, as six-digit hex. Only in the theme. */
export type ColorField = Base & { kind: "color"; token: ThemeToken; default: string };

/** Fields shown together under one heading. */
export interface GroupField<F extends Fields = Fields> extends Base {
  kind: "group";
  fields: F;
}

/** Repeated items — cards, questions, steps, lines — added, removed and reordered. */
export interface ListField<I extends Field = Field> extends Base {
  kind: "list";
  min: number;
  max: number;
  /** What one item is called: "Question", "Step". */
  itemLabel: string;
  item: I;
  default: readonly unknown[];
}

export type Field =
  | TextField
  | LongTextField
  | RichTextField
  | ImageField
  | LinkField
  | SelectField
  | BooleanField
  | ColorField
  | GroupField
  | ListField;

export type Fields = { readonly [key: string]: Field };

export type FieldKind = Field["kind"];

/** The value a field holds. */
export type ValueOf<F> = F extends { kind: "text" | "longText" | "richText" | "color" }
  ? string
  : F extends { kind: "image" }
    ? ImageValue
    : F extends { kind: "link" }
      ? LinkValue
      : F extends SelectField<infer V>
        ? V
        : F extends { kind: "boolean" }
          ? boolean
          : F extends GroupField<infer G>
            ? { -readonly [K in keyof G]: ValueOf<G[K]> }
            : F extends ListField<infer I>
              ? ValueOf<I>[]
              : never;

// ----------------------------------------------------------------- builders

type More = { help?: string; required?: boolean };

function text(label: string, max: number, value: string, more: More = {}): TextField {
  return { kind: "text", label, max, required: more.required ?? true, default: value, help: more.help };
}

function longText(label: string, max: number, value: string, more: More = {}): LongTextField {
  return { kind: "longText", label, max, required: more.required ?? true, default: value, help: more.help };
}

function richText(label: string, max: number, value: string, more: More & { headings?: boolean } = {}): RichTextField {
  return {
    kind: "richText",
    label,
    max,
    required: more.required ?? true,
    headings: more.headings ?? false,
    default: value,
    help: more.help,
  };
}

function image(label: string, value: ImageValue, more: { help?: string; decorative?: boolean } = {}): ImageField {
  return { kind: "image", label, decorative: more.decorative ?? false, default: value, help: more.help };
}

function link(label: string, value: LinkValue, help?: string): LinkField {
  return { kind: "link", label, maxLabel: 40, default: value, help };
}

function select<V extends string>(
  label: string,
  options: readonly SelectOption<V>[],
  value: NoInfer<V>,
  help?: string,
): SelectField<V> {
  return { kind: "select", label, options, default: value, help };
}

function color(token: ThemeToken, label: string, help?: string): ColorField {
  return { kind: "color", token, label, default: THEME_DEFAULTS[token], help };
}

function group<F extends Fields>(label: string, fields: F, help?: string): GroupField<F> {
  return { kind: "group", label, fields, help };
}

function list<I extends Field>(
  label: string,
  item: I,
  value: ValueOf<I>[],
  opts: { min: number; max: number; itemLabel: string; help?: string },
): ListField<I> {
  return { kind: "list", label, item, default: value, ...opts };
}

// Building blocks the pages share.

const LINES_HELP = "Each line starts on a new line. The last one is set in italic sage.";

/** A heading set in lines, the last in italics. */
function lines(label: string, value: string[], opts: { min?: number; max?: number } = {}) {
  return list(label, text("Line", 48, ""), value, {
    min: opts.min ?? 1,
    max: opts.max ?? 3,
    itemLabel: "Line",
    help: LINES_HELP,
  });
}

/** The band at the top of an inner page: label, heading, introduction. */
function intro(eyebrow: string, headline: string[], lede: string) {
  return {
    eyebrow: text("Label above the heading", 40, eyebrow),
    lines: lines("Heading", headline),
    lede: longText("Introduction", 420, lede),
  };
}

/** A section heading: its label and lines. */
function heading(eyebrow: string, headline: string[]) {
  return {
    eyebrow: text("Label above the heading", 40, eyebrow),
    lines: lines("Heading", headline),
  };
}

const lede = (value: string) => longText("Introduction", 420, value);

const card = group("Card", {
  title: text("Title", 70, ""),
  body: longText("Text", 360, ""),
});

function cards(label: string, value: { title: string; body: string }[], min: number, max: number) {
  return list(label, card, value, { min, max, itemLabel: "Card" });
}

const step = group("Step", {
  title: text("Title", 70, ""),
  body: longText("Text", 400, ""),
});

function steps(value: { title: string; body: string }[], min: number, max: number) {
  return list("Steps", step, value, { min, max, itemLabel: "Step", help: "Numbered in this order." });
}

const question = group("Question", {
  q: text("Question", 140, ""),
  a: longText("Answer", 800, ""),
});

function questions(value: { q: string; a: string }[], opts: { min?: number; max?: number; help?: string } = {}) {
  return list("Questions", question, value, {
    min: opts.min ?? 1,
    max: opts.max ?? 12,
    itemLabel: "Question",
    help: opts.help,
  });
}

function bullets(label: string, value: string[], min: number, max: number, help?: string) {
  return list(label, text("Point", 200, ""), value, { min, max, itemLabel: "Point", help });
}

function paragraphs(label: string, value: string[], min: number, max: number) {
  return list(label, longText("Paragraph", 900, ""), value, { min, max, itemLabel: "Paragraph" });
}

const note = (label: string, value: string) => longText(label, 600, value);

/** The closing sage panel on the inner pages: label, heading, a line of text, two buttons. */
function ctaBlock(v: { eyebrow?: string; lines: string[]; body?: string; primary?: LinkValue; secondary: LinkValue }) {
  return group("Closing call to action", {
    eyebrow: text("Label above the heading", 40, v.eyebrow ?? "Get started"),
    lines: lines("Heading", v.lines),
    body: longText("Text", 300, v.body ?? "", { required: false }),
    primary: link("Main button", v.primary ?? { label: "Create your account", href: "/sign-up" }),
    secondary: link("Second button", v.secondary),
  });
}

/** The full-width closing band (home and the providers page): two lines, a sentence, the start button. */
function ctaBand(headline: [string, string], body: string) {
  return group("Closing band", {
    lines: lines("Heading", headline, { min: 2, max: 2 }),
    text: longText("Text", 300, body),
    button: text("Button", 40, "Begin with TALK", {
      help: "This button starts a conversation with TALK, or opens the dashboard for someone signed in.",
    }),
  });
}

/** Turns the old {heading, paragraphs} pages into the long-form text they are now edited as. */
function prose(sections: { heading: string; body: string[] }[]): string {
  return sections.map((s) => [`## ${s.heading}`, ...s.body].join("\n\n")).join("\n\n");
}

// ------------------------------------------------------------------ pictures

/** The pictures that ship with the site, in public/people. */
export const BUILT_IN_IMAGES = [
  "/people/hero-chat.webp",
  "/people/hero-man.webp",
  "/people/hero-phone.webp",
  "/people/hero-rest.webp",
  "/people/hero-woman-terracotta.webp",
  "/people/mind-journal.webp",
  "/people/mind-man.webp",
  "/people/mind-tea.webp",
  "/people/mind-woman.webp",
  "/people/provider-1.webp",
  "/people/provider-2.webp",
  "/people/provider-3.webp",
  "/people/provider-4.webp",
  "/people/provider-5.webp",
  "/people/provider-6.webp",
  "/people/provider-7.webp",
] as const;

/** Uploads: images only, the four types a browser shows well. No SVG — it can carry script. */
export const MEDIA_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;

/** How many bytes from the start of a file mediaTypeOf needs to see. */
export const MEDIA_SNIFF_BYTES = 16;

/**
 * What a file really is, from its first bytes, or null when it is none of
 * the four. The type an upload declares is only what the browser said;
 * registerSiteMedia checks the file's own signature agrees before the
 * library lists it, so a page dressed up as a picture never reaches the site.
 */
export function mediaTypeOf(head: Uint8Array): MediaType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // An ISO media file whose brand is AVIF: a still ("avif") or a sequence ("avis").
  if (head.length >= 12 && ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

/** storage.rules says the same: at most 8 MB. */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

/** site-media/{id}.{ext} — the only place uploads go. */
export const MEDIA_PATH = /^site-media\/([A-Za-z0-9_-]{6,64})\.(jpg|jpeg|png|webp|avif)$/;

const MEDIA_URL_PREFIX = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/`;

/** The public address of an uploaded image. site-media/ is public-read, so it needs no token. */
export function siteMediaUrl(path: string): string {
  return `${MEDIA_URL_PREFIX}${encodeURIComponent(path)}?alt=media`;
}

/** The storage path behind a site-media address, or null when it is not one. */
export function mediaPathFromUrl(url: string): string | null {
  if (!url.startsWith(MEDIA_URL_PREFIX) || !url.endsWith("?alt=media")) return null;
  const encoded = url.slice(MEDIA_URL_PREFIX.length, -"?alt=media".length);
  if (!/^site-media%2F[A-Za-z0-9_-]{6,64}\.(jpg|jpeg|png|webp|avif)$/.test(encoded)) return null;
  const path = decodeURIComponent(encoded);
  return MEDIA_PATH.test(path) ? path : null;
}

/** The media library id behind a site-media address, or null. */
export function mediaIdFromUrl(url: string): string | null {
  const path = mediaPathFromUrl(url);
  return path ? (MEDIA_PATH.exec(path)?.[1] ?? null) : null;
}

/**
 * Where a library picture is on the live site: a section of a page by its id,
 * or an article in the resource centre as "resource:<its id>".
 */
export type MediaUsage = SectionId | `resource:${string}`;

/** How a published article is named in a picture's list of where it is used. */
export function resourceUsage(resourceId: string): MediaUsage {
  return `resource:${resourceId}`;
}

/** The article a usage entry names, or null when it names a section. */
export function usageResourceId(usage: MediaUsage): string | null {
  return usage.startsWith("resource:") ? usage.slice("resource:".length) : null;
}

export function isMediaUsage(value: unknown): value is MediaUsage {
  return isSectionId(value) || (typeof value === "string" && /^resource:[A-Za-z0-9-]{1,64}$/.test(value));
}

/** An image in the media library: siteMedia/{id}. */
export type SiteMedia = {
  id: string;
  url: string;
  path: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  type: MediaType;
  uploadedBy: string;
  createdAt: number;
  /** The sections and articles whose published content shows it. */
  usage: MediaUsage[];
};

// --------------------------------------------------------------- navigation

/** Where the header and footer links go. Code-owned: the labels are content, the routes are not. */
export const NAV_HREFS = {
  providers: "/providers",
  howItWorks: "/how-it-works",
  pricing: "/plans",
  support: "/support",
  resources: "/resources",
  about: "/about",
  safety: "/safety",
  forProviders: "/for-providers",
  forInstitutions: "/for-institutions",
  community: "/community",
  privacy: "/privacy",
  terms: "/terms",
} as const;

export type NavKey = keyof typeof NAV_HREFS;

const navLabel = (value: string) => text("Label", 30, value);

/** For how-it-works' "four ways in" cards, drawn by the icon of the same name. */
export const ICON_OPTIONS = [
  { value: "orb", label: "TALK" },
  { value: "people", label: "People" },
  { value: "resources", label: "Resources" },
  { value: "mood", label: "Mood" },
  { value: "journal", label: "Journal" },
  { value: "chat", label: "Conversation" },
  { value: "calendar", label: "Calendar" },
  { value: "shield", label: "Shield" },
  { value: "heart", label: "Heart" },
  { value: "lock", label: "Lock" },
] as const;

export type IconName = (typeof ICON_OPTIONS)[number]["value"];

// ------------------------------------------------------------------ sections

export type SectionKind = "page" | "site";

export interface SectionDef<F extends Fields = Fields, K extends SectionKind = SectionKind> {
  id: string;
  label: string;
  /** One line on the section's card in the editor. */
  description: string;
  /** The page to preview it on; null for what shows on every page. */
  route: string | null;
  /** "page": one public page. "site": shown on every page (header, footer, titles, colours). */
  kind: K;
  fields: F;
  /** What on this page is set in code, said plainly in the editor. */
  locked: string[];
}

function section<F extends Fields, K extends SectionKind>(def: SectionDef<F, K>): SectionDef<F, K> {
  return def;
}

const START_BUTTON_NOTE =
  "Buttons that start a conversation go wherever suits the visitor — TALK, or their dashboard — so only their words change here.";
const PRICE_NOTE = "Prices and minutes are written as placeholders such as {firstPrice}, never as amounts.";

export const SECTIONS = {
  // ------------------------------------------------------------------ home
  home: section({
    id: "home",
    label: "Home",
    description: "The front page: the welcome, what is on your mind, how it works, the prices, questions.",
    route: "/",
    kind: "page",
    locked: [
      "The four languages under the headline are the languages TALK speaks, set in code.",
      "The answer to “What if I am in danger?” (always third in the questions) and the emergency numbers under the prices are set in code.",
      "The providers shown are the live directory.",
      START_BUTTON_NOTE,
      PRICE_NOTE,
    ],
    fields: {
      hero: group("Welcome", {
        eyebrow: text("Label above the heading", 48, "Care that understands your world"),
        lines: lines("Heading", ["Talk it through,", "your own way."], { min: 2, max: 2 }),
        lede: lede(
          "Private conversations with TALK and qualified providers, in English, Wolof, Mandinka or Pulaar. Culturally rooted care, for everyone.",
        ),
        startLabel: text("Start button", 40, "Begin with TALK"),
        secondary: link("Second button", { label: "Meet providers", href: "/providers" }),
        images: group("The three arches", {
          left: image("Left arch", {
            src: "/people/hero-phone.webp",
            alt: "A young man lying back on a cushion, laughing at his phone",
          }),
          middle: image("Middle arch", {
            src: "/people/hero-chat.webp",
            alt: "Two friends on a bench, deep in a laughing conversation",
          }),
          right: image("Right arch", {
            src: "/people/hero-rest.webp",
            alt: "A woman resting on a cushion with headphones on, smiling",
          }),
        }),
        facts: list(
          "The brown band of four facts",
          group("Fact", {
            value: text("Figure", 12, ""),
            label: text("Words under it", 48, ""),
          }),
          [
            { value: "4", label: "languages TALK speaks" },
            { value: "24/7", label: "TALK, whenever you need her" },
            { value: "{firstPrice}", label: "first conversation" },
            { value: "Free", label: "emergency numbers, no account" },
          ],
          { min: 4, max: 4, itemLabel: "Fact" },
        ),
      }),
      mind: group("What's on your mind?", {
        heading: text("Heading", 60, "What's on your mind?"),
        lede: lede("Have a think about what is weighing on you. TALK will ask about it, gently, in your own words."),
        topics: list(
          "Topics to choose from",
          text("Topic", 32, ""),
          ["Stress and pressure", "Money and work", "Relationships", "Anger", "Low mood", "Sleep", "Family", "Something else"],
          { min: 2, max: 12, itemLabel: "Topic", help: "The first one starts chosen." },
        ),
        comfortLabel: text("Above the choice of provider", 60, "I'd feel more comfortable with"),
        withMan: text("First choice", 24, "A man"),
        withWoman: text("Second choice", 24, "A woman"),
        withAny: text("Third choice", 24, "No preference"),
        startLabel: text("Start button", 40, "Begin with TALK"),
        imageLeft: image(
          "Left picture (wide screens)",
          { src: "/people/mind-journal.webp", alt: "" },
          { decorative: true },
        ),
        imageRight: image(
          "Right picture (wide screens)",
          { src: "/people/mind-tea.webp", alt: "" },
          { decorative: true },
        ),
      }),
      providers: group("Meet your providers", {
        heading: text("Heading", 60, "Meet your providers"),
        lede: lede(
          "Qualified people who understand your world. Choose by language, specialty, and who you feel most comfortable with.",
        ),
        profileLabel: text("Button on each provider", 30, "View profile"),
        allLabel: text("Button under them", 40, "View all providers"),
      }),
      how: group("How it works", {
        heading: text("Heading", 60, "How it works"),
        lede: lede("Three simple steps, at your own pace."),
        steps: list(
          "Steps",
          group("Step", { title: text("Title", 60, ""), text: longText("Text", 240, "") }),
          [
            {
              title: "Talk with TALK",
              text: "Speak or type — English, Wolof, Mandinka or Pulaar — for up to {firstMinutes} minutes.",
            },
            { title: "Meet providers who fit", text: "A short-list matched to what you need and how you feel." },
            { title: "Begin your sessions", text: "By video or voice call, private, whenever you are ready." },
          ],
          { min: 3, max: 3, itemLabel: "Step", help: "Three steps, each under its own arch and picture." },
        ),
      }),
      pricing: group(
        "Prices",
        {
          heading: text("Heading", 60, "Pay for what you use."),
          lede: lede("No plans, no subscription. Pay per conversation, with mobile money or a card."),
        },
        "The three price cards are edited under Pricing, and show on both pages.",
      ),
      faq: group("Questions", {
        heading: text("Heading", 60, "Questions, answered"),
        items: questions(
          [
            {
              q: "What happens in my first conversation?",
              a: "You talk with TALK for up to {firstMinutes} minutes — in English, Wolof, Mandinka or Pulaar — by voice or by tapping. It costs {firstPrice}. TALK then introduces you to providers who fit.",
            },
            {
              q: "Do I have to speak to a person?",
              a: "No. You can keep talking with TALK — a longer talk is {longerPrice} for up to {longerMinutes} minutes. When you are ready, a provider is one message away.",
            },
            {
              q: "Who can see my journal and mood?",
              a: "Only you. Providers never see your journal or mood check-ins — only what you choose to send them.",
            },
            {
              q: "How do I pay?",
              a: "With Wave or another mobile money wallet, or a card. No plans, no subscription: you see the price first, and pay per conversation.",
            },
            {
              q: "Can I choose a male or female provider?",
              a: "Yes. TALK asks who you would feel more comfortable with, and you can filter the providers by it too.",
            },
          ],
          { help: "“What if I am in danger?” is always shown third, with the emergency numbers. It is set in code." },
        ),
      }),
      cta: ctaBand(
        ["Whatever you're carrying,", "you don't have to carry it alone."],
        "Start with a private conversation — in English, Wolof, Mandinka or Pulaar.",
      ),
    },
  }),

  // ----------------------------------------------------------------- about
  about: section({
    id: "about",
    label: "About",
    description: "Why TALK exists, its vision and mission, and what it is trying to do.",
    route: "/about",
    kind: "page",
    locked: [],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "About",
          ["Somewhere safe", "to begin."],
          "TALK is a mental wellbeing and psychosocial support platform for The Gambia. It exists to shorten the distance between the moment someone realises they need support and the moment they actually receive it.",
        ),
      ),
      whyNow: group("Why now", {
        ...heading("Why now", ["The gap is not", "only about supply."]),
        lede: lede(
          "Academic pressure, unemployment, workplace stress, grief, relationship difficulties, loneliness and uncertainty are widely felt. Support for them is not widely reached.",
        ),
        paragraphs: paragraphs(
          "Beside the heading",
          [
            "There is a real and growing need for mental health and psychosocial support, particularly among young people. But the distance between needing help and receiving it is not explained by a shortage of professionals alone.",
            "It is also cost, stigma, awareness, geography, and the very ordinary fear of being judged. Technology cannot fix all of that. It can make the first step considerably smaller.",
          ],
          1,
          4,
        ),
        barriers: cards(
          "What stands in the way",
          [
            {
              title: "Stigma",
              body: "Seeking mental health support still carries a social cost. Many people would rather carry something alone than be seen asking.",
            },
            {
              title: "Cost and distance",
              body: "Professional counselling is expensive and concentrated in a few places. For most people it is simply not within reach.",
            },
            {
              title: "Not knowing where to start",
              body: "Even people who want support often have no idea who to approach, what it would involve, or whether their situation 'counts'.",
            },
          ],
          1,
          6,
        ),
      }),
      vision: group("Vision", {
        ...heading("Vision", ["An ecosystem", "people trust."]),
        body: longText(
          "Text",
          600,
          "To build an accessible and trusted digital ecosystem where anyone can find a safe space to talk, receive support, and connect with appropriate professional care when they need it — and in doing so, to become the central mental health and psychosocial support provider for The Gambia.",
        ),
      }),
      mission: group("Mission", {
        ...heading("Mission", ["Responsible tech,", "human expertise."]),
        body: longText(
          "Text",
          600,
          "To use responsible technology and human expertise to make mental wellbeing, counselling and psychosocial support more accessible, affordable, confidential and responsive to the realities of everyday life.",
        ),
      }),
      objectives: group("Objectives", {
        ...heading("Objectives", ["What we are", "trying to do."]),
        items: bullets(
          "Objectives",
          [
            "Improve access to mental wellbeing and psychosocial support.",
            "Provide a safe digital space for emotional reflection and early support.",
            "Connect people with qualified providers and psychosocial professionals.",
            "Reduce the barriers and stigma around seeking support.",
            "Make credible wellbeing information freely available.",
            "Use AI responsibly, to complement rather than replace human expertise.",
            "Encourage help-seeking before challenges become severe.",
            "Build wider awareness of mental wellbeing and self-care.",
          ],
          1,
          12,
        ),
      }),
      longView: group("The long view", {
        ...heading("The long view", ["Not another", "technology platform."]),
        lede: lede(
          "Over time TALK could grow into a wider digital wellbeing ecosystem — more Gambian languages, locally relevant content, moderated peer communities, corporate and university programmes, and research partnerships. Expansion into other African markets could follow once the model has been responsibly validated at home.",
        ),
        ambition: richText(
          "The closing line",
          400,
          "The ambition is to build an environment where asking for help becomes easier — and where saying **“I need to talk”** is met with somewhere safe to begin.",
          { help: "Words in bold are set in terracotta." },
        ),
      }),
      cta: ctaBlock({
        eyebrow: "Join us",
        lines: ["Listen. Support.", "Heal. Grow."],
        body: "Whether you need support, provide it, or want to bring it to your organisation.",
        secondary: { label: "Partner with us", href: "/support" },
      }),
    },
  }),

  // ---------------------------------------------------------- how it works
  "how-it-works": section({
    id: "how-it-works",
    label: "How it works",
    description: "The journey from a hard day to a session, the four ways in, and the first questions people ask.",
    route: "/how-it-works",
    kind: "page",
    locked: ["The last question, “What if I am in crisis?”, and its emergency numbers are set in code.", PRICE_NOTE],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "How it works",
          ["From a hard day", "to real support."],
          "TALK is built around one idea: the distance between needing help and getting it should be as short as possible. Here is what that looks like in practice.",
        ),
      ),
      journey: group("The journey", {
        ...heading("The journey", ["Six steps, and you", "can stop at any of them."]),
        lede: lede(
          "Nobody is pushed through a funnel. Plenty of people will read one article, check in once, and close it again. That is a valid use of this platform.",
        ),
        steps: steps(
          [
            {
              title: "Start wherever you are",
              body: "You do not need a reason, a diagnosis, or the right words. Open TALK because today was hard, because something has been sitting with you for months, or because you simply want to check in with yourself.",
            },
            {
              title: "Talk it through with the companion",
              body: "The AI companion is there for an initial, private conversation — a check-in, a reflection, a grounding exercise. It is clearly labelled as AI, it does not diagnose, and it does not pretend to be a therapist.",
            },
            {
              title: "Get pointed towards the right support",
              body: "Every companion conversation ends the same way: by helping you decide what would actually help next. Often that is booking time with a qualified human provider.",
            },
            {
              title: "Choose a provider and book",
              body: "Browse verified providers by language, specialty and who you would feel most comfortable with. See their qualifications and fee before you commit to anything.",
            },
            {
              title: "Meet securely",
              body: "Sessions happen through a private consultation room in the platform. No travelling, no waiting room, no one seeing you walk in.",
            },
            {
              title: "Keep going",
              body: "Book follow-ups, track how you are doing over time with mood check-ins and a private journal, and use the resource library between sessions.",
            },
          ],
          2,
          10,
        ),
      }),
      ways: group("What you get", {
        ...heading("What you get", ["Four ways in."]),
        lede: lede("Different days need different things. TALK is built so you can use only the part you need."),
        items: list(
          "Cards",
          group("Card", {
            title: text("Title", 70, ""),
            body: longText("Text", 360, ""),
            icon: select("Icon", ICON_OPTIONS, "orb"),
          }),
          [
            {
              title: "AI companion",
              body: "A private space to talk things through — by voice or by typing, in English, Wolof, Mandinka or Pulaar. Check-ins, reflection, and simple grounding when it helps.",
              icon: "orb",
            },
            {
              title: "Human providers",
              body: "Qualified providers and psychosocial support professionals, credential-verified before they appear in the directory.",
              icon: "people",
            },
            {
              title: "Resource centre",
              body: "Free articles and exercises on stress, grief, sleep, study pressure and more.",
              icon: "resources",
            },
            {
              title: "Personal wellbeing tools",
              body: "Mood check-ins and a confidential journal, so you can see patterns over time rather than relying on memory.",
              icon: "mood",
            },
          ],
          { min: 1, max: 8, itemLabel: "Card" },
        ),
      }),
      faq: group("Questions", {
        ...heading("Questions", ["The things people", "ask us first."]),
        items: questions(
          [
            {
              q: "Is the AI companion a replacement for a therapist?",
              a: "No, and it is not designed to be. The companion is a bridge — a low-pressure way to start, reflect, and work out what support would help. It will not diagnose you, prescribe treatment, or claim to be human. Every conversation ends by guiding you toward a qualified professional.",
            },
            {
              q: "Who can see what I share?",
              a: "Your journal entries and mood check-ins are private to you. Providers do not have access to them unless you deliberately share something in a session. The words of your conversation with TALK are not saved — only what she learns to match you. Messages with your provider are encrypted in transit and at rest, and nothing you share is ever sold or used for advertising.",
            },
            {
              q: "How do I know a provider is qualified?",
              a: "Every provider submits their credentials before their profile can appear publicly. An administrator reviews the documents and only then is the profile visible in the directory. You can see qualifications, specialisations and years of experience on each profile.",
            },
            {
              q: "What does it cost?",
              a: "No plans, no subscription — you pay per conversation. The resource centre, mood check-ins and your journal are free. A first conversation with TALK is {firstPrice} for up to {firstMinutes} minutes; a longer talk is {longerPrice} for up to {longerMinutes} minutes. A 45-minute session with a provider costs what they set, from {providerFrom}. Minute for minute, a provider can cost less than TALK — on purpose.",
            },
          ],
          { help: "“What if I am in crisis?” is always shown last, with the emergency numbers. It is set in code." },
        ),
      }),
      cta: ctaBlock({
        lines: ["You do not need", "the right words."],
        body: "Create an account and start whenever you are ready. Nothing is shared without your say-so.",
        secondary: { label: "Browse providers", href: "/providers" },
      }),
    },
  }),

  // --------------------------------------------------------- for providers
  "for-providers": section({
    id: "for-providers",
    label: "For providers",
    description: "Why a provider would join, how applying works, and what professionals ask.",
    route: "/for-providers",
    kind: "page",
    locked: ["Every join button goes to the application at /apply, so only its words change here.", PRICE_NOTE],
    fields: {
      intro: group("Top of the page", {
        ...intro(
          "For providers",
          ["Your practice,", "further reach."],
          "TALK connects qualified providers and psychosocial support professionals with people across The Gambia who need support and cannot easily get to it.",
        ),
        joinLabel: text("Join button", 40, "Apply to join", { help: "Goes to the application." }),
        howLabel: text("Second button", 40, "How it works", { help: "Moves down to the application steps." }),
      }),
      why: group("Why join", {
        ...heading("Why join", ["Built around how", "you actually work."]),
        benefits: cards(
          "Cards",
          [
            {
              title: "Set your own rate",
              body: "Choose a session fee between {providerFrom} – {providerTo} based on your qualifications, specialisation and experience.",
            },
            {
              title: "Control your calendar",
              body: "Publish only the hours you want to work, up to two weeks ahead. Each session is 45 minutes.",
            },
            {
              title: "Reach people who would not come to you",
              body: "Many of the people on TALK would never book an in-person appointment. Distance, cost and stigma stop them long before your waiting room does.",
            },
            {
              title: "Practise, not paperwork",
              body: "Booking, payment, messages and calls are handled in one place, so your admin time goes down rather than up.",
            },
            {
              title: "A secure consultation room",
              body: "Private video and voice calls run inside TALK — no personal phone numbers exchanged. If a call will not connect, you can add a Google Meet link as a fallback.",
            },
            {
              title: "Verified means something",
              body: "Because every professional is credential-checked before going live, the badge on your profile carries actual weight with clients.",
            },
          ],
          1,
          9,
        ),
      }),
      applying: group("Applying", {
        ...heading("Applying", ["Five steps to", "your first client."]),
        lede: lede(
          "Verification is thorough because it is the thing that makes the directory worth trusting — for clients and for you.",
        ),
        steps: steps(
          [
            {
              title: "Apply",
              body: "Create an account and tell us about your practice — qualifications, specialisations, languages you work in, and the kind of support you offer.",
            },
            {
              title: "Submit your credentials",
              body: "Upload evidence of your qualifications and a form of identification. These documents are visible only to you and to the administrator reviewing them.",
            },
            {
              title: "Review",
              body: "An administrator checks your identity and qualifications. We will come back to you if anything needs clarifying rather than rejecting an application silently.",
            },
            {
              title: "Build your profile",
              body: "Write your bio, set your rate, and publish the hours you are available. You control how you are presented.",
            },
            {
              title: "Start seeing clients",
              body: "Once approved, your profile appears in the public directory and people can book you directly.",
            },
          ],
          2,
          8,
        ),
      }),
      faq: group("Questions", {
        ...heading("Questions", ["What professionals", "ask us."]),
        items: questions([
          {
            q: "What qualifications do I need?",
            a: "We work with qualified providers, psychologists, psychosocial support practitioners, social workers and other appropriately qualified professionals. You will need to evidence your qualification and identity. If you are unsure whether your background qualifies, apply and ask — we would rather have the conversation.",
          },
          {
            q: "How much does TALK take?",
            a: "TALK retains a {feePercent}% service fee on each completed session, which covers payment processing, the platform, verification and support. The remainder is yours.",
          },
          {
            q: "How and when am I paid?",
            a: "People pay for a session before it happens. Twenty-four hours after it ends, your share is ready — send it from Earnings to your Wave, Afrimoney, QMoney or APS wallet whenever you like.",
          },
          {
            q: "Am I employed by TALK?",
            a: "No. You practise independently, set your own rate and hours, and remain responsible for your own professional registration, insurance and clinical judgement. TALK is the platform connecting you to clients, not your employer.",
          },
          {
            q: "What happens if a client is at risk?",
            a: "TALK gives people the emergency numbers automatically when they may be in danger. In your own sessions, follow your professional obligations — and if you are worried about someone, contact us through support.",
          },
          {
            q: "Can I work in Wolof, Mandinka or Pulaar?",
            a: "Yes — and we want you to. Choose the languages you work in on your profile: English, Wolof, Mandinka, Pulaar. TALK matches people with providers who speak their language, and the directory can be filtered by it.",
          },
        ]),
      }),
      cta: group("Closing call to action", {
        eyebrow: text("Label above the heading", 40, "Apply"),
        lines: lines("Heading", ["Bring your practice", "to more people."]),
        body: longText("Text", 300, "Applications are reviewed by a person, not a form filter.", { required: false }),
        joinLabel: text("Join button", 40, "Start your application", { help: "Goes to the application." }),
        secondary: link("Second button", { label: "Ask a question", href: "/support" }),
      }),
    },
  }),

  // ------------------------------------------------------ for institutions
  "for-institutions": section({
    id: "for-institutions",
    label: "For institutions",
    description: "Funded sessions for organisations, and why the people they support can trust it.",
    route: "/for-institutions",
    kind: "page",
    locked: [],
    fields: {
      intro: group("Top of the page", {
        ...intro(
          "For institutions",
          ["Support your people", "without surveilling", "them."],
          "Funded sessions for companies, universities, schools, NGOs and youth organisations — built so that the people you are supporting can actually trust it.",
        ),
        button: link("Button", { label: "Request a proposal", href: "/support?intent=organisation" }),
      }),
      audiences: group("Who it is for", {
        ...heading("Who it is for", ["Four kinds of", "organisation."]),
        items: cards(
          "Cards",
          [
            {
              title: "Companies",
              body: "Give employees confidential support for workplace stress, burnout and life outside work, without routing it through HR.",
            },
            {
              title: "Universities & schools",
              body: "Extend student wellbeing provision beyond a single overstretched provider, with support available outside office hours.",
            },
            {
              title: "NGOs & development partners",
              body: "Provide psychosocial support to beneficiaries and to the staff delivering difficult frontline work.",
            },
            {
              title: "Youth organisations",
              body: "Reach young people in the format they already use, on the device already in their hand.",
            },
          ],
          1,
          8,
        ),
      }),
      confidentiality: group("Confidentiality", {
        ...heading("The hard part", ["Confidentiality is", "not negotiable."]),
        lede: lede(
          "The single fastest way to kill a workplace wellbeing programme is for staff to suspect their manager can see who used it. So we made that structurally impossible rather than promising not to.",
        ),
        points: bullets(
          "Promises",
          [
            "You never see who booked a session, when, or with whom.",
            "You never see mood scores, journal entries or session content.",
            "Any reporting is aggregate only, and is held back entirely below a minimum group size.",
            "Members can leave your programme and keep their account and their data.",
          ],
          1,
          8,
        ),
      }),
      gettingStarted: group("Getting started", {
        ...heading("Getting started", ["Four steps to", "a live programme."]),
        steps: steps(
          [
            {
              title: "Tell us who you need to support",
              body: "How many people, what kind of pressures they face, and what you already have in place. We would rather complement existing provision than duplicate it.",
            },
            {
              title: "Agree what to fund",
              body: "Pay for sessions for the people you support — we will work out the details with you.",
            },
            {
              title: "Tell your people",
              body: "They join with their own private account — their data belongs to them, not to you.",
            },
            {
              title: "See whether it is working",
              body: "We can share anonymised, aggregate numbers once enough people take part — never who used it.",
            },
          ],
          2,
          8,
        ),
      }),
      beyond: group("What you get", {
        ...heading("What you get", ["Beyond the", "sessions."]),
        items: bullets(
          "Points",
          [
            "Access to the full verified provider directory, filterable by language and specialisation.",
            "The free wellbeing resource centre for every member, whether or not they ever book a session.",
            "Awareness material you can use internally to let people know the programme exists.",
            "A named contact at TALK for onboarding and ongoing questions.",
          ],
          1,
          8,
        ),
      }),
      faq: group("Questions", {
        ...heading("Questions", ["Common ones."]),
        items: questions([
          {
            q: "Will we be able to see which employees used it?",
            a: "No — and this is not a setting that can be turned on. If people believed their employer could see that they booked a session, they would not book one, and the programme would fail. Aggregate numbers are held back below a minimum group size so that small teams cannot be worked out.",
          },
          {
            q: "What does it cost?",
            a: "It depends on how many people you want to support and how many sessions you want to fund. Talk to us with a rough headcount and we will put a proposal together.",
          },
          {
            q: "Can we fund a pool of sessions rather than everyone?",
            a: "Yes. A pool of sessions that anyone you support can draw on works well when you expect a minority to use it but want it there for everyone. We will agree the details with you.",
          },
          {
            q: "Do you work with organisations outside The Gambia?",
            a: "Our provider network is currently Gambian, so the service is most useful for people in-country. Talk to us about regional needs and we will be straight with you about what we can cover today.",
          },
        ]),
      }),
      note: note(
        "Note for funders",
        "Funding through institutions is how we intend to reach people for whom cost is the barrier. If you are a funder or development partner interested in paying for access for many people at once, we would like to hear from you.",
      ),
      cta: ctaBlock({
        eyebrow: "Get in touch",
        lines: ["Tell us who you", "need to support."],
        body: "Send a rough headcount and what you already have in place, and we will come back with a proposal.",
        primary: { label: "Request a proposal", href: "/support?intent=organisation" },
        secondary: { label: "See pricing", href: "/plans" },
      }),
    },
  }),

  // ------------------------------------------------------------- providers
  providers: section({
    id: "providers",
    label: "Providers",
    description: "The top of the provider directory, and the band under it.",
    route: "/providers",
    kind: "page",
    locked: ["The filters, the provider cards and what shows when none match are part of the directory, set in code.", START_BUTTON_NOTE],
    fields: {
      intro: group("Top of the page", {
        ...intro(
          "Our providers",
          ["Find someone who", "understands you."],
          "Browse qualified providers by language, specialty and who you feel most comfortable with.",
        ),
        searchPlaceholder: text("Words in the search box", 60, "Search by name, specialty or language"),
      }),
      cta: ctaBand(
        ["Not sure who to choose?", "Let TALK match you."],
        "A short conversation — in English, Wolof, Mandinka or Pulaar — then providers who fit what you need.",
      ),
    },
  }),

  // ----------------------------------------------------------------- plans
  plans: section({
    id: "plans",
    label: "Pricing",
    description: "The three price cards (also on the front page), and the pricing page around them.",
    route: "/plans",
    kind: "page",
    locked: ["The emergency numbers under the price cards are set in code.", START_BUTTON_NOTE, PRICE_NOTE],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Pricing",
          ["Pay for", "what you use."],
          "No plans, no subscription — you pay for each conversation and each session, with mobile money or a card. Resources, mood check-ins and your journal are free. Minute for minute, a qualified person can cost less than TALK — on purpose.",
        ),
      ),
      first: group("First card: a first conversation", {
        eyebrow: text("Label", 40, "First conversation"),
        price: text("Price", 24, "{firstPrice}"),
        unit: text("Under the price", 40, "up to {firstMinutes} minutes"),
        body: longText("Text", 200, "A first, private talk with TALK, then providers who fit what you need."),
        points: bullets(
          "Points",
          ["English, Wolof, Mandinka or Pulaar", "Speak, or tap your answers", "Ends with providers matched to you"],
          1,
          5,
        ),
        button: text("Button", 40, "Begin with TALK"),
      }),
      provider: group("Middle card: sessions with a provider", {
        badge: text("Badge on top", 32, "Where TALK leads you"),
        eyebrow: text("Label", 40, "Sessions with a provider"),
        price: text("Price", 24, "From {providerFrom}"),
        unit: text("Under the price", 40, "per session"),
        body: longText("Text", 200, "A qualified provider, by video or voice call. Fee shown before you book."),
        points: bullets(
          "Points",
          ["Message your provider any time", "Video or voice calls in the app", "Mobile money or card"],
          1,
          5,
        ),
        button: text("Button", 40, "Find your provider", { help: "Goes to the provider directory." }),
      }),
      longer: group("Third card: a longer talk", {
        eyebrow: text("Label", 40, "A longer talk"),
        price: text("Price", 24, "{longerPrice}"),
        unit: text("Under the price", 40, "up to {longerMinutes} minutes"),
        body: longText("Text", 200, "More time with TALK, for when you're not ready to speak to a person."),
        points: bullets(
          "Points",
          [
            "The same four languages, spoken or typed",
            "{longerMinutes} minutes instead of {firstMinutes}",
            "Emergency numbers on screen if you need them",
          ],
          1,
          5,
        ),
        button: text("Button", 40, "Talk again"),
      }),
      note: note(
        "Note under the cards",
        "All prices are in Gambian Dalasi (D). Each conversation and each session is paid for on its own — TALK has no subscription and stores no card on file. The resource centre, mood check-ins and your journal are free.",
      ),
      organisations: group("For organisations", {
        ...heading("For organisations", ["Funding sessions", "for your people."]),
        lede: lede(
          "Companies, universities, schools, NGOs and youth organisations can pay for sessions for the people they support. Tell us who you need to support and we will work it out with you.",
        ),
        primary: link("Main button", { label: "For institutions", href: "/for-institutions" }),
        secondary: link("Second button", { label: "Talk to us", href: "/support" }),
      }),
      faq: group("Questions", {
        ...heading("Questions", ["Pricing, plainly."]),
        items: questions([
          {
            q: "Why can a provider cost less per minute than TALK?",
            a: "Deliberately. At {providerFrom} for 45 minutes, a provider costs less per minute than TALK. TALK is designed as a bridge, not a destination — a way to start when talking to a person feels like too much. Pricing it this way keeps a provider the more sensible choice for anyone who needs real support, which is the outcome we want.",
          },
          {
            q: "How do I pay?",
            a: "Payments are processed in Gambian Dalasi through Modem Pay, which supports mobile money and card payments. You pay per conversation and per session; there is no subscription and nothing recurring.",
          },
          {
            q: "What if I cannot afford a session?",
            a: "The resource centre, mood check-ins and your journal are free and always will be. We also want to work with institutions — universities, employers and NGOs — to fund sessions for the people they support, which is how we intend to reach people for whom cost is the barrier.",
          },
          {
            q: "Can I get a refund?",
            a: "If a session did not happen, tell us from Sessions within a day of it. A person checks, and if the provider did not come you get your money back in full. You can cancel any session before it starts; if you had already paid, write to us about a refund.",
          },
          {
            q: "Do providers set their own rates?",
            a: "Yes, within the {providerFrom} – {providerTo} range, based on their qualifications, specialisation and experience. The fee is shown on every profile before you book. TALK takes a service fee from each completed session.",
          },
        ]),
      }),
      cta: ctaBlock({
        lines: ["Start with", "what is free."],
        body: "Resources, mood check-ins and your journal cost nothing. When you want to talk, pay for that conversation — {firstPrice} for your first with TALK.",
        secondary: { label: "See how it works", href: "/how-it-works" },
      }),
    },
  }),

  // ---------------------------------------------------------------- safety
  safety: section({
    id: "safety",
    label: "Safety & ethics",
    description: "How TALK protects the people who use it. Emergency wording stays in code.",
    route: "/safety",
    kind: "page",
    locked: [
      "“TALK is not an emergency service”, the notice with the emergency numbers, and what happens if someone is at risk are set in code.",
    ],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Safety & ethics",
          ["Trust is", "the product."],
          "TALK handles some of the most sensitive information a person can share. Safety is treated as a foundational design requirement rather than something added once the features work.",
        ),
      ),
      commitments: group("Our commitments", {
        ...heading("Our commitments", ["Six things we hold", "ourselves to."]),
        items: cards(
          "Cards",
          [
            {
              title: "Professional verification",
              body: "Providers submit identity documents and qualification evidence before their profile can go live. An administrator reviews every application. An unverified profile is invisible to patients — not merely flagged.",
            },
            {
              title: "Human oversight of AI",
              body: "The AI companion supports; it does not treat. Its scope is explicit, its limits are stated on screen, and escalation to a human is built into the end of every conversation.",
            },
            {
              title: "Crisis escalation",
              body: "Where a conversation indicates possible immediate risk, emergency contacts are shown immediately and synchronously. We do not rely on a queue being watched to keep someone safe.",
            },
            {
              title: "Confidentiality by default",
              body: "Journal entries and mood check-ins are visible only to you. Providers see what you choose to share in a session, and nothing else.",
            },
            {
              title: "Reporting",
              body: "Any session, professional or interaction can be reported. Reports are reviewed, and a provider can be suspended from the directory pending investigation.",
            },
            {
              title: "Ongoing review",
              body: "AI responses are audited for safety, bias and cultural relevance. Safeguarding protocols are developed with clinical input rather than written by engineers alone.",
            },
          ],
          1,
          9,
        ),
      }),
      limits: group("Limits", {
        ...heading("Limits", ["What TALK", "cannot do."]),
        lede: lede("Being clear about this is part of being safe. A platform that overstates its reach puts people at risk."),
        items: list(
          "Limits",
          group("Limit", {
            lead: text("In bold", 80, ""),
            body: longText("Text", 400, ""),
          }),
          [
            {
              lead: "The AI cannot assess risk reliably.",
              body: "Automated detection misses things and over-triggers on others. It is a prompt to surface help, never a clinical judgement.",
            },
            {
              lead: "Verification is not a guarantee of outcome.",
              body: "We check that a provider is who they say they are and holds the qualifications they claim. We cannot guarantee that any particular professional is the right fit for you — and you are free to change.",
            },
          ],
          {
            min: 0,
            max: 6,
            itemLabel: "Limit",
            help: "“TALK is not an emergency service” is always shown first. It is set in code.",
          },
        ),
      }),
      cta: ctaBlock({
        eyebrow: "Related",
        lines: ["How your data", "is handled."],
        body: "Data minimisation, encryption, retention and your rights — written to be read.",
        primary: { label: "Privacy policy", href: "/privacy" },
        secondary: { label: "Report a concern", href: "/support" },
      }),
    },
  }),

  // ------------------------------------------------------------ technology
  technology: section({
    id: "technology",
    label: "Technology",
    description: "How TALK uses AI: what it does, what it will never do, and its principles.",
    route: "/technology",
    kind: "page",
    locked: ["The warning that TALK is not an emergency service, with the emergency numbers, is set in code."],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Technology",
          ["AI that knows", "what it is not."],
          "TALK uses AI as an accessibility layer — a way to make the first step smaller. It is not a therapist, it does not pretend to be, and the whole design is built around that distinction.",
        ),
      ),
      scope: group("Scope", {
        ...heading("Scope", ["Drawn deliberately", "narrow."]),
        lede: lede("The most important thing about a mental health AI is the list of things it refuses to do."),
        canLabel: text("Heading of the first list", 48, "What the companion does"),
        can: bullets(
          "What it does",
          [
            "Emotional check-ins and guided reflection",
            "Journalling prompts",
            "Stress-management, breathing and grounding exercises",
            "General psychoeducation about wellbeing",
            "Helping you identify what kind of support might help",
            "Guiding you toward booking a human provider",
          ],
          1,
          10,
        ),
        cannotLabel: text("Heading of the second list", 48, "What it will never do"),
        cannot: bullets(
          "What it will never do",
          [
            "Diagnose a mental health condition",
            "Prescribe or recommend treatment or medication",
            "Represent itself as a human therapist",
            "Replace a qualified professional",
            "Respond to an emergency",
            "Use what you share to train advertising models",
          ],
          1,
          10,
        ),
      }),
      principles: group("Principles", {
        ...heading("Principles", ["Safety is a design", "requirement, not", "a feature."]),
        lede: lede("Because TALK operates in the mental wellbeing space, these are foundational rather than secondary."),
        items: cards(
          "Cards",
          [
            {
              title: "Human oversight",
              body: "AI complements professional support; it does not stand in for a practitioner. Qualified humans remain central to counselling and to any higher-risk situation.",
            },
            {
              title: "Clear disclosure",
              body: "You always know when you are talking to AI. It is labelled on screen throughout the conversation, not buried in terms you agreed to once.",
            },
            {
              title: "Crisis escalation",
              body: "Where a conversation suggests possible danger, TALK says the emergency numbers out loud and keeps them on screen, with tap-to-call, for the rest of the conversation.",
            },
            {
              title: "Defined boundaries",
              body: "The companion operates inside an explicit scope. When a question falls outside it, it says so and points toward a professional.",
            },
            {
              title: "Responsible governance",
              body: "AI outputs are reviewed for safety, bias, cultural relevance and potentially harmful responses — an ongoing process, not a launch checklist.",
            },
            {
              title: "Language and context",
              body: "Support should not require speaking English. TALK speaks English, Wolof, Mandinka and Pulaar — the Gambian way, with English words mixed in, as people really talk.",
            },
          ],
          1,
          9,
        ),
      }),
      honesty: group("Honesty", {
        ...heading("Honesty", ["What we are still", "working on."]),
        paragraphs: paragraphs(
          "Paragraphs",
          [
            "TALK speaks Wolof, Mandinka and Pulaar as well as English, but voice AI in these languages is still young. She can mishear, or choose an odd word, so the English can be shown under every line, and you can ask her to change language at any time. Her fixed Wolof, Mandinka and Pulaar wording — the consent she reads out, and the recorded Wolof lines — is still a draft, waiting to be checked by a Gambian translator.",
            "AI safety detection is imperfect. It can miss genuine distress and it can flag ordinary turns of phrase. That is why the emergency contacts are linked from TALK’s own screen at all times, whatever the model decides.",
            "The words of your conversation with TALK are not saved — only what she learns to match you. Messages with your provider are encrypted in transit and at rest. They are not end-to-end encrypted — our infrastructure provider holds the keys. We would rather state that plainly than imply a stronger guarantee than we can deliver.",
          ],
          1,
          6,
        ),
      }),
      cta: ctaBlock({
        eyebrow: "Read more",
        lines: ["How we handle", "what you share."],
        body: "Our safety and privacy commitments, in plain language.",
        primary: { label: "Safety & ethics", href: "/safety" },
        secondary: { label: "Privacy policy", href: "/privacy" },
      }),
    },
  }),

  // ------------------------------------------------------------- community
  community: section({
    id: "community",
    label: "Community",
    description: "Moderated peer support: what is planned, the ground rules, and what is here today.",
    route: "/community",
    kind: "page",
    locked: [],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Community",
          ["Not yet — and", "that is deliberate."],
          "Moderated peer support is on the TALK roadmap. It is not live, because an unmoderated mental health community causes more harm than it prevents, and we would rather build it properly than quickly.",
        ),
      ),
      planning: group("What we are planning", {
        ...heading("What we are planning", ["Four commitments", "we are designing", "around."]),
        lede: lede(
          "Peer support is genuinely valuable — hearing from someone who has been where you are does something a professional cannot. But the format has to earn that.",
        ),
        items: cards(
          "Cards",
          [
            {
              title: "Anonymous by default",
              body: "No real names, no profile photos, no connection to your counselling history. Peer support only works if people can be honest without being identifiable.",
            },
            {
              title: "Professionally moderated",
              body: "Moderated by qualified practitioners, not volunteers. An unmoderated mental health forum does real harm, and we would rather not launch than launch that.",
            },
            {
              title: "Topic-based, not open-ended",
              body: "Spaces organised around specific experiences — grief, academic pressure, workplace stress — rather than one general feed where everything competes.",
            },
            {
              title: "Escalation built in",
              body: "The same crisis pathway as the rest of the platform. A post indicating risk surfaces emergency resources immediately and reaches a moderator.",
            },
          ],
          1,
          8,
        ),
      }),
      groundRules: group("Ground rules", {
        ...heading("Ground rules", ["Decided before", "we build it."]),
        lede: lede(
          "Writing the rules after a community exists means writing them in response to something that already went wrong.",
        ),
        items: bullets(
          "Rules",
          [
            "Nobody's counselling history is ever visible in a community space.",
            "Moderators are qualified practitioners, and are identified as such.",
            "No advice-giving between peers on medication or treatment.",
            "Reporting a post is one tap, and reports are read by a person.",
            "Spaces stay small enough to be genuinely moderated.",
          ],
          1,
          10,
        ),
      }),
      meantime: group("In the meantime", {
        ...heading("In the meantime", ["What is available", "today."]),
        paragraphs: paragraphs(
          "Paragraphs",
          [
            "The wellbeing resource centre is free and open to everyone, with no account required. Mood check-ins and the private journal are also free once you have an account.",
            "If you want to talk to someone, the provider directory is browsable without signing up, so you can see who is available and what they charge before committing to anything.",
          ],
          1,
          4,
        ),
        note: note(
          "Note",
          "Want to be told when community spaces open? Send us a message through support and we will let you know.",
        ),
      }),
      cta: ctaBlock({
        eyebrow: "Today",
        lines: ["Start with what", "is already here."],
        body: "Free resources, private wellbeing tools, and verified providers.",
        primary: { label: "Browse resources", href: "/resources" },
        secondary: { label: "Tell me when it launches", href: "/support" },
      }),
    },
  }),

  // --------------------------------------------------------------- support
  support: section({
    id: "support",
    label: "Support",
    description: "The contact page: its introduction, the links beside the form, and quick answers.",
    route: "/support",
    kind: "page",
    locked: ["The emergency notice beside the form, and the form itself, are set in code."],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Support",
          ["Ask us anything."],
          "Questions about your account, a booking, joining as a provider, or bringing TALK to your organisation — this reaches a person.",
        ),
      ),
      form: group("The form", heading("Get in touch", ["Send us a message."])),
      also: group("Beside the form", {
        eyebrow: text("Label", 40, "You might also want"),
        links: list(
          "Links",
          link("Link", { label: "", href: "/" }),
          [
            { label: "How TALK works", href: "/how-it-works" },
            { label: "Pricing", href: "/plans" },
            { label: "Joining as a provider", href: "/for-providers" },
            { label: "How we handle your data", href: "/privacy" },
          ],
          { min: 0, max: 8, itemLabel: "Link" },
        ),
      }),
      faq: group("Questions", {
        ...heading("Before you write", ["Quick answers."]),
        items: questions([
          {
            q: "How quickly will you reply?",
            a: "We aim to reply within two working days. This inbox is not monitored around the clock, so please do not use it for anything urgent.",
          },
          {
            q: "I want to report a provider or a session.",
            a: "Choose 'Reporting a concern' above and tell us what happened. Reports are reviewed by an administrator, and a provider can be suspended from the directory while we investigate.",
          },
          {
            q: "I need to delete my account and my data.",
            a: "You can do this yourself from Settings once signed in — it removes your profile, journal entries and mood history. If you are having trouble, write to us and we will handle it.",
          },
          {
            q: "Can I get support in Wolof, Mandinka or Pulaar?",
            a: "Yes. TALK speaks all three, as well as English, and you can filter the provider directory by language to find providers who work in them. Write to us in whichever is easiest, and we will do our best to reply in it.",
          },
        ]),
      }),
    },
  }),

  // ------------------------------------------------------------- resources
  resources: section({
    id: "resources",
    label: "Resources",
    description: "The top of the resource centre and the note under the library.",
    route: "/resources",
    kind: "page",
    locked: ["The articles and exercises have an editor of their own, under Resource centre."],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Resource centre",
          ["Free, and", "free to browse."],
          "Practical material on the things people actually carry — stress, grief, sleep, study pressure, and the ordinary difficulty of managing your own head. No account required.",
        ),
      ),
      note: note(
        "Note under the library",
        "These resources are general information, not medical advice or treatment. They are not a substitute for speaking with a qualified professional about your own situation.",
      ),
      cta: ctaBlock({
        eyebrow: "Beyond reading",
        lines: ["Some things need", "a conversation."],
        body: "When an article is not enough, you can book a session with a verified provider.",
        primary: { label: "Find a provider", href: "/providers" },
        secondary: { label: "See pricing", href: "/plans" },
      }),
    },
  }),

  // --------------------------------------------------------------- privacy
  privacy: section({
    id: "privacy",
    label: "Privacy policy",
    description: "The privacy policy, in full.",
    route: "/privacy",
    kind: "page",
    locked: [],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Privacy",
          ["If you cannot trust", "us with it, you", "will not share it."],
          "How we collect, use, protect and delete your information. Last updated 14 October 2026.",
        ),
        "Change the date in the introduction whenever the policy changes.",
      ),
      body: richText(
        "The policy",
        20000,
        prose([
          {
            heading: "What we collect, and why",
            body: [
              "We collect only what we need to run the service. That means your account details (name, email, and a profile photo if you add one), anything you choose to record in the platform (mood check-ins, journal entries, messages to your provider), what TALK learns about you to find you the right provider, booking and payment records, and basic technical information such as the device and browser you use.",
              "We use this to provide the service, to connect you with providers, to process payments, and to keep the platform safe. We do not use it for anything else.",
              "We do not sell your information. We do not share it with advertisers. Sensitive details you share with the AI companion or with a provider are never repurposed for marketing.",
            ],
          },
          {
            heading: "Who can see what",
            body: [
              "Your journal entries and mood check-ins are visible only to you. Providers cannot read them. Administrators cannot read them. They are stored under your account and the access rules enforce that at the database level, not merely in the interface.",
              "A provider sees what you share during a session, the messages you send them, and any note you attach to a booking.",
              "When institutional funding launches and an organisation pays for your sessions, it will never see who booked a session, when, or with whom. Any reporting to organisations will be aggregate, and suppressed entirely for small groups so that individuals cannot be identified.",
            ],
          },
          {
            heading: "How your information is protected",
            body: [
              "Your data is encrypted in transit and at rest. Access to sensitive records is restricted on a need-to-know basis and protected by secure authentication.",
              "To be precise about what this does not mean: your data is not end-to-end encrypted. Our infrastructure provider holds the encryption keys, which means that — in principle — data could be accessed by us or by them under legal compulsion. We would rather state that plainly than imply a stronger guarantee than we can deliver.",
            ],
          },
          {
            heading: "AI processing",
            body: [
              "Conversations with TALK are processed by a third-party AI provider so she can hear you and reply. The words themselves are not saved. What she learns to match you — the name you go by, your language, age range, area and gender, what you are going through, and the help you are looking for — is saved to your account, and deleted with it.",
              "The AI companion is always labelled as AI. It does not diagnose, prescribe or claim to be human.",
              "Where a conversation suggests possible immediate risk, TALK gives you the emergency numbers straight away. Nothing about it is sent to anyone.",
            ],
          },
          {
            heading: "Payments",
            body: [
              "Payments are processed by Modem Pay, a payment provider licensed by the Central Bank of The Gambia. We do not receive or store your full card details.",
              "We keep a record of what you paid for and when, because we are obliged to and because you need to be able to see your own history.",
            ],
          },
          {
            heading: "Your rights",
            body: [
              "You can see what we hold about you, correct it, export it, or delete it. Account deletion and data export are available from your settings — you do not need to ask us.",
              "Where a feature relies on optional processing, such as personal wellbeing insights, participation is separately consented to and you can withdraw that consent without losing the rest of the service.",
              "Where we are legally required to retain certain records — payment records, for example — those are kept for the required period and then deleted.",
            ],
          },
          {
            heading: "How long we keep things",
            body: [
              "We keep your account data for as long as your account is open. When you delete your account, your profile, what TALK learned about you, journal entries and mood history are deleted.",
              "Records we are obliged to retain, such as transaction records, are kept for the statutory period. Anonymised, aggregated statistics that cannot be linked back to you may be retained.",
            ],
          },
          {
            heading: "Third parties",
            body: [
              "We use a small number of providers to deliver the service: cloud infrastructure and database hosting, an AI provider for the companion, and a payment processor. Each is bound by an agreement that limits how they may use, store or share your data.",
              "We do not permit any of them to use your information for their own purposes.",
            ],
          },
          {
            heading: "If something goes wrong",
            body: [
              "We maintain an incident response plan. If we suspect a data breach, we investigate promptly, contain it, and notify affected users and — where required — regulators, in a timely and transparent way.",
            ],
          },
          {
            heading: "Legal basis and jurisdiction",
            body: [
              "TALK is designed to comply with The Gambia's Data Protection and Privacy Act, drawing on internationally recognised data protection standards where local guidance is still developing.",
              "If you have a concern about how your data is handled, contact us and we will respond.",
            ],
          },
        ]),
        { headings: true, help: "Start each part with “## ” and its heading." },
      ),
      note: richText(
        "Note under the policy",
        600,
        "This policy is written to be read rather than to satisfy a lawyer. If anything here is unclear, or you want the detail behind a specific point, [ask us](/support) and we will explain it.",
      ),
      cta: ctaBlock({
        eyebrow: "Related",
        lines: ["Our safety", "commitments."],
        body: "Professional verification, what happens in a crisis, AI boundaries and human oversight.",
        primary: { label: "Safety & ethics", href: "/safety" },
        secondary: { label: "Terms of service", href: "/terms" },
      }),
    },
  }),

  // ----------------------------------------------------------------- terms
  terms: section({
    id: "terms",
    label: "Terms of service",
    description: "The terms of service, in full.",
    route: "/terms",
    kind: "page",
    locked: ["The emergency notice at the top of the terms is set in code."],
    fields: {
      intro: group(
        "Top of the page",
        intro(
          "Terms",
          ["The agreement,", "in plain words."],
          "What the service is, what it is not, and what is expected on both sides. Last updated 14 October 2026.",
        ),
        "Change the date in the introduction whenever the terms change.",
      ),
      body: richText(
        "The terms",
        20000,
        prose([
          {
            heading: "What TALK is",
            body: [
              "TALK is a digital platform that provides wellbeing resources, an AI-assisted support companion, and access to independent providers and psychosocial support professionals.",
              "TALK is a platform. Providers on TALK practise independently — they are not employees or agents of TALK, and the professional relationship in a session is between you and them.",
            ],
          },
          {
            heading: "What TALK is not",
            body: [
              "TALK is not an emergency service. Nobody monitors the platform continuously, and submitting anything here will not summon help. If you or someone else is in immediate danger, contact the emergency services directly.",
              "The AI companion is not a therapist and does not provide medical advice, diagnosis or treatment. It is a supportive tool, clearly labelled as AI throughout.",
              "Resources published on TALK are general information. They are not a substitute for professional assessment of your own situation.",
            ],
          },
          {
            heading: "Using the platform",
            body: [
              "You must be able to enter into a binding agreement to use TALK. Where you are under the age of majority, you should have the involvement of a parent or guardian.",
              "You agree to provide accurate account information, to keep your login credentials secure, and not to share your account with anyone else.",
              "You agree not to misuse the platform — including harassing providers or other users, misrepresenting your identity, attempting to access data that is not yours, or using the service for any unlawful purpose.",
            ],
          },
          {
            heading: "Providers",
            body: [
              "Providers are verified before appearing in the directory: we check identity and evidence of qualifications. Verification confirms credentials; it is not a guarantee of any particular outcome, and it does not make TALK responsible for the clinical judgement of an independent professional.",
              "Providers remain responsible for their own professional registration, insurance, record-keeping and adherence to their professional obligations.",
              "If you have a concern about a professional on TALK, report it. We review reports and may suspend a provider from the directory while we investigate.",
            ],
          },
          {
            heading: "Bookings, payments and cancellations",
            body: [
              "Session fees are set by each provider within the platform's published range and are shown before you book. TALK retains a service fee from each completed session.",
              "You pay for a session after booking it, before it takes place. If a provider does not attend, tell us within 24 hours of the session; once a person has checked, you are refunded in full.",
              "You may cancel a session at any time before it starts. If you had already paid, contact us about a refund.",
              "Conversations with TALK are paid for one at a time, at the prices on our pricing page. There is no subscription.",
            ],
          },
          {
            heading: "Confidentiality and its limits",
            body: [
              "What you share in a session is confidential between you and your provider, and your private wellbeing data is visible only to you.",
              "There are limits, which any professional will explain: where there is a serious and imminent risk to your life or someone else's, or where disclosure is required by law, a professional may have an obligation to act.",
            ],
          },
          {
            heading: "Your content",
            body: [
              "Anything you write in the platform — journal entries, messages — remains yours. You grant TALK only the permission needed to store it and show it back to you and, where you choose, to your provider.",
              "You can export or delete your content at any time from your settings.",
            ],
          },
          {
            heading: "Availability",
            body: [
              "We work to keep TALK available but cannot guarantee uninterrupted service. Sessions depend on your internet connection and device as well as ours.",
              "We may change, suspend or discontinue parts of the service. Where a change materially affects you, we will give reasonable notice.",
            ],
          },
          {
            heading: "Liability",
            body: [
              "To the extent permitted by law, TALK is not liable for the clinical judgement, conduct or outcomes of independent professionals practising through the platform, nor for decisions you take based on general wellbeing information published here.",
              "Nothing in these terms limits liability that cannot lawfully be limited.",
            ],
          },
          {
            heading: "Ending your use",
            body: [
              "You can close your account at any time from your settings.",
              "We may suspend or close an account that breaches these terms, that puts other users or professionals at risk, or where we are required to do so by law.",
            ],
          },
          {
            heading: "Governing law",
            body: ["These terms are governed by the laws of The Gambia."],
          },
        ]),
        { headings: true, help: "Start each part with “## ” and its heading." },
      ),
      cta: ctaBlock({
        eyebrow: "Related",
        lines: ["How your data", "is handled."],
        primary: { label: "Privacy policy", href: "/privacy" },
        secondary: { label: "Ask a question", href: "/support" },
      }),
    },
  }),

  // ---------------------------------------------------------------- header
  header: section({
    id: "header",
    label: "Header",
    description: "The links and buttons along the top of every public page, and in its menu.",
    route: null,
    kind: "site",
    locked: [
      "Where each link goes is set in code; only the words change here.",
      "The menu's link to the emergency numbers is set in code.",
    ],
    fields: {
      primary: group("Links along the top", {
        providers: navLabel("Providers"),
        howItWorks: navLabel("How it works"),
        pricing: navLabel("Pricing"),
        support: navLabel("Support"),
      }),
      more: group("More, in the menu", {
        resources: navLabel("Resources"),
        about: navLabel("About"),
        safety: navLabel("Safety & ethics"),
        forProviders: navLabel("For providers"),
        forInstitutions: navLabel("For institutions"),
        community: navLabel("Community"),
      }),
      actions: group("Buttons", {
        begin: text("Start button", 30, "Begin with TALK"),
        dashboard: text("Start button, signed in", 30, "Your dashboard"),
        signIn: text("Sign in link", 30, "Sign in"),
        dashboardShort: text("Sign in link, signed in", 30, "Dashboard"),
        moreHeading: text("Label over the menu's other links", 30, "More"),
      }),
    },
  }),

  // ---------------------------------------------------------------- footer
  footer: section({
    id: "footer",
    label: "Footer",
    description: "The dark band at the foot of every public page.",
    route: null,
    kind: "site",
    locked: [
      "Where each link goes is set in code; only the words change here.",
      "The emergency contacts link and the web address are set in code.",
    ],
    fields: {
      words: list("The four words under TALK", text("Word", 20, ""), ["LISTEN", "SUPPORT", "HEAL", "GROW"], {
        min: 1,
        max: 6,
        itemLabel: "Word",
      }),
      more: group("Links under the words", {
        providers: navLabel("Providers"),
        howItWorks: navLabel("How it works"),
        pricing: navLabel("Pricing"),
        resources: navLabel("Resources"),
        about: navLabel("About"),
        forProviders: navLabel("For providers"),
      }),
      legal: group("Links on the right", {
        privacy: navLabel("Privacy"),
        terms: navLabel("Terms"),
        support: navLabel("Support"),
        community: navLabel("Community"),
      }),
    },
  }),

  // ------------------------------------------------------------------- seo
  seo: section({
    id: "seo",
    label: "Page titles and descriptions",
    description: "What search engines and browser tabs show for each page.",
    route: null,
    kind: "site",
    locked: ["Every title is followed by “· TALK” in the browser tab.", "The emergency contacts page keeps its own title."],
    fields: {
      home: seoFields(
        "Front page (and the default)",
        "TALK — listen, support, heal, grow",
        "Private conversations with TALK and qualified providers, in English, Wolof, Mandinka or Pulaar. Culturally rooted mental wellbeing support for The Gambia.",
        "Shown in full on the front page, and for any page without a title of its own.",
      ),
      about: seoFields(
        "About",
        "About",
        "TALK is a mental wellbeing and psychosocial support platform for The Gambia — built so that asking for help becomes easier.",
      ),
      "how-it-works": seoFields(
        "How it works",
        "How it works",
        "From a difficult day to a session with a qualified provider — how TALK brings together an AI companion, human providers and free wellbeing resources.",
      ),
      "for-providers": seoFields(
        "For providers",
        "For providers",
        "Join TALK as a verified provider. Set your own rate, manage your availability, and reach people who would not otherwise walk through a door.",
      ),
      "for-institutions": seoFields(
        "For institutions",
        "For institutions",
        "Fund sessions for the people you support — companies, universities, schools, NGOs and youth organisations in The Gambia — without seeing who used them.",
      ),
      providers: seoFields(
        "Providers",
        "Find a provider",
        "Browse credential-verified providers and psychosocial support professionals in The Gambia. Filter by language, specialty and who you feel most comfortable with.",
      ),
      plans: seoFields(
        "Pricing",
        "Pricing",
        "No plans, no subscription — pay per conversation. Free wellbeing resources, TALK from {firstPrice}, and providers from {providerFrom}. Prices in Gambian Dalasi.",
      ),
      safety: seoFields(
        "Safety & ethics",
        "Safety & ethics",
        "How TALK protects the people who use it — professional verification, crisis escalation, AI boundaries and human oversight.",
      ),
      technology: seoFields(
        "Technology",
        "Technology",
        "How TALK uses AI — what it does, what it deliberately does not do, and the boundaries it operates within.",
      ),
      community: seoFields(
        "Community",
        "Community",
        "Moderated peer support is on the TALK roadmap. Here is what we are planning, and why we are taking our time over it.",
      ),
      support: seoFields(
        "Support",
        "Support",
        "Get in touch with the TALK team — questions about your account, bookings, joining as a provider, or funding sessions for your organisation.",
      ),
      resources: seoFields(
        "Resources",
        "Wellbeing resources",
        "Free articles and exercises on stress, grief, sleep, academic pressure and emotional regulation. No account needed.",
      ),
      privacy: seoFields(
        "Privacy policy",
        "Privacy policy",
        "How TALK collects, uses, stores and deletes your information — written to be read, not to be skipped.",
      ),
      terms: seoFields(
        "Terms of service",
        "Terms of service",
        "The terms on which TALK is provided — what the service is, what it is not, and the responsibilities on both sides.",
      ),
    },
  }),

  // ----------------------------------------------------------------- theme
  theme: section({
    id: "theme",
    label: "Colours",
    description: "The site's palette. Checked for readable contrast before it can go live.",
    route: "/",
    kind: "site",
    locked: ["The colours for confirmed, warning and danger messages, and the fonts, are set in code."],
    fields: {
      colors: group("Colours", {
        background: color("background", "Page background"),
        cream: color("cream", "Cream", "Bands, the menu, and text on dark brown."),
        sand: color("sand", "Sand", "Hover and quiet fills."),
        surface: color("surface", "Cards"),
        foreground: color("foreground", "Text"),
        muted: color("muted", "Quieter text"),
        accent: color("accent", "Terracotta", "Buttons, labels and the zigzag."),
        "accent-soft": color("accent-soft", "Soft terracotta"),
        "accent-deep": color("accent-deep", "Deep terracotta", "Buttons when pointed at."),
        peach: color("peach", "Peach"),
        sage: color("sage", "Sage", "Arches and the second line of headings."),
        "sage-deep": color("sage-deep", "Deep sage"),
        "sage-soft": color("sage-soft", "Soft sage"),
        "sage-pale": color("sage-pale", "Pale sage"),
        dark: color("dark", "Dark brown", "The footer, dark bands and outlines. Shadows follow it."),
        stage: color("stage", "TALK's screen", "Behind TALK while she talks."),
      }),
    },
  }),
} as const;

function seoFields(label: string, title: string, description: string, help?: string) {
  return group(
    label,
    {
      title: text("Title", 60, title, { help: "At most 60 letters." }),
      description: longText("Description", 160, description, { help: "At most 160 letters." }),
    },
    help,
  );
}

// ------------------------------------------------------------- section types

export type SectionId = keyof typeof SECTIONS;

/** The sections in the order the editor lists them. */
export const SECTION_IDS = Object.keys(SECTIONS) as SectionId[];

export type PageSectionId = {
  [S in SectionId]: (typeof SECTIONS)[S]["kind"] extends "page" ? S : never;
}[SectionId];

/** The pages with their own title and description in the seo section. */
export type SeoPageId = keyof (typeof SECTIONS)["seo"]["fields"];

/** What getContent(id) returns for a section. */
export type ContentOf<S extends SectionId> = ValueOf<GroupField<(typeof SECTIONS)[S]["fields"]>>;

export type HomeContent = ContentOf<"home">;
export type HeaderContent = ContentOf<"header">;
export type FooterContent = ContentOf<"footer">;
export type SeoContent = ContentOf<"seo">;
export type ThemeContent = ContentOf<"theme">;

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SECTIONS, value);
}

export function sectionDef<S extends SectionId>(id: S): (typeof SECTIONS)[S] {
  return SECTIONS[id];
}

/** The next cache tag for a section's published content. */
export function contentTag(id: SectionId): string {
  return `content:${id}`;
}

function defaultOf(field: Field): unknown {
  switch (field.kind) {
    case "group": {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(field.fields)) out[key] = defaultOf(child);
      return out;
    }
    case "list":
      return JSON.parse(JSON.stringify(field.default));
    case "image":
    case "link":
      return { ...field.default };
    default:
      return field.default;
  }
}

/** A field's starting value: the default for a field on the page, a blank for a new list item. */
export function fieldDefault<F extends Field>(field: F): ValueOf<F> {
  return defaultOf(field) as ValueOf<F>;
}

/** A section as the site shows it with nothing published. A fresh copy every call. */
export function defaultContent<S extends SectionId>(id: S): ContentOf<S> {
  return defaultOf(group(SECTIONS[id].label, SECTIONS[id].fields)) as ContentOf<S>;
}

// ------------------------------------------------------------ stored shapes

/**
 * siteContent/{sectionId}: what the public site shows. `data` null means the
 * built-in defaults, put back by reverting to before the first publish.
 */
export type PublishedDoc = { data: Record<string, unknown> | null; rev: number; publishedAt: number };

/** siteContentDrafts/{sectionId}: work in progress, saved as staff type. */
export type DraftDoc = {
  data: Record<string, unknown>;
  /** The published rev this draft started from — to say "live has changed since". */
  baseRev: number;
  updatedAt: number;
  updatedBy: string;
};

/**
 * siteContentVersions/{autoId}: what a publish or a revert replaced, so it can
 * be put back. `data` null means the built-in defaults were showing.
 */
export type ContentVersion = {
  id: string;
  sectionId: SectionId;
  data: Record<string, unknown> | null;
  rev: number;
  publishedAt: number | null;
  replacedAt: number;
  replacedBy: string;
  action: "publish" | "revert";
  note: string | null;
};
