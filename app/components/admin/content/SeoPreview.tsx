"use client";

import { SECTIONS, type ContentOf, type SeoPageId } from "@/lib/content/schema";
import { fillTokens } from "@/lib/content/tokens";

/**
 * Page titles and descriptions as they turn up in a search: the title as a
 * link (with "· TALK" after it, except on the front page), the address, the
 * description under it — cut where a search engine would cut it.
 */

const TITLE_CUT = 60;
const DESCRIPTION_CUT = 160;

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export default function SeoPreview({ value }: { value: ContentOf<"seo"> }) {
  const pages = Object.keys(SECTIONS.seo.fields) as SeoPageId[];
  return (
    <section aria-label="How the pages appear in a search" className="space-y-3">
      <p className="text-[12.5px] leading-snug text-[var(--muted)]">
        How each page appears in a search and in a browser tab. Words past the limit are cut off there.
      </p>
      <ul className="space-y-3">
        {pages.map((page) => {
          const entry = value[page];
          const title = fillTokens(entry.title);
          const description = fillTokens(entry.description);
          const route = page === "home" ? "/" : (SECTIONS[page].route ?? "/");
          return (
            <li key={page} className="rounded-[20px] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)]">
              <p className="truncate text-[12px] text-[var(--muted)]">TALK › {route === "/" ? "home" : route.slice(1)}</p>
              <p className="mt-1 text-[17px] leading-snug text-[var(--info)]">
                {cut(page === "home" ? title : `${title} · TALK`, TITLE_CUT + (page === "home" ? 0 : 7)) || "No title yet"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                {cut(description, DESCRIPTION_CUT) || "No description yet"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
