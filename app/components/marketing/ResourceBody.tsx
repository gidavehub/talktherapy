import RichText, { type RichTextClasses } from "@/lib/content/richText";

/**
 * An article's words, drawn by the site content's own renderer
 * (lib/content/richText): "## " headings, bold, italics, links and lists,
 * from the small markdown staff write in the article editor.
 *
 * That renderer builds React elements from a parsed tree and never sets
 * dangerouslySetInnerHTML, so nothing an author types can become markup or
 * a script, and links go only to this site or to https addresses.
 */

const CLASSES: RichTextClasses = {
  heading: "mt-12 first:mt-0 text-[22px] md:text-[26px] leading-tight font-display font-medium",
  paragraph: "mt-5 first:mt-0 text-[15px] md:text-[16px] leading-relaxed text-[var(--muted)]",
  list: "mt-5 first:mt-0 list-disc space-y-2 pl-5 text-[15px] md:text-[16px] leading-relaxed text-[var(--muted)]",
  orderedList: "mt-5 first:mt-0 list-decimal space-y-2 pl-5 text-[15px] md:text-[16px] leading-relaxed text-[var(--muted)]",
};

export default function ResourceBody({ body }: { body: string }) {
  return <RichText source={body} headings className="max-w-[680px]" classes={CLASSES} />;
}
