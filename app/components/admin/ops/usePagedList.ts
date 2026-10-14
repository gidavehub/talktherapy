"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Page } from "@/lib/adminOps";
import type { OpsResult } from "@/lib/adminOps-client";

/**
 * A list the server hands over a page at a time, with "Load more".
 *
 * `key` names the filters. When it changes the list starts again from the
 * top, and until that first page arrives the list is loading — worked out
 * from the key rather than set in an effect, so a new filter never shows the
 * old filter's rows for a frame.
 *
 * A filtered page may come back short, or even empty, and still carry a
 * cursor: one call reads only so many documents. The list keeps the cursor,
 * and the page offers to look further.
 */

export type PagedList<T, R extends Page<T> = Page<T>> = {
  items: T[];
  /** The first page's whole answer — where counts and totals come with it. */
  first: R | null;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => void;
  /** Start again from the top. */
  reload: () => void;
  /** Change what is held without asking the server — after a save it answered. */
  mutate: (change: (held: { items: T[]; first: R | null }) => { items: T[]; first: R | null }) => void;
};

type Held<T, R> = { key: string; items: T[]; first: R | null; nextCursor: string | null; error: string | null };

export function usePagedList<T, R extends Page<T> = Page<T>>(
  key: string,
  load: (cursor: string | null) => Promise<OpsResult<R>>,
): PagedList<T, R> {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${attempt}|${key}`;
  const [held, setHeld] = useState<Held<T, R> | null>(null);
  const [more, setMore] = useState<{ key: string; busy: boolean; error: string | null }>({
    key: "",
    busy: false,
    error: null,
  });

  // The loader is a new function on every render; only the key says when
  // the list is a different list.
  const firstPage = useEffectEvent(() => load(null));

  useEffect(() => {
    let live = true;
    void firstPage().then((result) => {
      if (!live) return;
      setHeld(
        result.ok
          ? { key: requestKey, items: result.data.items, first: result.data, nextCursor: result.data.nextCursor, error: null }
          : { key: requestKey, items: [], first: null, nextCursor: null, error: result.error },
      );
    });
    return () => {
      live = false;
    };
  }, [requestKey]);

  const current = held?.key === requestKey ? held : null;
  const loadingMore = more.key === requestKey && more.busy;

  async function loadMore() {
    const cursor = current?.nextCursor;
    if (!cursor || loadingMore) return;
    const asked = requestKey;
    setMore({ key: asked, busy: true, error: null });
    const result = await load(cursor);
    if (!result.ok) {
      setMore({ key: asked, busy: false, error: result.error });
      return;
    }
    // Only onto the list it was asked for: a filter changed meanwhile has
    // started a different list, which this page does not belong to.
    setHeld((was) =>
      was && was.key === asked && was.nextCursor === cursor
        ? { ...was, items: [...was.items, ...result.data.items], nextCursor: result.data.nextCursor }
        : was,
    );
    setMore({ key: asked, busy: false, error: null });
  }

  return {
    items: current?.items ?? [],
    first: current?.first ?? null,
    loading: current === null,
    error: current?.error ?? null,
    nextCursor: current?.nextCursor ?? null,
    loadingMore,
    moreError: more.key === requestKey ? more.error : null,
    loadMore: () => void loadMore(),
    reload: () => setAttempt((n) => n + 1),
    mutate: (change) =>
      setHeld((was) => {
        if (!was || was.key !== requestKey || was.error) return was;
        const next = change({ items: was.items, first: was.first });
        return { ...was, items: next.items, first: next.first };
      }),
  };
}
