/**
 * Draws the site's formatted text (see ./markdown) as React elements.
 *
 * Every word reaches the page as a React text child, which React escapes, so
 * text typed as "<script>" shows as those characters and runs as nothing.
 * There is no dangerouslySetInnerHTML here and there must never be: the tree
 * holds headings, paragraphs, lists, bold, italics and links, and nothing
 * else can be drawn. Links are checked again as they are drawn, so a tree
 * built by hand is held to the same rule as one from the parser.
 *
 * No hooks and no "use client": usable from server and client components.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { checkHref, isExternalHref } from "./links";
import { parseInlineText, parseRichText, type Block, type Inline } from "./markdown";

export type RichTextClasses = {
  heading?: string;
  paragraph?: string;
  list?: string;
  orderedList?: string;
  item?: string;
  strong?: string;
  em?: string;
  link?: string;
};

/** The long-form pages' look (the old Prose block), unless a caller says otherwise. */
export const RICH_TEXT_CLASSES: Required<RichTextClasses> = {
  heading: "font-display text-[24px] md:text-[30px] leading-tight font-medium",
  paragraph: "text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]",
  list: "list-disc space-y-2 pl-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]",
  orderedList: "list-decimal space-y-2 pl-5 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]",
  item: "pl-1",
  strong: "font-medium text-[var(--foreground)]",
  em: "italic",
  link: "underline underline-offset-4 transition-colors hover:text-[var(--accent)]",
};

function classesWith(overrides: RichTextClasses = {}): Required<RichTextClasses> {
  return { ...RICH_TEXT_CLASSES, ...overrides };
}

/** Bold, italics, links and words. */
export function RichInline({ nodes, classes }: { nodes: Inline[]; classes?: RichTextClasses }): ReactNode {
  const c = classesWith(classes);
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <strong key={i} className={c.strong}>
            <RichInline nodes={node.children} classes={classes} />
          </strong>
        );
      case "em":
        return (
          <em key={i} className={c.em}>
            <RichInline nodes={node.children} classes={classes} />
          </em>
        );
      case "link": {
        const words = <RichInline nodes={node.children} classes={classes} />;
        if (checkHref(node.href)) return <span key={i}>{words}</span>;
        return isExternalHref(node.href) ? (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className={c.link}>
            {words}
          </a>
        ) : (
          <Link key={i} href={node.href} className={c.link}>
            {words}
          </Link>
        );
      }
    }
  });
}

/** Headings, paragraphs and lists. */
export function RichBlocks({ blocks, classes }: { blocks: Block[]; classes?: RichTextClasses }) {
  const c = classesWith(classes);
  return blocks.map((block, i) => {
    switch (block.type) {
      case "heading":
        return (
          <h2 key={i} className={c.heading}>
            <RichInline nodes={block.children} classes={classes} />
          </h2>
        );
      case "paragraph":
        return (
          <p key={i} className={c.paragraph}>
            <RichInline nodes={block.children} classes={classes} />
          </p>
        );
      case "list": {
        const items = block.items.map((item, j) => (
          <li key={j} className={c.item}>
            <RichInline nodes={item} classes={classes} />
          </li>
        ));
        return block.ordered ? (
          <ol key={i} className={c.orderedList}>
            {items}
          </ol>
        ) : (
          <ul key={i} className={c.list}>
            {items}
          </ul>
        );
      }
    }
  });
}

/** A whole rich-text field. */
export default function RichText({
  source,
  headings = false,
  className,
  classes,
}: {
  source: string;
  /** True for the fields that allow "## " headings (the privacy policy and terms). */
  headings?: boolean;
  className?: string;
  classes?: RichTextClasses;
}) {
  const { blocks } = parseRichText(source, { headings });
  return (
    <div className={className}>
      <RichBlocks blocks={blocks} classes={classes} />
    </div>
  );
}

/** A one-paragraph field drawn inside something else — a sentence in a heading, a note in an alert. */
export function RichInlineText({ source, classes }: { source: string; classes?: RichTextClasses }) {
  return <RichInline nodes={parseInlineText(source).inline} classes={classes} />;
}
