"use client";

import { useEffect, useMemo, useState } from "react";
import { listVerifiedProviders } from "./providers";
import { rankProviders, type Intake, type Match } from "./matching";
import type { ProviderProfile } from "./models";

/**
 * Every available provider, ranked for this person's intake. Loaded once;
 * re-ranked in memory if the intake changes (see lib/providers on why the
 * directory is fetched whole).
 */
export function useMatches(intake: Intake | null) {
  const [profiles, setProfiles] = useState<ProviderProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVerifiedProviders()
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
    () => (profiles ? rankProviders(profiles, intake) : null),
    [profiles, intake],
  );

  return { matches, error, loading: profiles === null };
}
