/**
 * The little markdown the site's long-form text is written in, read into a
 * tree that is rendered by ./richText — never turned into HTML.
 *
 *   ## A heading                  (only where the field allows headings)
 *   A paragraph, with **bold**, *italics* or _italics_, and
 *   [a link](/support) to a page here or to an https:// address.
 *
 *   - a bullet          1. a numbered
 *   - list              2. list
 *
 * Blank lines separate blocks; a single line break inside a paragraph is a
 * space, as in markdown. A backslash shows the next character as itself
 * (\*, \_, \[, \#, \\). Everything else — angle brackets included — is plain
 * text: there is no HTML in this language, so there is nothing to sanitise.
 *
 * Pure and shared: validate.ts parses with it to report bad links before
 * publishing, and the renderer reads the same tree.
 */

import { checkHref } from "./links";

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

export type RichTextOptions = {
  /** Whether "## " starts a heading. Where it does not, the line is a paragraph. */
  headings?: boolean;
};

export type ParsedRichText = {
  blocks: Block[];
  /** What a writer should fix: a link that cannot be used, a heading where none is allowed. */
  problems: string[];
};

const ESCAPABLE = new Set(["\\", "*", "_", "[", "]", "(", ")", "#", "-", "`"]);
const BULLET = /^[-*]\s+/;
const NUMBERED = /^\d{1,3}[.)]\s+/;
const HEADING = /^##\s+/;
/** Bold inside a link inside italics is fine; a hundred levels of it is an attack. */
const MAX_DEPTH = 4;

// ----------------------------------------------------------------- inline

/** Link words and addresses are short; looking further only makes "[[[[…" slow. */
const LINK_REACH = 600;

/** The index of the next unescaped `delim` at or after `from` (and before `end`), or -1. */
function findClose(src: string, from: number, delim: string, end = src.length): number {
  for (let i = from; i < end; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src.startsWith(delim, i)) {
      // A single * or _ must not be half of a ** pair.
      if (delim.length === 1 && src[i + 1] === delim) {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => !c || /\s/.test(c);

function pushText(out: Inline[], value: string) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last && last.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

function parseInline(src: string, problems: string[], depth: number, inLink: boolean): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === "\\" && i + 1 < src.length && ESCAPABLE.has(src[i + 1])) {
      pushText(out, src[i + 1]);
      i += 2;
      continue;
    }

    if (depth < MAX_DEPTH && src.startsWith("**", i) && !isSpace(src[i + 2])) {
      const close = findClose(src, i + 2, "**");
      if (close > i + 2 && !isSpace(src[close - 1])) {
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, close), problems, depth + 1, inLink) });
        i = close + 2;
        continue;
      }
    }

    if (depth < MAX_DEPTH && (c === "*" || c === "_") && src[i + 1] !== c && !isSpace(src[i + 1])) {
      // An underscore inside a word (snake_case) is not emphasis, and
      // "5 * 3 * 2" is arithmetic: emphasis hugs its words.
      const opens = c === "*" || !isWordChar(src[i - 1]);
      const close = opens ? findClose(src, i + 1, c) : -1;
      const closes = close > i + 1 && !isSpace(src[close - 1]) && (c === "*" || !isWordChar(src[close + 1]));
      if (closes) {
        out.push({ type: "em", children: parseInline(src.slice(i + 1, close), problems, depth + 1, inLink) });
        i = close + 1;
        continue;
      }
    }

    if (!inLink && depth < MAX_DEPTH && c === "[") {
      const labelEnd = findClose(src, i + 1, "]", Math.min(src.length, i + 1 + LINK_REACH));
      if (labelEnd > i + 1 && src[labelEnd + 1] === "(") {
        const close = src.slice(labelEnd + 2, labelEnd + 2 + LINK_REACH).indexOf(")");
        const hrefEnd = close < 0 ? -1 : labelEnd + 2 + close;
        if (hrefEnd > labelEnd + 2) {
          const label = src.slice(i + 1, labelEnd);
          const href = src.slice(labelEnd + 2, hrefEnd).trim();
          const children = parseInline(label, problems, depth + 1, true);
          const problem = checkHref(href);
          if (problem) {
            // Shown as its words alone: a link that cannot be followed safely
            // is not drawn as a link at all.
            problems.push(`The link "${label}" cannot be used: ${problem}`);
            for (const child of children) {
              if (child.type === "text") pushText(out, child.value);
              else out.push(child);
            }
          } else {
            out.push({ type: "link", href, children });
          }
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    pushText(out, c);
    i++;
  }
  return out;
}

/** One line or paragraph of inline text: bold, italics and links, nothing block-level. */
export function parseInlineText(source: string): ParsedRichText & { inline: Inline[] } {
  const problems: string[] = [];
  const inline = parseInline(source.replace(/\s*\n\s*/g, " "), problems, 0, false);
  return { blocks: [{ type: "paragraph", children: inline }], inline, problems };
}

// ------------------------------------------------------------------ blocks

export function parseRichText(source: string, options: RichTextOptions = {}): ParsedRichText {
  const problems: string[] = [];
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const inline = (text: string) => parseInline(text, problems, 0, false);
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: inline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(inline) });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (HEADING.test(line)) {
      flushParagraph();
      flushList();
      const text = line.replace(HEADING, "");
      if (options.headings) blocks.push({ type: "heading", children: inline(text) });
      else {
        problems.push("Headings are not used here.");
        blocks.push({ type: "paragraph", children: inline(text) });
      }
      continue;
    }

    const bullet = BULLET.test(line);
    const numbered = !bullet && NUMBERED.test(line);
    if (bullet || numbered) {
      flushParagraph();
      if (!list || list.ordered !== numbered) {
        flushList();
        list = { ordered: numbered, items: [] };
      }
      list.items.push(line.replace(bullet ? BULLET : NUMBERED, ""));
      continue;
    }

    // A line straight after a list item carries on that item.
    if (list && paragraph.length === 0) {
      const items: string[] = list.items;
      items[items.length - 1] += ` ${line}`;
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return { blocks, problems };
}

/**
 * The blocks grouped under their headings — the shape the long-form pages lay
 * out, one card of paragraphs per heading. Text before the first heading has
 * a heading of null.
 */
export function richTextSections(blocks: Block[]): { heading: Inline[] | null; blocks: Block[] }[] {
  const sections: { heading: Inline[] | null; blocks: Block[] }[] = [];
  for (const block of blocks) {
    if (block.type === "heading") sections.push({ heading: block.children, blocks: [] });
    else {
      if (sections.length === 0) sections.push({ heading: null, blocks: [] });
      sections[sections.length - 1].blocks.push(block);
    }
  }
  return sections;
}

/** The words of a tree with the formatting taken out — for a heading's key, or a search. */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : plainText(n.children))).join("");
}
