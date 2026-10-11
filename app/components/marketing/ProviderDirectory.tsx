"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import ProviderCard, { ProviderCardSkeleton } from "../providers/ProviderCard";
import { EmptyState } from "../ui/Feedback";
import Button from "../ui/Button";
import { IconPeople } from "../ui/icons";
import PageIntro from "./PageIntro";
import { LOCALE_LABELS, type ProviderProfile, type Locale } from "../../lib/models";
import { FORMAT_LABELS, type ProviderGender, type SessionFormat } from "../../lib/matching";
import {
  EMPTY_FILTERS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  filterProviders,
  listVerifiedProviders,
  type DirectoryFilters,
  type Specialization,
} from "../../lib/providers";

/**
 * The provider directory — the redesign's providers page: "Find someone who
 * understands you", a search bar, filter pills that open into choices, and
 * the cards three to a row.
 *
 * Fetches once and filters in memory — see the note in `lib/providers.ts`.
 * Browsable signed-out on purpose: making someone create an account before
 * they can see whether anyone here speaks Wolof is exactly the kind of friction
 * the platform exists to remove.
 */

const LANGUAGES: Locale[] = ["en", "wo", "mnk", "ff"];
const GENDERS: { value: ProviderGender; label: string }[] = [
  { value: "woman", label: "A woman" },
  { value: "man", label: "A man" },
];
const FORMATS: SessionFormat[] = ["video", "voice"];
const PAGE = 6;

/** One filter: a pill that opens into its choices. */
function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;
  const first = options.find((o) => o.value === selected[0])?.label;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 items-center gap-2.5 rounded-full border-[1.5px] px-4 text-[13.5px] transition-colors ${
          active
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--dark)]/70 text-[var(--foreground)] hover:bg-[var(--sand)]"
        }`}
      >
        {active ? `${label}: ${first}${selected.length > 1 ? ` +${selected.length - 1}` : ""}` : label}
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={SPRING_SNAP} width="10" height="7" viewBox="0 0 10 7" aria-hidden>
          <path d="M1 1l4 4 4-4" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open ? (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
            <motion.ul
              role="listbox"
              aria-multiselectable
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={SPRING_SNAP}
              className="absolute left-0 top-full z-30 mt-2 max-h-[300px] min-w-[220px] overflow-auto rounded-2xl bg-[var(--surface)] p-2 shadow-[var(--shadow-floating)]"
            >
              {options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => onToggle(o.value)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-[var(--sand)]"
                    >
                      {o.label}
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${
                          on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--dark)]/30"
                        }`}
                        aria-hidden
                      >
                        {on ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ProviderDirectory() {
  const [profiles, setProfiles] = useState<ProviderProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [genders, setGenders] = useState<ProviderGender[]>([]);
  const [formats, setFormats] = useState<SessionFormat[]>([]);
  const [shown, setShown] = useState(PAGE);

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

  const visible = useMemo(() => {
    if (!profiles) return [];
    return filterProviders(profiles, filters).filter(
      (p) =>
        (!genders.length || (p.gender !== null && genders.includes(p.gender))) &&
        (!formats.length || p.formats.some((f) => formats.includes(f))),
    );
  }, [profiles, filters, genders, formats]);

  const hasFilters =
    filters.specializations.length > 0 ||
    filters.languages.length > 0 ||
    filters.search.length > 0 ||
    genders.length > 0 ||
    formats.length > 0;

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setGenders([]);
    setFormats([]);
    setShown(PAGE);
  };

  const samples = visible.slice(0, shown).some((p) => p.sample);

  return (
    <>
      <PageIntro
        eyebrow="Our providers"
        lines={["Find someone who", "understands you."]}
        lede="Browse qualified providers by language, specialty and who you feel most comfortable with."
      >
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters((f) => ({ ...f, search: query.trim() }));
            setShown(PAGE);
          }}
          className="flex h-[58px] max-w-[640px] items-center rounded-full bg-[var(--surface)] pl-6 pr-1.5 shadow-[var(--shadow-raised)]"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Clearing the box clears the search, without a second tap.
              if (!e.target.value) setFilters((f) => ({ ...f, search: "" }));
            }}
            placeholder="Search by name, specialty or language"
            aria-label="Search providers"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--muted)]"
          />
          <button
            type="submit"
            className="h-[46px] rounded-full bg-[var(--accent)] px-7 text-[14px] font-medium text-white transition-colors hover:bg-[var(--accent-deep)]"
          >
            Search
          </button>
        </form>
      </PageIntro>

      <section className="bg-[var(--background)] px-5 pb-16 pt-8 md:px-10 md:pb-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <FilterMenu
              label="Language"
              options={LANGUAGES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
              selected={filters.languages}
              onToggle={(l) => setFilters((f) => ({ ...f, languages: toggleIn(f.languages, l) }))}
            />
            <FilterMenu
              label="Specialty"
              options={SPECIALIZATIONS.map((s) => ({ value: s, label: SPECIALIZATION_LABELS[s] }))}
              selected={filters.specializations}
              onToggle={(s: Specialization) => setFilters((f) => ({ ...f, specializations: toggleIn(f.specializations, s) }))}
            />
            <FilterMenu label="Provider" options={GENDERS} selected={genders} onToggle={(g) => setGenders((all) => toggleIn(all, g))} />
            <FilterMenu
              label="Session type"
              options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              selected={formats}
              onToggle={(f) => setFormats((all) => toggleIn(all, f))}
            />
            {hasFilters ? (
              <button type="button" onClick={clearAll} className="ml-2 text-[13.5px] font-medium text-[var(--accent)] hover:underline">
                Clear all
              </button>
            ) : null}
          </div>

          {samples ? <p className="mt-5 text-[12.5px] text-[var(--muted)]">Showing sample profiles, for layout only</p> : null}

          <div className="mt-6">
            {profiles === null ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <ProviderCardSkeleton key={i} />
                ))}
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
                title="No providers match those filters"
                description="Try widening your search — removing a language or specialty usually helps."
                action={<Button variant="secondary" onClick={clearAll}>Clear all</Button>}
              />
            ) : visible.length === 0 ? (
              // The honest pre-launch state. Better than fake seeded profiles,
              // which would be the one thing guaranteed to destroy trust here.
              <EmptyState
                icon={<IconPeople />}
                title="Our provider network is being verified"
                description="We are onboarding qualified providers and psychosocial support professionals now. Every one of them is credential-checked before they appear here — which takes a little longer, and is the point. In the meantime, the wellbeing resource centre is free and open."
                action={
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button href="/resources">Browse resources</Button>
                    <Button href="/for-providers" variant="secondary">
                      I am a provider
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {visible.slice(0, shown).map((profile, i) => (
                    <ProviderCard key={profile.uid} profile={profile} index={i} />
                  ))}
                </div>
                {visible.length > shown ? (
                  <div className="mt-10 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + PAGE)}
                      className="inline-flex h-12 items-center rounded-full border-[1.5px] border-[var(--dark)] px-8 text-[14.5px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
                    >
                      Show more providers
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
