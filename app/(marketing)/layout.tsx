import Header, { type NavLink } from "@/components/Header";
import Footer from "@/components/Footer";
import { NAV_HREFS, type NavKey } from "@/lib/content/schema";
import { getContent } from "@/lib/content/server";

/**
 * Public site chrome.
 *
 * `Header` is absolutely positioned by design (it floats over the hero art),
 * so this wrapper has to be `relative` or it escapes to the viewport. Pages
 * inside this group are responsible for their own top padding — the landing
 * page gets it from `HomeHero`, everything else should use `<PageIntro>`,
 * which bakes the offset in.
 *
 * The header's and footer's words are the site content, read here on the
 * server (one cached read shared with the page).
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [header, footer] = await Promise.all([getContent("header"), getContent("footer")]);
  return (
    <div className="relative">
      <Header nav={{ primary: navLinks(header.primary), more: navLinks(header.more), actions: header.actions }} />
      <main>{children}</main>
      <Footer nav={{ words: footer.words, more: navLinks(footer.more), legal: navLinks(footer.legal) }} />
    </div>
  );
}

/**
 * A group of link labels from the content, in order, each with the route it
 * goes to. The routes are code's (NAV_HREFS); only the words are content.
 */
function navLinks<K extends NavKey>(labels: Record<K, string>): NavLink[] {
  return (Object.keys(labels) as K[]).map((key) => ({ href: NAV_HREFS[key], label: labels[key] }));
}
