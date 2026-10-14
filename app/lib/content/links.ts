/**
 * Where a link in the site's content may point: a page on this site, a
 * section of the page it is on, or a full https:// address. Nothing else —
 * no javascript:, data:, http: or protocol-relative "//" addresses, which are
 * how a link turns into a script or quietly sends somebody elsewhere.
 *
 * Pure, and import-free so the rich-text parser can use it too.
 */

const INTERNAL = /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+:@!$'()*,;]*$/;
const FRAGMENT = /^#[A-Za-z0-9\-_]+$/;
// Whitespace and control characters: a browser strips a tab or newline from
// inside a URL, so "/<TAB>/evil.example" would become another site.
const UNSAFE = /[\s\u0000-\u001F\u007F\\]/;

export const LINK_MAX = 500;

/** Why a link cannot be used, or null when it can. */
export function checkHref(href: unknown): string | null {
  if (typeof href !== "string" || href.length === 0) return "Add where the link goes.";
  if (href.length > LINK_MAX) return "That address is too long.";
  if (UNSAFE.test(href)) return "A link cannot contain spaces or backslashes.";
  if (INTERNAL.test(href) || FRAGMENT.test(href)) return null;
  if (href.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return "That address is not a working link.";
    }
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return "That address is not a working link.";
    if (url.username || url.password) return "A link cannot carry a name or password.";
    return null;
  }
  return "Use a page on this site (starting with /) or a full https:// address.";
}

/** True for a link to another site, which opens without telling it where the visitor came from. */
export function isExternalHref(href: string): boolean {
  return href.startsWith("https://");
}
