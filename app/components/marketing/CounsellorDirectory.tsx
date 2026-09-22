"use client";

import { useEffect, useMemo, useState } from "react";
import CounsellorCard from "../counsellors/CounsellorCard";
import { EmptyState, Pill, Spinner } from "../ui/Feedback";
import Button from "../ui/Button";
import { IconPeople } from "../ui/icons";
import { LOCALE_LABELS, type CounsellorProfile, type Locale } from "../../lib/models";
import {
  EMPTY_FILTERS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  filterCounsellors,
  listVerifiedCounsellors,
  type DirectoryFilters,
  type Specialization,
} from "../../lib/counsellors";

/**
 * Public counsellor directory.
 *
 * Fetches once and filters in memory — see the note in `lib/counsellors.ts`.
 * Browsable signed-out on purpose: making someone create an account before
 * they can see whether anyone here speaks Wolof is exactly the kind of friction
 * the platform exists to remove.
 */

const LANGUAGES: Locale[] = ["en", "wo", "mnk", "ff"];

export default function CounsellorDirectory() {
  const [profiles, setProfiles] = useState<CounsellorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);

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

  const visible = useMemo(
    () => (profiles ? filterCounsellors(profiles, filters) : []),
    [profiles, filters],
  );

  function toggleSpecialization(value: Specialization) {
    setFilters((f) => ({
      ...f,
      specializations: f.specializations.includes(value)
        ? f.specializations.filter((s) => s !== value)
        : [...f.specializations, value],
    }));
  }

  function toggleLanguage(value: Locale) {
    setFilters((f) => ({
      ...f,
      languages: f.languages.includes(value)
        ? f.languages.filter((l) => l !== value)
        : [...f.languages, value],
    }));
  }

  const hasFilters =
    filters.specializations.length > 0 ||
    filters.languages.length > 0 ||
    filters.search.length > 0;

  return (
    <div>
      {/* Filters */}
      <div className="space-y-6">
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search by name, specialisation or approach"
          aria-label="Search counsellors"
          className="w-full h-12 rounded-2xl bg-white border border-[var(--border)] px-5 text-[14px] outline-none focus:border-[var(--accent)] transition-colors"
        />

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
            Specialisation
          </p>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((s) => (
              <Pill
                key={s}
                active={filters.specializations.includes(s)}
                onClick={() => toggleSpecialization(s)}
              >
                {SPECIALIZATION_LABELS[s]}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
            Language
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <Pill
                key={l}
                active={filters.languages.includes(l)}
                onClick={() => toggleLanguage(l)}
              >
                {LOCALE_LABELS[l]}
              </Pill>
            ))}
          </div>
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--foreground)] transition-colors"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Results */}
      <div className="mt-12">
        {profiles === null ? (
          <div className="flex items-center gap-3 text-[var(--muted)] py-16 justify-center">
            <Spinner />
            <span className="text-[13px]">Loading counsellors…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon={<IconPeople />}
            title="We could not load the directory"
            description="Something went wrong reaching our servers. Please try again in a moment."
            action={<Button href="/support" variant="secondary">Contact support</Button>}
          />
        ) : visible.length === 0 && hasFilters ? (
          <EmptyState
            icon={<IconPeople />}
            title="No counsellors match those filters"
            description="Try widening your search — removing a language or specialisation usually helps."
            action={
              <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)} withArrow={false}>
                Clear filters
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          // The honest pre-launch state. Better than fake seeded profiles,
          // which would be the one thing guaranteed to destroy trust here.
          <EmptyState
            icon={<IconPeople />}
            title="Our counsellor network is being verified"
            description="We are onboarding qualified counsellors and psychosocial support professionals now. Every one of them is credential-checked before they appear here — which takes a little longer, and is the point. In the meantime, the wellbeing resource centre is free and open."
            action={
              <div className="flex flex-col sm:flex-row gap-3">
                <Button href="/resources">Browse resources</Button>
                <Button href="/for-counsellors" variant="secondary" withArrow={false}>
                  I am a counsellor
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--muted)] mb-6">
              {visible.length} {visible.length === 1 ? "counsellor" : "counsellors"}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {visible.map((profile, i) => (
                <CounsellorCard key={profile.uid} profile={profile} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
