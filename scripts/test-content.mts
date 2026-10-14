/**
 * Unit test for the site content layer (app/lib/content).
 *
 *   cd functions && npm run build && cd .. && node scripts/test-content.mts
 *
 * Runs the COMPILED copies in functions/lib — the ones publishContent actually
 * executes — for everything shared with the functions. (Node's own
 * TypeScript runner cannot follow their imports, which have no file
 * extension.) The REST decoder imports nothing and runs from source.
 *
 * What it holds the content layer to:
 *   - every default validates, so the site as it is today can be published;
 *   - a price is never typed in, only placeholders, and they fill in with
 *     what the checkout charges;
 *   - links go to this site or https, never javascript: and friends;
 *   - rich text cannot become HTML or a script;
 *   - a palette cannot make the text harder to read than it is today;
 *   - lists keep their limits, and a bad stored value shows its default;
 *   - the resource centre shows its starter articles until staff change one,
 *     an article taken down stays down, two never share an address, and an
 *     article is held to the same rules as a page.
 */

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { decodeFields, documentId } from "../app/lib/content/firestoreRest.ts";

const require = createRequire(import.meta.url);
const schema = require("../functions/lib/app/lib/content/schema.js") as typeof import("../app/lib/content/schema.ts");
const validate = require("../functions/lib/app/lib/content/validate.js") as typeof import("../app/lib/content/validate.ts");
const tokens = require("../functions/lib/app/lib/content/tokens.js") as typeof import("../app/lib/content/tokens.ts");
const theme = require("../functions/lib/app/lib/content/theme.js") as typeof import("../app/lib/content/theme.ts");
const links = require("../functions/lib/app/lib/content/links.js") as typeof import("../app/lib/content/links.ts");
const markdown = require("../functions/lib/app/lib/content/markdown.js") as typeof import("../app/lib/content/markdown.ts");
const models = require("../functions/lib/app/lib/models.js") as typeof import("../app/lib/models.ts");
const money = require("../functions/lib/app/lib/money.js") as typeof import("../app/lib/money.ts");
const resources = require("../functions/lib/app/lib/content/resources.js") as typeof import("../app/lib/content/resources.ts");
const seeds = require("../functions/lib/app/lib/resources-seed.js") as typeof import("../app/lib/resources-seed.ts");

const { SECTIONS, SECTION_IDS, BUILT_IN_IMAGES, defaultContent, siteMediaUrl, mediaIdFromUrl } = schema;
const { validateSection, mergeSection, shapeSection, checkCopy, mediaIdsIn } = validate;
const { fillTokens, fillContent } = tokens;
const { THEME_DEFAULTS, THEME_TOKENS, checkTheme, themeCss } = theme;
const { checkHref } = links;
const { parseRichText } = markdown;
const { AI_TIERS, HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR } = models;
const { formatDalasi, formatDalasiRange, PLATFORM_FEE_RATE } = money;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

type SectionId = import("../app/lib/content/schema.ts").SectionId;
type ContentOf<S extends SectionId> = import("../app/lib/content/schema.ts").ContentOf<S>;

/** A fresh copy of a section's defaults, to break in one place. */
function withDefaults<S extends SectionId>(id: S, change: (data: ContentOf<S>) => void): ContentOf<S> {
  const data = defaultContent(id);
  change(data);
  return data;
}

function errorKeys(id: SectionId, data: unknown): string[] {
  return validateSection(id, data).errors.map((e) => e.key);
}

// --- every default validates --------------------------------------------------
for (const id of SECTION_IDS) {
  const result = validateSection(id, defaultContent(id));
  check(
    `defaults of "${id}" validate`,
    result.ok,
    result.errors.map((e) => `${e.key}: ${e.message}`).join(" | "),
  );
  check(`section "${id}" knows its own id`, SECTIONS[id].id === id);
}

// The drafts rule lists the sections by name; it must list exactly these.
{
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const listed = /function contentSections\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules)?.[1] ?? "";
  const names = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  check(
    "firestore.rules contentSections() matches SECTIONS",
    names.length === SECTION_IDS.length && SECTION_IDS.every((id) => names.includes(id)),
    `rules: ${names.join(",")}`,
  );
}

// --- the palette's defaults are globals.css's ---------------------------------
{
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("@theme"));
  for (const token of THEME_TOKENS) {
    const value = new RegExp(`--${token}:\\s*(#[0-9A-Fa-f]{6})`).exec(root)?.[1];
    check(`theme default ${token} is globals.css's`, value?.toUpperCase() === THEME_DEFAULTS[token], `css ${value}`);
  }
}

// --- built-in pictures exist, and every default picture is one of them --------
for (const src of BUILT_IN_IMAGES) {
  const file = new URL(`../public${src}`, import.meta.url);
  check(`built-in picture ${src} exists`, existsSync(file));
  // A real WebP passes the same signature check an upload does.
  if (existsSync(file)) check(`built-in picture ${src} reads as a WebP`, schema.mediaTypeOf(readFileSync(file).subarray(0, 16)) === "image/webp");
}

