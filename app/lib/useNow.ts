"use client";

import { useEffect, useState } from "react";

/**
 * The current time, as something a component may read during render.
 *
 * `Date.now()` in a render body is impure — React may re-render at any moment
 * and get a different answer, and the compiler refuses it. Holding it in state
 * and advancing it on a timer makes it an ordinary input.
 *
 * It is not only about the lint. These screens decide what is "upcoming" and
 * what has "already happened", and somebody waiting for their session has the
 * page open while exactly that changes. A snapshot taken at mount would leave
 * them looking at a session that still says it is coming up half an hour after
 * it began.
 *
 * The default tick is half a minute: fast enough that nothing on screen is
 * visibly stale, slow enough to be free.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);

  return now;
}
