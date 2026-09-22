/**
 * What Talk learns about a person at intake, and how it turns that into
 * counsellor suggestions.
 *
 * Pure on purpose — no Firebase, no React, only type imports — so the same
 * code runs in the browser, in the AI route on the server, and in a plain
 * `node` test (scripts/test-matching.mts).
 */

import type { CounsellorProfile, Locale } from "./models";
import type { Language } from "./ai/protocol";

// ----------------------------------------------------------- vocabularies

/** Areas of focus a counsellor offers and a person can be matched on. */
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
 * The umbrella is "counsellors", but the people behind it are several
 * professions — the kind of help someone asks for decides which fit.
 */
export const PROFESSIONS = [
  "counsellor",
  "therapist",
  "psychologist",
  "social-worker",
  "coach",
  "psychiatric-nurse",
] as const;

export type Profession = (typeof PROFESSIONS)[number];

export const PROFESSION_LABELS: Record<Profession, string> = {
  counsellor: "Counsellor",
  therapist: "Therapist",
  psychologist: "Psychologist",
  "social-worker": "Social worker",
  coach: "Coach",
  "psychiatric-nurse": "Psychiatric nurse",
};

export const SESSION_FORMATS = ["video", "voice", "chat", "in-person"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const FORMAT_LABELS: Record<SessionFormat, string> = {
  video: "Video",
  voice: "Voice call",
  chat: "Chat",
  "in-person": "In person",
};

export type CounsellorGender = "woman" | "man";

export const SUPPORT_TYPES = ["therapy", "counselling", "coaching", "social-support", "unsure"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_LABELS: Record<SupportType, string> = {
  therapy: "Therapy",
  counselling: "Counselling",
  coaching: "Coaching",
  "social-support": "Social support",
  unsure: "Not sure yet",
};

export const GENDER_PREFS = ["woman", "man", "any"] as const;
export type GenderPref = (typeof GENDER_PREFS)[number];

export const FORMAT_PREFS = [...SESSION_FORMATS, "any"] as const;
export type FormatPref = (typeof FORMAT_PREFS)[number];

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
  /** The language they want support in — detected, not asked for. */
  language: Language | null;
  concerns: Specialization[];
  /** One English sentence, in their terms. Private to them. */
  concernSummary: string | null;
  supportType: SupportType | null;
  counsellorGender: GenderPref | null;
  format: FormatPref | null;
  completedAt: number | null;
};

export const EMPTY_INTAKE: Intake = {
  preferredName: null,
  language: null,
  concerns: [],
  concernSummary: null,
  supportType: null,
  counsellorGender: null,
  format: null,
  completedAt: null,
};

/**
 * What Talk must learn before suggesting anyone, in the order she asks.
 * Name and language are gathered along the way rather than as questions:
 * the greeting asks the name, and the language is heard.
 */
export const REQUIRED_FIELDS = ["concerns", "supportType", "counsellorGender", "format"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export function missingFields(intake: Intake): RequiredField[] {
  return REQUIRED_FIELDS.filter((f) => (f === "concerns" ? intake.concerns.length === 0 : intake[f] == null));
}

export function intakeProgress(intake: Intake): number {
  return (REQUIRED_FIELDS.length - missingFields(intake).length) / REQUIRED_FIELDS.length;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
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
  const concerns = Array.isArray(r.concerns)
    ? [...new Set(r.concerns.map((c) => oneOf(c, SPECIALIZATIONS)).filter((c): c is Specialization => c !== null))]
    : [];
  return {
    preferredName: text(r.preferredName, 60),
    language: oneOf(r.language, languages),
    concerns,
    concernSummary: text(r.concernSummary),
    supportType: oneOf(r.supportType, SUPPORT_TYPES),
    counsellorGender: oneOf(r.counsellorGender, GENDER_PREFS),
    format: oneOf(r.format, FORMAT_PREFS),
    completedAt: typeof r.completedAt === "number" ? r.completedAt : null,
  };
}

/** Newer answers win; an answer is never erased by a turn that did not mention it. */
export function mergeIntake(prev: Intake, patch: Partial<Intake>): Intake {
  const next = { ...prev };
  for (const key of Object.keys(patch) as (keyof Intake)[]) {
    const value = patch[key];
    if (value == null) continue;
    if (key === "concerns") {
      const add = value as Specialization[];
      if (add.length) next.concerns = [...new Set([...prev.concerns, ...add])];
      continue;
    }
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

// ---------------------------------------------------------------- matching

/** Which professions suit which kind of help. First is the closest fit. */
const FIT: Record<Exclude<SupportType, "unsure">, Profession[]> = {
  therapy: ["therapist", "psychologist", "counsellor", "psychiatric-nurse"],
  counselling: ["counsellor", "therapist", "social-worker", "psychologist"],
  coaching: ["coach", "counsellor"],
  "social-support": ["social-worker", "counsellor"],
};

export type Match = {
  profile: CounsellorProfile;
  score: number;
  /** Why this person was suggested, in a few words each. Most important first. */
  reasons: string[];
};

/**
 * Rank counsellors for one person.
 *
 * Nobody is filtered out — a directory of tens cannot afford to show someone
 * nothing — but a mismatch on something they asked for sinks a profile well
 * below the ones that fit. Language carries the most weight: a person who
 * asked for Wolof and is matched with someone who cannot speak it has not
 * been helped at all.
 */
export function rankCounsellors(profiles: CounsellorProfile[], intake: Intake | null): Match[] {
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

      const shared = want.concerns.filter((c) => profile.specializations.includes(c));
      score += Math.min(shared.length, 3) * 14;
      for (const c of shared.slice(0, 2)) reasons.push(SPECIALIZATION_LABELS[c]);

      if (want.supportType && want.supportType !== "unsure" && profile.profession) {
        const fit = FIT[want.supportType].indexOf(profile.profession);
        if (fit >= 0) {
          score += 12 - fit * 3;
          if (fit === 0) reasons.push(PROFESSION_LABELS[profile.profession]);
        }
      }

      if (want.counsellorGender && want.counsellorGender !== "any" && profile.gender) {
        if (profile.gender === want.counsellorGender) {
          score += 14;
          reasons.push(profile.gender === "woman" ? "Woman" : "Man");
        } else {
          score -= 20;
        }
      }

      if (want.format && want.format !== "any") {
        if (profile.formats.includes(want.format)) {
          score += 10;
          reasons.push(FORMAT_LABELS[want.format]);
        } else {
          score -= 8;
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
  const locale = localeOf(intake.language);
  if (locale) chips.push(LOCALE_NAME[locale]);
  for (const c of intake.concerns.slice(0, 3)) chips.push(SPECIALIZATION_LABELS[c]);
  if (intake.supportType && intake.supportType !== "unsure") chips.push(SUPPORT_LABELS[intake.supportType]);
  if (intake.counsellorGender && intake.counsellorGender !== "any") {
    chips.push(intake.counsellorGender === "woman" ? "A woman" : "A man");
  }
  if (intake.format && intake.format !== "any") chips.push(FORMAT_LABELS[intake.format]);
  return chips;
}
