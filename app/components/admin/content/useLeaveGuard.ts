"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Nobody loses words by leaving. While something has not been saved:
 *
 *  - closing or reloading the tab asks the browser's own "Leave site?";
 *  - following a link inside the app saves first, then goes; if the save
 *    fails (no connection), it stops and asks — `blocked` holds where they
 *    were going until `leave()` or `stay()`.
 *
 * Drafts save themselves within a second, so most of the time this does
 * nothing at all.
 */
export function useLeaveGuard(unsaved: boolean, save: () => Promise<boolean>) {
  const router = useRouter();
  const [blocked, setBlocked] = useState<string | null>(null);
  // Read by the listeners, which are added once.
  const state = useRef({ unsaved, save });

  useEffect(() => {
    state.current = { unsaved, save };
  }, [unsaved, save]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!state.current.unsaved) return;
      event.preventDefault();
      // Older browsers need this set to show their prompt.
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (!state.current.unsaved || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      // Before the link's own handler: this one is on the document, in the
      // capture phase, so it runs first and the link never sees the click.
      event.preventDefault();
      event.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      void state.current.save().then((saved) => {
        if (saved) router.push(href);
        else setBlocked(href);
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  return {
    blocked,
    leave: () => {
      const href = blocked;
      setBlocked(null);
      if (href) router.push(href);
    },
    stay: () => setBlocked(null),
  };
}