// --- placeholders -------------------------------------------------------------
{
  const first = AI_TIERS.initial;
  const longer = AI_TIERS.extended;
  check(
    "placeholders fill with the checkout's prices",
    fillTokens("{firstPrice} for {firstMinutes}, {longerPrice} for {longerMinutes}, {providerFrom} – {providerTo}, {feePercent}%") ===
      `${formatDalasi(first.amountMinor)} for ${first.durationSec / 60}, ${formatDalasi(longer.amountMinor)} for ${longer.durationSec / 60}, ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)}, ${Math.round(PLATFORM_FEE_RATE * 100)}%`,
  );
  check("an unknown placeholder is left as typed", fillTokens("{price} {firstPrice}") === `{price} ${formatDalasi(first.amountMinor)}`);

  // The filled defaults are the sentences the pages used to build in code.
  const home = fillContent(defaultContent("home"));
  check("home's third fact is the first price", home.hero.facts[2].value === formatDalasi(first.amountMinor));
  check(
    "home's first answer reads as it did",
    home.faq.items[0].a ===
      `You talk with TALK for up to ${first.durationSec / 60} minutes — in English, Wolof, Mandinka or Pulaar — by voice or by tapping. It costs ${formatDalasi(first.amountMinor)}. TALK then introduces you to providers who fit.`,
  );
  const plans = fillContent(defaultContent("plans"));
  check(
    "pricing's provider card reads as it did",
    plans.provider.price === `From ${formatDalasi(HUMAN_RATE_MIN_MINOR)}`,
  );
  check(
    "pricing's longer card point reads as it did",
    plans.longer.points[1] === `${longer.durationSec / 60} minutes instead of ${first.durationSec / 60}`,
  );
  const forProviders = fillContent(defaultContent("for-providers"));
  check(
    "for-providers' rate card reads as it did",
    forProviders.why.benefits[0].body ===
      `Choose a session fee between ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)} based on your qualifications, specialisation and experience.`,
  );
  check(
    "for-providers' fee answer reads as it did",
    forProviders.faq.items[1].a ===
      `TALK retains a ${Math.round(PLATFORM_FEE_RATE * 100)}% service fee on each completed session, which covers payment processing, the platform, verification and support. The remainder is yours.`,
  );
  const seo = fillContent(defaultContent("seo"));
  check("every page description is at most 160 once filled", Object.values(seo).every((p) => p.description.length <= 160));
}

// --- copy rules ---------------------------------------------------------------
const priceLiterals = ["Only D200 today", "From D 700", "D3,000 a session", "GMD 500", "500 dalasi", "costs 1,000 Dalasis"];
for (const text of priceLiterals) check(`rejects a typed price: ${JSON.stringify(text)}`, checkCopy(text) !== null);
const fine = ["Prices are in Gambian Dalasi (D).", "Data stays yours", "ID 4 checks", "24/7", "A 45-minute session", "{firstPrice} today", "DIY 3 ways"];
for (const text of fine) check(`allows ${JSON.stringify(text)}`, checkCopy(text) === null, String(checkCopy(text)));
check("rejects an unknown placeholder", checkCopy("Just {price}") !== null);
check("rejects emergency numbers in copy", checkCopy("Call 117 now") !== null && checkCopy("dial 116") !== null && checkCopy("or 118.") !== null);
check("allows numbers that only look close", checkCopy("1170 people, 2117 and 11") === null);
check("rejects the old name", checkCopy("Welcome to Talk Therapy") !== null);
check("rejects French", checkCopy("in English or French") !== null);
check("rejects HTML", checkCopy("Hello <b>there</b>") !== null && checkCopy("<script>alert(1)</script>") !== null);
check("rejects pasted control characters", checkCopy("Hello\u0007") !== null);
check(
  "a typed price in a section is refused at its field",
  errorKeys("home", withDefaults("home", (d) => (d.faq.items[0].a = "It costs D200."))).includes("faq.items.0.a"),
);

// --- links ----------------------------------------------------------------------
const goodLinks = ["/support", "/support?intent=organisation", "#how", "/providers/abc123", "https://www.talktherapy.gm", "https://example.org/a?b=c#d"];
for (const href of goodLinks) check(`allows link ${href}`, checkHref(href) === null, String(checkHref(href)));
const badLinks = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "//evil.example",
  "/\\evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "http://example.org",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox",
  "https://user:pw@evil.example",
  "https://localhost",
  "mailto:a@b.c",
  "evil.example",
  "",
];
for (const href of badLinks) check(`refuses link ${JSON.stringify(href)}`, checkHref(href) !== null);
check(
  "a bad link in a section is refused at its field",
  errorKeys("about", withDefaults("about", (d) => (d.cta.secondary.href = "javascript:alert(1)"))).includes("cta.secondary"),
);

// --- rich text ------------------------------------------------------------------
type AnyNode = { type: string; children?: AnyNode[]; items?: AnyNode[][]; href?: string; value?: string };
function walkNodes(nodes: AnyNode[], visit: (n: AnyNode) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.children) walkNodes(n.children, visit);
    if (n.items) for (const item of n.items) walkNodes(item, visit);
  }
}
const ALLOWED_NODES = new Set(["heading", "paragraph", "list", "text", "strong", "em", "link"]);
function tree(source: string, headings = false) {
  const parsed = parseRichText(source, { headings });
  const nodes: AnyNode[] = [];
  walkNodes(parsed.blocks as AnyNode[], (n) => nodes.push(n));
  return { ...parsed, nodes };
}
function textOf(source: string) {
  return tree(source)
    .nodes.filter((n) => n.type === "text")
    .map((n) => n.value)
    .join("");
}

