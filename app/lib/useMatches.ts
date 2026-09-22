"use client";

import { useEffect, useMemo, useState } from "react";
import { listVerifiedCounsellors } from "./counsellors";
import { rankCounsellors, type Intake, type Match } from "./matching";
import type { CounsellorProfile } from "./models";

/**
 * Every available counsellor, ranked for this person's intake. Loaded once;
 * re-ranked in memory if the intake changes (see lib/counsellors on why the
 * directory is fetched whole).
 */
export function useMatches(intake: Intake | null) {
  const [profiles, setProfiles] = useState<CounsellorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVerifiedCounsellors()
      .then((next) => {
        if (!cancelled) setProfiles(next);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo<Match[] | null>(
    () => (profiles ? rankCounsellors(profiles, intake) : null),
    [profiles, intake],
  );

  return { matches, error, loading: profiles === null };
}
