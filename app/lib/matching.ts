/**
 * What Talk learns about a person at intake, and how it turns that into
 * provider suggestions.
 *
 * Pure on purpose — no Firebase, no React, only type imports — so the same
 * code runs in the browser, in the AI route on the server, and in a plain
 * `node` test (scripts/test-matching.mts).
 */

import type { Locale, ProviderProfile } from "./models";
import type { Language } from "./ai/protocol";

// ----------------------------------------------------------- vocabularies

/** Areas of focus a provider offers and a person can be matched on. */
export const SPECIALIZATIONS = [
  "anxiety",
  "depression",
  "grief",
  "trauma",
  "relationships",
  "family",
  "workplace",
  "academic",
  "self-esteem",
  "substance",
  "youth",
  "sleep",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const SPECIALIZATION_LABELS: Record<Specialization, string> = {
  anxiety: "Anxiety",
  depression: "Low mood",
  grief: "Grief & loss",
  trauma: "Trauma",
  relationships: "Relationships",
  family: "Family",
  workplace: "Work stress",
  academic: "Study pressure",
  "self-esteem": "Self-esteem",
  substance: "Substance use",
  youth: "Young people",
  sleep: "Sleep",
};

/**
 * What a provider offers, and what a person asks for — one vocabulary for
 * both sides, so matching is a set intersection.
 *
 * This replaced a `profession` list on the provider matched to a separate
 * `supportType` on the intake through a lookup table. People do not ask for a
 * psychologist; they ask for help of a kind.
 */
export const SERVICES = [
  "therapy",
  "psychotherapy",
  "mental-health-counselling",
  "psychosocial-support",
  "social-work",
] as const;

export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<Service, string> = {
  therapy: "Therapy",
  psychotherapy: "Psychotherapy",
  "mental-health-counselling": "Mental health counselling",
  "psychosocial-support": "Psychosocial support",
  "social-work": "Social work",
};

/** Said aloud by Talk when she offers the choice. Plain, not clinical. */
export const SERVICE_BLURBS: Record<Service, string> = {
  therapy: "working through something difficult with a professional",
  psychotherapy: "deeper, longer-term work on patterns and past experiences",
  "mental-health-counselling": "talking things through with someone trained to listen",
  "psychosocial-support": "support with life around you — family, community, coping day to day",
  "social-work": "practical help with housing, money, work or family services",
};

/**
 * Sessions are video for now (the team's decision), but the field stays so
 * voice, chat and in-person can be switched on without a migration.
 */
export const SESSION_FORMATS = ["video", "voice", "chat", "in-person"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const FORMAT_LABELS: Record<SessionFormat, string> = {
  video: "Video",
  voice: "Voice call",
  chat: "Chat",
  "in-person": "In person",
};

/** Everyone is offered video today; nothing else is bookable yet. */
export const ACTIVE_FORMATS: SessionFormat[] = ["video"];

export type ProviderGender = "woman" | "man";

/**
 * Background Talk takes before anything else, because who someone is changes
 * what help fits them — and because a provider meeting them should not have
 * to ask again.
 */
export const AGE_RANGES = ["under-18", "18-24", "25-34", "35-49", "50-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const AGE_LABELS: Record<AgeRange, string> = {
  "under-18": "Under 18",
  "18-24": "18 to 24",
  "25-34": "25 to 34",
  "35-49": "35 to 49",
  "50-64": "50 to 64",
  "65+": "65 or older",
};

/** Where they are. Video sessions, so this is a preference, not a constraint. */
export const AREAS = [
  "banjul",
  "kanifing",
  "west-coast",
  "north-bank",
  "lower-river",
  "central-river",
  "upper-river",
  "outside",
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Record<Area, string> = {
  banjul: "Banjul",
  kanifing: "Kanifing and Serrekunda",
  "west-coast": "West Coast",
  "north-bank": "North Bank",
  "lower-river": "Lower River",
  "central-river": "Central River",
  "upper-river": "Upper River",
  outside: "Outside The Gambia",
};

/** Provider profiles carry a town; this is how a town becomes an area. */
const TOWN_AREA: Record<string, Area> = {
  banjul: "banjul",
  kanifing: "kanifing",
  serrekunda: "kanifing",
  bakau: "kanifing",
  bijilo: "kanifing",
  fajara: "kanifing",
  brikama: "west-coast",
  lamin: "west-coast",
  gunjur: "west-coast",
  tujereng: "west-coast",
  sanyang: "west-coast",
  barra: "north-bank",
  kerewan: "north-bank",
  farafenni: "north-bank",
  soma: "lower-river",
  mansakonko: "lower-river",
  janjanbureh: "central-river",
  bansang: "central-river",
  basse: "upper-river",
};

export function areaOf(town: string | null | undefined): Area | null {
  return town ? (TOWN_AREA[town.trim().toLowerCase()] ?? null) : null;
}

/**
 * Every town this file can place, grouped by area, for the provider profile
 * form to offer.
 *
 * Exported so that form can be a list rather than a text box. A provider who
 * types "Westfield" gets no area, and silently loses the proximity bonus that
 * puts them in front of the people nearest to them — the failure is invisible
 * to everyone, which is the worst kind. Choosing from this list cannot miss.
 */
export const TOWNS_BY_AREA: Array<{ area: Area; towns: string[] }> = AREAS.filter(
  (area) => area !== "outside",
).map((area) => ({
  area,
  towns: Object.entries(TOWN_AREA)
    .filter(([, a]) => a === area)
    .map(([town]) => town)
    .sort(),
}));

/** "serrekunda" -> "Serrekunda". Stored lower-case; shown as a name. */
export function townLabel(town: string): string {
  return town.charAt(0).toUpperCase() + town.slice(1);
}

export const USER_GENDERS = ["woman", "man", "other", "unsaid"] as const;
export type UserGender = (typeof USER_GENDERS)[number];

export const USER_GENDER_LABELS: Record<UserGender, string> = {
  woman: "Woman",
  man: "Man",
  other: "Another way",
  unsaid: "Rather not say",
};

export const GENDER_PREFS = ["woman", "man", "any"] as const;
export type GenderPref = (typeof GENDER_PREFS)[number];

const LANGUAGE_LOCALE: Partial<Record<Language, Locale>> = {
  english: "en",
  wolof: "wo",
  mandinka: "mnk",
  pulaar: "ff",
};

const LOCALE_NAME: Record<Locale, string> = { en: "English", wo: "Wolof", mnk: "Mandinka", ff: "Pulaar" };

export function localeOf(language: Language | null | undefined): Locale | null {
  return language ? (LANGUAGE_LOCALE[language] ?? null) : null;
}

// ------------------------------------------------------------------ intake

export type Intake = {
  /** What they would like to be called. */
  preferredName: string | null;
  /** The language they want support in — chosen, not guessed. */
  language: Language | null;
  ageRange: AgeRange | null;
  /**
   * Under 18 — the safeguarding flag a provider sees before anything else.
   *
   * DERIVED from the age answer in cleanIntake, never taken from the model:
   * a safeguarding flag the model could write is one it could unset. And
   * STICKY in mergeIntake: somebody who said 17 and later says 25 keeps it,
   * because the cost of dropping it wrongly is a child treated as an adult.
   */
  minor: boolean;
  /** Their part of the country. */
  location: Area | null;
  /** Their own gender, not the one they want to be seen by. */
  gender: UserGender | null;
  concerns: Specialization[];
  /** One English sentence, in their terms. Private to them. */
  concernSummary: string | null;
  /** The kinds of help they are looking for. */
  servicesWanted: Service[];
  providerGender: GenderPref | null;
  completedAt: number | null;
};

export const EMPTY_INTAKE: Intake = {
  preferredName: null,
  language: null,
  ageRange: null,
  minor: false,
  location: null,
  gender: null,
  concerns: [],
  concernSummary: null,
  servicesWanted: [],
  providerGender: null,
  completedAt: null,
};

/**
 * What Talk must learn before suggesting anyone, in the order she asks.
 * Name and language are gathered along the way rather than as questions:
 * the greeting asks the name, and the language is chosen up front.
 */
/**
 * Asked in this order: who they are before what is wrong with them. Walking
 * someone straight into "what has been weighing on you" is a lot to open
 * with, and a provider needs the background anyway.
 */
export const REQUIRED_FIELDS = [
  "ageRange",
  "location",
  "gender",
  "concerns",
  "servicesWanted",
  "providerGender",
] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

function isEmptyField(intake: Intake, field: RequiredField): boolean {
  if (field === "concerns") return intake.concerns.length === 0;
  if (field === "servicesWanted") return intake.servicesWanted.length === 0;
  return intake[field] == null;
}

/** Under-18 answers put a flag in front of whoever takes the session. */
export function isMinor(intake: Intake | null): boolean {
  return intake?.minor === true || intake?.ageRange === "under-18";
}

export function missingFields(intake: Intake): RequiredField[] {
  return REQUIRED_FIELDS.filter((f) => isEmptyField(intake, f));
}

export function intakeProgress(intake: Intake): number {
  return (REQUIRED_FIELDS.length - missingFields(intake).length) / REQUIRED_FIELDS.length;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function manyOf<T extends string>(v: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => oneOf(x, allowed)).filter((x): x is T => x !== null))];
}

function text(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Validate an untrusted intake (from the model, the client, or Firestore).
 * Anything malformed is dropped rather than trusted.
 */
export function cleanIntake(raw: unknown, languages: readonly Language[]): Intake {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    preferredName: text(r.preferredName, 60),
    language: oneOf(r.language, languages),
    ageRange: oneOf(r.ageRange, AGE_RANGES),
    // Never trusted as given: derived from the age answer, or kept when an
    // earlier stored intake already carried it.
    minor: r.minor === true || oneOf(r.ageRange, AGE_RANGES) === "under-18",
    location: oneOf(r.location, AREAS),
    gender: oneOf(r.gender, USER_GENDERS),
    concerns: manyOf(r.concerns, SPECIALIZATIONS),
    concernSummary: text(r.concernSummary),
    servicesWanted: manyOf(r.servicesWanted, SERVICES),
    providerGender: oneOf(r.providerGender, GENDER_PREFS),
    completedAt: typeof r.completedAt === "number" ? r.completedAt : null,
  };
}

/** Newer answers win; an answer is never erased by a turn that did not mention it. */
export function mergeIntake(prev: Intake, patch: Partial<Intake>): Intake {
  const next = { ...prev };
  for (const key of Object.keys(patch) as (keyof Intake)[]) {
    const value = patch[key];
    if (value == null) continue;
    // Sticky: a later turn reporting false never clears it. See `minor`.
    if (key === "minor") {
      if (value === true) next.minor = true;
      continue;
    }
    if (key === "concerns" || key === "servicesWanted") {
      const add = value as string[];
      if (add.length) {
        (next as Record<string, unknown>)[key] = [...new Set([...(prev[key] as string[]), ...add])];
      }
      continue;
    }
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

// ---------------------------------------------------------------- matching

export type Match = {
  profile: ProviderProfile;
  score: number;
  /** Why this person was suggested, in a few words each. Most important first. */
  reasons: string[];
};

/**
 * Rank providers for one person.
 *
 * Nobody is filtered out — a directory of tens cannot afford to show someone
 * nothing — but a mismatch on something they asked for sinks a profile well
 * below the ones that fit. Language carries the most weight: a person who
 * asked for Wolof and is matched with someone who cannot speak it has not
 * been helped at all.
 */
export function rankProviders(profiles: ProviderProfile[], intake: Intake | null): Match[] {
  const want = intake ?? EMPTY_INTAKE;
  const locale = localeOf(want.language);

  return profiles
    .map((profile) => {
      let score = 0;
      const reasons: string[] = [];

      if (locale && locale !== "en") {
        if (profile.languages.includes(locale)) {
          score += 40;
          reasons.push(`Speaks ${LOCALE_NAME[locale]}`);
        } else {
          score -= 25;
        }
      } else if (profile.languages.includes("en")) {
        score += 4;
      }

      const sharedConcerns = want.concerns.filter((c) => profile.specializations.includes(c));
      score += Math.min(sharedConcerns.length, 3) * 14;
      for (const c of sharedConcerns.slice(0, 2)) reasons.push(SPECIALIZATION_LABELS[c]);

      // Same part of the country. Sessions are by video, so this is a nudge
      // rather than a filter — but people would rather talk to someone who
      // knows their town.
      if (want.location && want.location !== "outside") {
        const area = areaOf(profile.location);
        if (area && area === want.location) {
          score += 8;
          reasons.push(AREA_LABELS[area]);
        }
      }

      // A child should be matched with someone who works with young people.
      if (want.ageRange === "under-18") {
        if (profile.specializations.includes("youth")) score += 18;
        else score -= 12;
      }

      const sharedServices = want.servicesWanted.filter((s) => profile.services.includes(s));
      if (want.servicesWanted.length) {
        if (sharedServices.length) {
          score += 12;
          reasons.push(SERVICE_LABELS[sharedServices[0]]);
        } else {
          score -= 10;
        }
      }

      if (want.providerGender && want.providerGender !== "any" && profile.gender) {
        if (profile.gender === want.providerGender) {
          score += 14;
          reasons.push(profile.gender === "woman" ? "Woman" : "Man");
        } else {
          score -= 20;
        }
      }

      score += profile.ratingAvg * 1.5 + Math.min(profile.yearsExperience, 20) * 0.4;
      return { profile, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.profile.displayName.localeCompare(b.profile.displayName));
}

/** The facts a match was built on, as short chips for the page header. */
export function intakeChips(intake: Intake | null): string[] {
  if (!intake) return [];
  const chips: string[] = [];
  if (isMinor(intake)) chips.push(AGE_LABELS["under-18"]);
  const locale = localeOf(intake.language);
  if (locale) chips.push(LOCALE_NAME[locale]);
  for (const c of intake.concerns.slice(0, 3)) chips.push(SPECIALIZATION_LABELS[c]);
  for (const s of intake.servicesWanted.slice(0, 2)) chips.push(SERVICE_LABELS[s]);
  if (intake.location) chips.push(AREA_LABELS[intake.location]);
  if (intake.providerGender && intake.providerGender !== "any") {
    chips.push(intake.providerGender === "woman" ? "A woman" : "A man");
  }
  return chips;
}