{
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click]( javascript:alert(1) )",
    "[click](//evil.example)",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "[**click**](vbscript:x)",
    "[a](/ok) [b](javascript:alert(1))",
  ];
  for (const source of attacks) {
    const { nodes } = tree(source);
    const ok =
      nodes.every((n) => ALLOWED_NODES.has(n.type)) &&
      nodes.filter((n) => n.type === "link").every((n) => checkHref(n.href) === null);
    check(`rich text stays safe: ${JSON.stringify(source)}`, ok);
  }
  check("a script tag is shown as its characters", textOf("<script>alert(1)</script>") === "<script>alert(1)</script>");
  const js = tree("[click](javascript:alert(1))");
  check("a javascript: link becomes plain words and a problem", !js.nodes.some((n) => n.type === "link") && js.problems.length === 1);
  check(
    "rich text with a bad link is refused",
    errorKeys("privacy", withDefaults("privacy", (d) => (d.note = "Read [this](javascript:alert(1))."))).includes("note"),
  );
  check(
    "rich text with HTML is refused",
    errorKeys("privacy", withDefaults("privacy", (d) => (d.body = "## Hi\n\n<img src=x onerror=alert(1)>"))).includes("body"),
  );

  const rich = tree("Some **bold**, *italic*, _also italic_ and [a link](/support).");
  const types = rich.nodes.map((n) => n.type);
  check("bold, italics and links parse", ["strong", "em", "link"].every((t) => types.includes(t)) && types.filter((t) => t === "em").length === 2);
  check("a good link keeps its address", rich.nodes.find((n) => n.type === "link")?.href === "/support");
  check("escapes show the character", textOf("\\*not italic\\* and \\[not a link\\]") === "*not italic* and [not a link]");
  check("snake_case is not italics", !tree("a snake_case_name here").nodes.some((n) => n.type === "em"));
  check("arithmetic is not italics", !tree("5 * 3 * 2").nodes.some((n) => n.type === "em"));

  const headed = tree("## A heading\n\nA paragraph\nwith a break.\n\n- one\n- two\n\n1. first\n2. second", true);
  check(
    "headings, paragraphs and both lists",
    headed.blocks.map((b) => b.type).join(",") === "heading,paragraph,list,list" &&
      (headed.blocks[2] as { ordered: boolean }).ordered === false &&
      (headed.blocks[3] as { ordered: boolean }).ordered === true,
  );
  check("a single line break is a space", textOf("one\ntwo") === "one two");
  const noHeadings = tree("## Not allowed");
  check("a heading where none is allowed is a paragraph and a problem", noHeadings.blocks[0].type === "paragraph" && noHeadings.problems.length === 1);

  for (const [name, source] of [
    ["brackets", "[".repeat(20000)],
    ["unfinished links", "[a](".repeat(5000)],
    ["asterisks", "*a ".repeat(7000)],
    ["bold markers", "**".repeat(10000)],
    ["nesting", "**_*[".repeat(4000)],
  ] as const) {
    const started = performance.now();
    parseRichText(source, { headings: true });
    const ms = performance.now() - started;
    check(`pathological ${name} parse quickly`, ms < 1000, `${ms.toFixed(0)}ms`);
  }

  const renderer = readFileSync(new URL("../app/lib/content/richText.tsx", import.meta.url), "utf8");
  check("the renderer never sets HTML", !/dangerouslySetInnerHTML|innerHTML/.test(renderer.replace(/\/\*[\s\S]*?\*\//g, "")));
}

// --- colours and contrast -----------------------------------------------------
{
  check("the original palette passes its own floor", checkTheme(THEME_DEFAULTS).every((c) => c.status !== "block"));
  check("the original palette writes no CSS", themeCss(THEME_DEFAULTS) === "");
  check("lower-case original colours write no CSS", themeCss({ ...THEME_DEFAULTS, accent: "#c8754e" }) === "");

  const lighterButton = withDefaults("theme", (d) => (d.colors.accent = "#E7A381"));
  check("a paler terracotta under white text is refused", errorKeys("theme", lighterButton).includes("colors.accent"));
  const greyText = withDefaults("theme", (d) => (d.colors.foreground = "#9A8A80"));
  check("grey body text is refused", errorKeys("theme", greyText).includes("colors.foreground"));
  const lightBackground = withDefaults("theme", (d) => (d.colors.background = "#C9BBA8"));
  check("a background that buries the text is refused", errorKeys("theme", lightBackground).includes("colors.background"));
  const greyCards = withDefaults("theme", (d) => (d.colors.surface = "#B8AA9C"));
  check("cards too dark for the text on them are refused", errorKeys("theme", greyCards).includes("colors.surface"));
  const paleDark = withDefaults("theme", (d) => (d.colors.dark = "#B9A49A"));
  check("a dark brown too pale for cream text is refused", errorKeys("theme", paleDark).includes("colors.dark"));
  const deeperButton = withDefaults("theme", (d) => (d.colors.accent = "#A0522D"));
  check("a deeper terracotta is allowed", validateSection("theme", deeperButton).ok);
  check("an original pair below AA is a warning, not an error", validateSection("theme", defaultContent("theme")).warnings.length > 0);

  for (const bad of ["red", "#FFF", "#GGGGGG", "#C8754E;}body{display:none}", "C8754E", "#C8754E80"]) {
    const data = withDefaults("theme", (d) => (d.colors.accent = bad));
    check(`refuses colour ${JSON.stringify(bad)}`, errorKeys("theme", data).includes("colors.accent"));
    check(`writes no CSS for ${JSON.stringify(bad)}`, themeCss({ accent: bad }) === "");
  }
  const css = themeCss({ ...THEME_DEFAULTS, accent: "#a0522d", dark: "#3A2A25" });
  check(
    "a changed colour writes its token and the shadows that follow it",
    css.startsWith("html:root{") &&
      css.includes("--accent:#A0522D") &&
      css.includes("--shadow-accent:0 12px 26px -14px rgba(160, 82, 45, 0.6)") &&
      css.includes("--border:rgba(58, 42, 37, 0.12)") &&
      !css.includes("--cream"),
    css,
  );
  check("only hex and the derived values reach the CSS", /^html:root\{[-a-z0-9:#A-F;(), .]*\}$/.test(css), css);
  const mergedBad = mergeSection("theme", { colors: { ...THEME_DEFAULTS, accent: "#E7A381" } });
  check("a stored palette that fails contrast reads as the original", mergedBad.colors.accent === THEME_DEFAULTS.accent);
  const mergedGood = mergeSection("theme", { colors: { accent: "#a0522d" } });
  check("a stored good colour is used, in capitals", mergedGood.colors.accent === "#A0522D" && mergedGood.colors.sage === THEME_DEFAULTS.sage);
}

// --- lists ------------------------------------------------------------------------
{
  const threeFacts = withDefaults("home", (d) => d.hero.facts.pop());
  check("too few items is refused", errorKeys("home", threeFacts).includes("hero.facts"));
  const fiveFacts = withDefaults("home", (d) => d.hero.facts.push({ value: "1", label: "more" }));
  check("too many items is refused", errorKeys("home", fiveFacts).includes("hero.facts"));
  const noQuestions = withDefaults("home", (d) => (d.faq.items = []));
  check("an emptied list below its minimum is refused", errorKeys("home", noQuestions).includes("faq.items"));
  const many = withDefaults("home", (d) => (d.faq.items = Array.from({ length: 13 }, (_, i) => ({ q: `Q${i}?`, a: "A." }))));
  check("a list over its maximum is refused", errorKeys("home", many).includes("faq.items"));
  const reordered = withDefaults("home", (d) => d.faq.items.reverse());
  check("a reordered list is fine", validateSection("home", reordered).ok);
  const blankItem = withDefaults("home", (d) => (d.faq.items[1].q = "  "));
  check("an empty item is refused at its place", errorKeys("home", blankItem).includes("faq.items.1.q"));
  const mergedShort = mergeSection("home", threeFacts);
  check("a stored list out of bounds reads as the default", mergedShort.hero.facts.length === 4);
  const mergedBlank = mergeSection("home", blankItem);
  check("a stored list with a bad item reads as the default", mergedBlank.faq.items[1].q === defaultContent("home").faq.items[1].q);
  const halfItem = withDefaults("home", (d) => d.faq.items.push({ q: "Is there more?" } as never));
  check("an item missing a field is refused at that field", errorKeys("home", halfItem).includes("faq.items.5.a"));
  const mergedHalf = mergeSection("home", halfItem);
  check("a stored item missing a field never shows a blank", mergedHalf.faq.items.length === 5 && mergedHalf.faq.items.every((i) => i.a));
  const notAnItem = withDefaults("home", (d) => d.faq.items.push("Is there more?" as never));
  check("an item that is not one is refused", errorKeys("home", notAnItem).includes("faq.items.5"));
  check("…and a stored one reads as the default", mergeSection("home", notAnItem).faq.items.length === 5);
}

// --- merging and shaping -------------------------------------------------------
{
  const merged = mergeSection("home", { hero: { eyebrow: "New words", unknown: "dropped" }, extra: 1 });
  check("a published field is used", merged.hero.eyebrow === "New words");
  check("an unpublished field shows its default", merged.hero.lede === defaultContent("home").hero.lede);
  check("unknown keys are dropped", !("extra" in merged) && !("unknown" in merged.hero));
  const badField = mergeSection("home", { hero: { eyebrow: "Now D200 only", lede: 42 } });
  check("a bad stored field reads as its default", badField.hero.eyebrow === defaultContent("home").hero.eyebrow && badField.hero.lede === defaultContent("home").hero.lede);
  const junk: unknown[] = [null, undefined, 5, "x", [], [1, 2], { hero: null }, { hero: [] }, { hero: { images: { left: { src: 5 } } } }];
  let threw = false;
  for (const raw of junk) {
    try {
      for (const id of SECTION_IDS) mergeSection(id, raw);
    } catch {
      threw = true;
    }
  }
  check("merging never throws, whatever is stored", !threw);
  check("nothing stored reads as the defaults", JSON.stringify(mergeSection("about", undefined)) === JSON.stringify(defaultContent("about")));

  const shaped = shapeSection("home", { hero: { eyebrow: "", lede: 7 }, faq: { items: [{ q: "Half", a: "" }] } });
  check("a draft keeps unfinished words", shaped.hero.eyebrow === "" && shaped.faq.items.length === 1 && shaped.faq.items[0].a === "");
  check("a draft's wrong kinds of value are replaced", shaped.hero.lede === defaultContent("home").hero.lede);
}

// --- pictures -----------------------------------------------------------------------
{
  const url = siteMediaUrl("site-media/abcdef123.webp");
  check("a site-media address names its picture", mediaIdFromUrl(url) === "abcdef123");
  check("another bucket is not site media", mediaIdFromUrl(url.replace("talk-therapy-509209", "someone-else")) === null);
  check("a token-carrying address is not accepted", mediaIdFromUrl(`${url}&token=abc`) === null);
  check("a path that escapes the folder is not site media", mediaIdFromUrl(url.replace("site-media%2F", "site-media%2F..%2F")) === null);
  const uploaded = withDefaults("home", (d) => (d.hero.images.left = { src: url, alt: "A woman laughing" }));
  check("an uploaded picture may be used", validateSection("home", uploaded).ok);
  check("a section's pictures are found", mediaIdsIn("home", uploaded as never).join() === "abcdef123");
  for (const src of ["https://evil.example/x.png", "/people/../secret.png", "/brand/logo.png", "javascript:alert(1)", "/people/nobody.webp"]) {
    const data = withDefaults("home", (d) => (d.hero.images.left = { src, alt: "x" }));
    check(`refuses picture ${src}`, errorKeys("home", data).includes("hero.images.left"));
  }
  const noAlt = withDefaults("home", (d) => (d.hero.images.left.alt = ""));
  check("a picture needs a description", errorKeys("home", noAlt).includes("hero.images.left"));
  const decorative = withDefaults("home", (d) => (d.mind.imageLeft.alt = ""));
  check("a decorative picture does not", validateSection("home", decorative).ok);

  // An upload is what its own first bytes say, whatever it was declared as.
  const { mediaTypeOf } = schema;
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
  const pad = new Array(8).fill(0);
  check("a JPEG is a JPEG", mediaTypeOf(bytes([0xff, 0xd8, 0xff, 0xe0], pad)) === "image/jpeg");
  check("a PNG is a PNG", mediaTypeOf(bytes("\x89PNG\r\n\x1a\n", pad)) === "image/png");
  check("a WebP is a WebP", mediaTypeOf(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")) === "image/webp");
  check("an AVIF is an AVIF", mediaTypeOf(bytes([0, 0, 0, 28], "ftypavif", pad)) === "image/avif");
  check("an animated AVIF is an AVIF", mediaTypeOf(bytes([0, 0, 0, 28], "ftypavis", pad)) === "image/avif");
  check("an SVG is none of them", mediaTypeOf(bytes('<svg xmlns="http')) === null);
  check("an HTML page is none of them", mediaTypeOf(bytes("<!doctype html><")) === null);
  check("a video is not an AVIF", mediaTypeOf(bytes([0, 0, 0, 28], "ftypisom", pad)) === null);
  check("a WAV is not a WebP", mediaTypeOf(bytes("RIFF", [1, 2, 3, 4], "WAVEfmt ")) === null);
  check("a GIF is none of them", mediaTypeOf(bytes("GIF89a", pad)) === null);
  check("too few bytes is none of them", mediaTypeOf(bytes([0xff, 0xd8])) === null && mediaTypeOf(new Uint8Array()) === null);
}

// --- the REST decoder ------------------------------------------------------------
{
  const doc = {
    name: "projects/p/databases/(default)/documents/siteContent/home",
    fields: {
      rev: { integerValue: "3" },
      publishedAt: { integerValue: "1790000000000" },
      data: {
        mapValue: {
          fields: {
            hero: { mapValue: { fields: { eyebrow: { stringValue: "Hello" }, flag: { booleanValue: true } } } },
            list: { arrayValue: { values: [{ stringValue: "a" }, { doubleValue: 1.5 }, { nullValue: null }] } },
            odd: { geoPointValue: { latitude: 1, longitude: 2 } },
          },
        },
      },
    },
  };
  const decoded = decodeFields(doc.fields as never) as { rev: number; data: { hero: { eyebrow: string; flag: boolean }; list: unknown[]; odd: unknown } };
  check("REST documents decode", decoded.rev === 3 && decoded.data.hero.eyebrow === "Hello" && decoded.data.hero.flag === true);
  check("REST arrays decode", JSON.stringify(decoded.data.list) === '["a",1.5,null]');
  check("unknown REST values decode as nothing", decoded.data.odd === undefined);
  check("a REST document's id", documentId({ name: doc.name }) === "home");
}

// --- the theme editor's preview -------------------------------------------------
{
  const vars = theme.themeVariables(THEME_DEFAULTS);
  check(
    "the preview sets every colour, the original ones too",
    THEME_TOKENS.every((t) => vars[`--${t}`] === THEME_DEFAULTS[t]),
  );
  check("the preview rebuilds the shadows and border from the colours", "--border" in vars && "--shadow-accent" in vars);
  const odd = theme.themeVariables({ ...THEME_DEFAULTS, accent: "red; color: x", sage: "#abcdef" });
  check("the preview leaves out a colour that is not hex", !("--accent" in odd) && !("--shadow-accent" in odd));
  check("the preview writes colours in capitals", odd["--sage"] === "#ABCDEF");
}

// --- the editor's account of what changed ---------------------------------------
// The editor's own helper, run from source. Node runs TypeScript, but not the
// app's "@/..." paths or imports without a file extension; these hooks
// supply both, for this one import.
{
  // In Node 24, not yet in the installed @types/node.
  type Context = { parentURL?: string };
  type Resolve = (specifier: string, context: Context, next: (specifier: string, context: Context) => unknown) => unknown;
  const { registerHooks } = (await import("node:module")) as unknown as {
    registerHooks: (hooks: { resolve: Resolve }) => void;
  };
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const app = fileURLToPath(new URL("../app/", import.meta.url));
  registerHooks({
    resolve(specifier, context, next) {
      const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(app, specifier.slice(2))).href : specifier;
      if ((spec.startsWith(".") || spec.startsWith("file:")) && context.parentURL?.startsWith("file:")) {
        const base = spec.startsWith("file:") ? fileURLToPath(spec) : path.resolve(path.dirname(fileURLToPath(context.parentURL)), spec);
        for (const ext of ["", ".ts", ".tsx"]) {
          if (existsSync(base + ext) && (ext || /\.[mc]?[jt]sx?$/.test(base))) return next(pathToFileURL(base + ext).href, context);
        }
      }
      return next(spec, context);
    },
  });
  const changes = (await import(
    pathToFileURL(path.join(app, "components/admin/content/changes.ts")).href
  )) as typeof import("../app/components/admin/content/changes.ts");

  check("nothing published and nothing changed is no change", changes.changedFields("home", null, defaultContent("home")).length === 0);
  const heading = withDefaults("home", (d) => (d.hero.lines[0] = "Talk it over,"));
  const found = changes.changedFields("home", null, heading);
  check(
    "a changed heading is named by its card and field",
    found.length === 1 && found[0].key === "hero.lines" && found[0].label === "Welcome › Heading",
    JSON.stringify(found),
  );
  const added = withDefaults("home", (d) => d.faq.items.push({ q: "Is it private?", a: "Yes." }));
  const counted = changes.changedFields("home", defaultContent("home"), added);
  const before = defaultContent("home").faq.items.length;
  check(
    "a list that grew says by how much",
    counted.length === 1 && counted[0].label.endsWith(`(${before} → ${before + 1})`),
    JSON.stringify(counted),
  );
  check(
    "stored data from before a field existed is not a change",
    changes.changedFields("about", { intro: defaultContent("about").intro }, defaultContent("about")).length === 0,
  );
  check("content compares by value, keys in any order", changes.sameContent({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
  check("a different item is a difference", !changes.sameContent(["a", "b"], ["a", "c"]));
  check(
    "a long list of changes is summed up",
    changes.summarise([1, 2, 3, 4, 5].map((n) => ({ key: `k${n}`, label: `Field ${n}` })), 3) ===
      "Field 1, Field 2, Field 3 and 2 more",
  );
}

// --- the resource centre ------------------------------------------------------------
{
  const { SEED_RESOURCES } = seeds;
  const {
    validateResource,
    mergeResource,
    shapeResource,
    resourceCatalogue,
    suggestResource,
    seedContent,
    slugify,
    checkSlug,
    blankResource,
    storedResource,
    coverMediaId,
    RESOURCE_ID,
    RESOURCES_TAG,
  } = resources;
  type Content = import("../app/lib/content/resources.ts").ResourceContent;
  const first = SEED_RESOURCES[0];
  const second = SEED_RESOURCES[1];
  const grief = SEED_RESOURCES.find((s) => s.id === "seed-grief") ?? SEED_RESOURCES[2];
  const article = (change: (c: Content) => void = () => {}): Content => {
    const c: Content = {
      ...blankResource(),
      title: "Looking after yourself on a hard day",
      slug: "looking-after-yourself",
      summary: "Small things that help when everything feels like too much.",
      body: "## Start small\n\nEat something. **Drink water.** Step outside, even for a minute.\n\n- Text one person\n- Go to bed a little earlier",
      topics: ["stress", "coping"],
      readingMinutes: 4,
    };
    change(c);
    return c;
  };
  const keys = (id: string, data: unknown, taken?: (slug: string) => string | null) =>
    validateResource(id, data, taken).errors.map((e) => e.key);

  // Every starter article can be published as it ships — except where it
  // names an emergency number, which the copy rules keep in code.
  for (const seed of SEED_RESOURCES) {
    const result = validateResource(seed.id, seedContent(seed));
    const expected = seed.id === "seed-grief" ? ["body"] : [];
    check(
      `starter article "${seed.id}" ${expected.length ? "is held to the emergency-number rule" : "validates"}`,
      JSON.stringify(result.errors.map((e) => e.key)) === JSON.stringify(expected),
      result.errors.map((e) => `${e.key}: ${e.message}`).join(" | "),
    );
  }
  check(
    "the grief article's problem says where the numbers live",
    /crisis/.test(validateResource(grief.id, seedContent(grief)).errors[0]?.message ?? ""),
  );

  check("a well-formed new article validates", validateResource("abc123", article()).ok, keys("abc123", article()).join());
  check(
    "an article's words are trimmed as published",
    validateResource("abc123", article((c) => (c.title = "  Hello there  "))).value.title === "Hello there",
  );
  check("a hand-written price is refused", keys("abc123", article((c) => (c.summary = "Only D200 to talk."))).includes("summary"));
  check("an emergency number is refused", keys("abc123", article((c) => (c.body = "Call 117 now."))).includes("body"));
  check("HTML is refused", keys("abc123", article((c) => (c.body = "<script>alert(1)</script>"))).includes("body"));
  check("a javascript: link is refused", keys("abc123", article((c) => (c.body = "[click](javascript:alert(1))"))).includes("body"));
  check("the brand is written TALK", keys("abc123", article((c) => (c.title = "What Talk Therapy is for"))).includes("title"));
  check("a placeholder is allowed", validateResource("abc123", article((c) => (c.summary = "A first talk costs {firstPrice}."))).ok);
  check("a title is needed", keys("abc123", article((c) => (c.title = " "))).includes("title"));
  check("no topic is refused", keys("abc123", article((c) => (c.topics = []))).includes("topics"));
  check(
    "five topics are too many",
    keys("abc123", article((c) => (c.topics = ["stress", "grief", "coping", "family", "academic"]))).includes("topics"),
  );
  check("an unknown topic is refused", keys("abc123", { ...article(), topics: ["stress", "astrology"] }).includes("topics"));
  check("a reading time of 0 is refused", keys("abc123", article((c) => (c.readingMinutes = 0))).includes("readingMinutes"));
  check("a reading time of 31 is refused", keys("abc123", article((c) => (c.readingMinutes = 31))).includes("readingMinutes"));
  check("half a minute is refused", keys("abc123", article((c) => (c.readingMinutes = 2.5))).includes("readingMinutes"));
  check("audio is not offered yet", keys("abc123", { ...article(), format: "audio" }).includes("format"));
  check("no cover is fine", validateResource("abc123", article((c) => (c.cover = { src: "", alt: "" }))).ok);
  check(
    "a built-in cover with a description is fine",
    validateResource("abc123", article((c) => (c.cover = { src: BUILT_IN_IMAGES[0], alt: "A woman on a bench" }))).ok,
  );
  check("a cover needs a description", keys("abc123", article((c) => (c.cover = { src: BUILT_IN_IMAGES[0], alt: "" }))).includes("cover"));
  check(
    "a cover from anywhere else is refused",
    keys("abc123", article((c) => (c.cover = { src: "https://evil.example/x.png", alt: "A picture" }))).includes("cover"),
  );
  const uploaded = siteMediaUrl("site-media/abcdef123.webp");
  check("an uploaded cover is fine", validateResource("abc123", article((c) => (c.cover = { src: uploaded, alt: "Two friends" }))).ok);
  check(
    "an uploaded cover is found by its library id",
    coverMediaId(article((c) => (c.cover = { src: uploaded, alt: "x" }))) === "abcdef123",
  );
  check("nothing at all is refused", !validateResource("abc123", null).ok);

  // Web addresses.
  check("an address from a title", slugify("Grief does not follow a schedule") === "grief-does-not-follow-a-schedule");
  check("an address loses accents and odd marks", slugify("  Café, & “quiet” time!  ") === "cafe-and-quiet-time");
  const long = slugify("word ".repeat(40));
  check(
    "a long address is cut at a word",
    long.length <= 80 && !long.endsWith("-") && long.split("-").every((w) => w === "word"),
    long,
  );
  check("a good address passes", checkSlug("abc123", "looking-after-yourself") === null);
  for (const bad of ["Has-Capitals", "has spaces", "double--dash", "-leading", "trailing-", "ab", "dots.in.it", "slash/in", "x".repeat(81)]) {
    check(`address ${JSON.stringify(bad.length > 20 ? `${bad.slice(0, 12)}…` : bad)} is refused`, checkSlug("abc123", bad) !== null);
  }
  check("a starter article keeps its own address", checkSlug(first.id, first.slug) === null);
  check("another article cannot take a starter's address", checkSlug("abc123", first.slug) !== null);
  check(
    "a starter cannot take another starter's address",
    keys(first.id, { ...seedContent(first), slug: second.slug }).includes("slug"),
  );
  check(
    "an address published by another article is refused",
    keys("abc123", article(), (slug) => (slug === "looking-after-yourself" ? "other" : null)).includes("slug"),
  );
  check(
    "an article's own published address is fine",
    validateResource("abc123", article(), (slug) => (slug === "looking-after-yourself" ? "abc123" : null)).ok,
  );

  // Ids and rules: the rules and the code agree.
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const idRule = /match \/resourceDrafts\/\{resourceId\}[\s\S]*?resourceId\.matches\('([^']+)'\)/.exec(rules)?.[1];
  check("the drafts rule checks ids with the code's pattern", idRule === RESOURCE_ID.source, `${idRule} vs ${RESOURCE_ID.source}`);
  check("a Firestore auto id is an article id", RESOURCE_ID.test("aB3dE5fG7hJ9kL1mN3pQ") && RESOURCE_ID.test("seed-grief"));
  check("a path is not an article id", !RESOURCE_ID.test("a/b") && !RESOURCE_ID.test("") && !RESOURCE_ID.test("x".repeat(65)));
  check("the articles share their page's cache tag", RESOURCES_TAG === "content:resources");
  check(
    "the public reads published and withdrawn articles, and no browser writes them",
    /match \/resources\/\{resourceId\}\s*\{[^}]*status in \['published', 'withdrawn'\][^}]*allow write: if false;/.test(rules),
  );

  // What the site shows.
  const ids = (list: { id: string }[]) => list.map((r) => r.id).join(",");
  const seedIds = SEED_RESOURCES.map((s) => s.id).join(",");
  const stored = (entries: [string, unknown][]) => new Map<string, unknown>(entries);
  const published = (id: string, c: Content, at: number) => storedResource(id, c, { rev: 1, publishedAt: at, updatedAt: at });
  const NOW = Date.UTC(2026, 9, 14);

  check("unread, the starter articles show as they ship", ids(resourceCatalogue(null)) === seedIds);
  check("with nothing stored, the starter articles show", ids(resourceCatalogue(stored([]))) === seedIds);
  const changedFirst = resourceCatalogue(stored([[first.id, published(first.id, { ...seedContent(first), title: "A new title" }, 1)]]));
  check("a published change replaces the starter's words", changedFirst.find((r) => r.id === first.id)?.title === "A new title");
  check("a changed starter keeps its place", ids(changedFirst) === seedIds);
  const withdrawn = resourceCatalogue(stored([[grief.id, { status: "withdrawn", rev: 2, updatedAt: 5 }]]));
  check(
    "a withdrawn starter article is not shown",
    !withdrawn.some((r) => r.id === grief.id) && withdrawn.length === SEED_RESOURCES.length - 1,
  );
  check(
    "a starter put back to its own words shows them",
    resourceCatalogue(stored([[grief.id, { status: "original", rev: 3, updatedAt: 6 }]])).find((r) => r.id === grief.id)?.body === grief.body,
  );
  const added = resourceCatalogue(stored([["abc123", published("abc123", article(), NOW)]]));
  check("a new article shows, newest first", added[0]?.id === "abc123" && added.length === SEED_RESOURCES.length + 1);
  check("an article that is not published is not public", ids(resourceCatalogue(stored([["abc123", { status: "draft" }]]))) === seedIds);
  check(
    "a published article with no usable words is not shown",
    !resourceCatalogue(stored([["abc123", { ...published("abc123", article(), NOW), body: 42 }]])).some((r) => r.id === "abc123"),
  );
  check(
    "a field that fails its checks falls back, not the article",
    resourceCatalogue(stored([["abc123", { ...published("abc123", article(), NOW), readingMinutes: -3, topics: "nope" }]])).find(
      (r) => r.id === "abc123",
    )?.readingMinutes === 5,
  );
  const clash = resourceCatalogue(
    stored([
      ["abc123", published("abc123", article(), NOW)],
      ["def456", published("def456", article((c) => (c.title = "Older")), NOW - 1000)],
    ]),
  );
  check(
    "two articles never share an address: the newer keeps it",
    clash.filter((r) => r.slug === "looking-after-yourself").length === 1 && clash.some((r) => r.id === "abc123"),
  );
  const priced = resourceCatalogue(stored([["abc123", published("abc123", article((c) => (c.summary = "A first talk costs {firstPrice}.")), NOW)]]));
  check("placeholders are filled in", priced[0]?.summary === `A first talk costs ${tokens.TOKENS.firstPrice.value}.`);
  check("an odd id is never shown", !resourceCatalogue(stored([["a b", published("a b", article(), NOW)]])).some((r) => r.id === "a b"));

  // The editor's preview: drafts shown as if published, over what is live.
  const preview = resourceCatalogue(
    stored([]),
    new Map<string, unknown>([
      [first.id, { data: { ...seedContent(first), title: "Draft title", readingMinutes: 999 }, updatedAt: NOW }],
      ["new1", { data: article((c) => (c.slug = "a-new-one")), updatedAt: NOW }],
      ["new2", { data: { ...blankResource(), title: "Half written" }, updatedAt: NOW }],
    ]),
  );
  check("the preview shows a draft over its article", preview.find((r) => r.id === first.id)?.title === "Draft title");
  check("an unusable draft field shows what is live", preview.find((r) => r.id === first.id)?.readingMinutes === first.readingMinutes);
  check("the preview shows a new article's draft", preview.some((r) => r.id === "new1"));
  check("a half-written new article is not shown even in the preview", !preview.some((r) => r.id === "new2"));

  // Merging and shaping.
  check(
    "merging falls back to a base field by field",
    mergeResource({ ...article(), title: "" }, article((c) => (c.title = "Base title")))?.title === "Base title",
  );
  check("merging nothing onto nothing is nothing", mergeResource(undefined, null) === null);
  const shaped = shapeResource({ title: "Half", topics: ["stress", "nope", "stress"], readingMinutes: "5", cover: "x" });
  check("a draft keeps half-written words", shaped.title === "Half" && shaped.body === "");
  check("a draft loses unknown and repeated topics", JSON.stringify(shaped.topics) === '["stress"]');
  check("a draft's odd values become defaults", shaped.readingMinutes === 5 && shaped.cover.src === "" && shaped.format === "article");

  // The dashboard's suggestion.
  const library = resourceCatalogue(null);
  check("grief at intake suggests the grief article", suggestResource(library, ["grief"])?.id === "seed-grief");
  check("study pressure suggests the exam article", suggestResource(library, ["academic"])?.id === "seed-exam");
  check("nothing to go on suggests the newest", suggestResource(library, [])?.id === library[0].id);
  check("an old free-text goal still counts", suggestResource(library, [], ["grief"])?.id === "seed-grief");
  check("an empty library suggests nothing", suggestResource([], ["grief"]) === null);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
