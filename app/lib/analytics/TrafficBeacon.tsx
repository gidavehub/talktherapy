"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HEARTBEAT_MS } from "../adminStatsCore";
import { ANALYTICS_ON, FUNCTIONS_BASE, randomId } from "./shared";

/**
 * Counts the site's visits — anonymously, and without a cookie.
 *
 * On every page it tells the beacon function which page is open: once when
 * the page is reached (a view), then every minute while the tab is on screen
 * (so "on the site now" stays true), and again when the tab comes back into
 * view. It sends the path and a random id this tab made for itself, and
 * nothing else; the function turns the path into one of a fixed list of
 * pages and keeps no address and no browser details. Nothing identifies the
 * person, signed in or not.
 *
 * Staff pages are not counted: staff looking at the numbers would be most of
 * them. Nor is a page drawn inside a frame — that is the content editor's
 * preview, reloaded on every change, not a visit.
 */

const ENDPOINT = `${FUNCTIONS_BASE}/beacon`;
const TAB_KEY = "talk:tab";

/** This tab's id: kept for the tab's life, so a reload is the same visit. */
let tabId: string | null = null;
function tab(): string {
  if (tabId) return tabId;
  try {
    tabId = sessionStorage.getItem(TAB_KEY);
    if (!tabId) {
      tabId = randomId();
      sessionStorage.setItem(TAB_KEY, tabId);
    }
  } catch {
    // Storage refused (a private window, blocked site data): this load only.
    tabId = tabId ?? randomId();
  }
  return tabId;
}

function send(path: string, view: boolean) {
  // Text, not JSON: sendBeacon sends text without a preflight, and it is the
  // one request a closing page reliably gets out.
  const body = JSON.stringify({ path, sid: tab(), view });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, body)) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Counting a visit must never break the page.
  }
}

export default function TrafficBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ANALYTICS_ON || !pathname || pathname === "/admin" || pathname.startsWith("/admin/")) return;
    if (window.self !== window.top) return;
    send(pathname, true);
    const stillHere = () => {
      if (document.visibilityState === "visible") send(pathname, false);
    };
    const timer = setInterval(stillHere, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", stillHere);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", stillHere);
    };
  }, [pathname]);

  return null;
}
