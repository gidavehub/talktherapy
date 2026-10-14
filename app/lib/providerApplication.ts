/**
 * A provider's application to join TALK: what they tell us, step by step, and
 * the checks it has to pass before a person reviews it.
 *
 * Pure on purpose — no Firebase, no React — because it is used on both sides:
 * the application screens check each step as it is filled in, and the
 * submitProviderApplication function checks the whole thing again on the
 * server, with exactly this code, before anything goes to staff. The browser's
 * check is a courtesy; the server's is the one that counts.
 *
 * Shape on disk: providerApplications/{uid}. The applicant writes the step
 * sections below (firestore.rules allows those keys and nothing else); the
 * status, the decision, the staff message and the history are written only by
 * the functions.
 */

import {
  AREAS,
  AREA_LABELS,
  SERVICES,
  SERVICE_LABELS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  type Area,
  type Service,
  type Specialization,
} from "./matching";
import { HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR, LOCALE_LABELS, type Locale } from "./models";
import { PLATFORM_FEE_RATE, formatDalasiRange, providerPayoutMinor } from "./money";
import type { PayoutNetwork } from "./payments/modempay-protocol";

// ------------------------------------------------------------------- status

export type ApplicationStatus =
  /** Being filled in. Only the applicant has seen it. */
  | "draft"
  /** Sent. Waiting for a member of staff to pick it up. */
  | "submitted"
  /** A member of staff is checking it. */
  | "in_review"
  /** Sent back with a message saying what to fix. Editable again. */
  | "changes_requested"
  /** Approved: their profile is live in the directory. */
  | "approved"
  /** Not approved, with the reason. */
  | "rejected"
  /** Was approved, and has been taken out of the directory. */
  | "suspended";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "Suspended",
};

/** The two states in which the applicant may edit. Mirrors firestore.rules. */
export function isEditable(status: ApplicationStatus): boolean {
  return status === "draft" || status === "changes_requested";
}

/** The two states in which an application is waiting on staff. */
export const AWAITING_STAFF: readonly ApplicationStatus[] = ["submitted", "in_review"];

// -------------------------------------------------------------------- steps

export type StepId =
  | "personal"
  | "professional"
  | "qualifications"
  | "practice"
  | "fee"
  | "photo"
  | "documents"
  | "availability"
  | "payout"
  | "agreements"
  | "review";

/** The sections the applicant fills in — every step except the final review. */
export type SectionId = Exclude<StepId, "review">;

export const STEPS: ReadonlyArray<{ id: StepId; label: string; title: string; lede: string }> = [
  {
    id: "personal",
    label: "About you",
    title: "First, a little about you.",
    lede: "Your legal name is for us; the name you choose is the one people see.",
  },
  {
    id: "professional",
    label: "Your work",
    title: "The work you do.",
    lede: "This is what TALK matches against what someone says they need, so be specific.",
  },
  {
    id: "qualifications",
    label: "Qualifications",
    title: "Where you trained.",
    lede: "Every qualification you list is checked against a document you upload.",
  },
  {
    id: "practice",
    label: "Your practice",
    title: "How you work with people.",
    lede: "Written for someone deciding whether to talk to you. Plain words beat credentials here.",
  },
  {
    id: "fee",
    label: "Your fee",
    title: "What one session costs.",
    lede: "You set your own fee. People see it before they book.",
  },
  {
    id: "photo",
    label: "Photo",
    title: "A photo of you.",
    lede: "Kept private until you are approved. Then it is the first thing people see.",
  },
  {
    id: "documents",
    label: "Documents",
    title: "Your documents.",
    lede: "Seen only by you and the staff member reviewing your application.",
  },
  {
    id: "availability",
    label: "Hours",
    title: "When you can see people.",
    lede: "Your usual week. Once you are approved these become times people can book.",
  },
  {
    id: "payout",
    label: "Payouts",
    title: "Where your earnings go.",
    lede: "Your share of each session is sent to a mobile-money wallet in your name.",
  },
  {
    id: "agreements",
    label: "Agreements",
    title: "How we work together.",
    lede: "Read each one. They protect the people you will support, and you.",
  },
  {
    id: "review",
    label: "Review",
    title: "Check, then send.",
    lede: "Everything you have told us, in one place. Change anything before you send it.",
  },
];

export const SECTION_IDS: SectionId[] = STEPS.map((s) => s.id).filter((id): id is SectionId => id !== "review");

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

export function isStepId(value: string): value is StepId {
  return STEPS.some((s) => s.id === value);
}

// --------------------------------------------------------------- vocabulary

/** Who someone sees. Feeds the patient's provider-gender preference. */
export const APPLICANT_GENDERS = ["woman", "man", "unsaid"] as const;
export type ApplicantGender = (typeof APPLICANT_GENDERS)[number];
export const APPLICANT_GENDER_LABELS: Record<ApplicantGender, string> = {
  woman: "Woman",
  man: "Man",
  unsaid: "Rather not say",
};

export const AGE_GROUPS = ["children", "teens", "adults", "older"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  children: "Children (under 13)",
  teens: "Teenagers (13 to 17)",
  adults: "Adults",
  older: "Older adults (65+)",
};

/** How sessions happen. Both run inside TALK. */
export const APPLICATION_FORMATS = ["video", "voice"] as const;
export type ApplicationFormat = (typeof APPLICATION_FORMATS)[number];
export const APPLICATION_FORMAT_LABELS: Record<ApplicationFormat, string> = {
  video: "Video call",
  voice: "Voice call",
};

/** The four languages TALK itself speaks, which the directory filters on. */
export const APPLICATION_LANGUAGES: Locale[] = ["en", "wo", "mnk", "ff"];
export { LOCALE_LABELS };

export const DOC_TYPES = ["id", "degree", "licence", "reference", "cv", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  id: "National ID or passport",
  degree: "Degree or certificate",
  licence: "Professional licence or registration",
  reference: "Reference letter",
  cv: "CV",
  other: "Something else",
};
export const DOC_TYPE_HINTS: Record<DocType, string> = {
  id: "Both sides, readable, not expired.",
  degree: "The certificate for a qualification you listed.",
  licence: "Your registration with a professional body, if you have one.",
  reference: "From a supervisor or employer who knows your work.",
  cv: "Your training and the places you have worked.",
  other: "Anything else that supports your application.",
};

/** What the server accepts. Mirrors storage.rules. */
export const DOC_ACCEPT = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
/** At most this many bytes, this one included — "10 MB" as phones count it. storage.rules says the same. */
export const DOC_MAX_BYTES = 10_000_000;
export const MAX_DOCUMENTS = 12;

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * What a chosen file really is, as one of DOC_ACCEPT, or null. Some phones and
 * older Windows set-ups hand a file over with no type at all; the drop area
 * lets those through by their name, so the upload has to name the type too —
 * Storage refuses a file whose type it is not told.
 */
export function documentContentType(fileName: string, declared: string): string | null {
  if (DOC_ACCEPT.includes(declared)) return declared;
  if (declared) return null;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? null;
}

/**
 * Whether `path` is one of this applicant's own private files: exactly one
 * plain file name under provider-credentials/{uid}/. Anything else — another
 * person's folder, a sub-folder, "..", an empty name — is not theirs to point
 * the application at, and approving it would copy or show somebody else's.
 */
export function isOwnCredentialPath(path: string, uid: string): boolean {
  const prefix = `provider-credentials/${uid}/`;
  if (!uid || !path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/.test(name) && !name.includes("..");
}

export const DAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

export const AGREEMENTS = [
  {
    id: "conduct",
    title: "Code of conduct",
    summary: "I will treat everyone I support with respect, honesty and care.",
    body: [
      "I will practise only within my training and experience, and refer someone on when what they need is beyond it.",
      "I will never ask for payment, gifts or favours outside TALK, and never move a person's sessions off TALK to avoid its fee.",
      "I will not form a personal, romantic or business relationship with anyone I support.",
      "I will keep my profile honest — my qualifications, my experience and the languages I work in.",
    ],
  },
  {
    id: "confidentiality",
    title: "Confidentiality",
    summary: "What people tell me stays private.",
    body: [
      "I will keep what people share with me confidential, and only break that confidence where someone's safety requires it or the law demands it.",
      "I will hold sessions somewhere I cannot be overheard, and never record a session.",
      "I will not share screenshots, messages or details of anyone I support, even without their name.",
    ],
  },
  {
    id: "safeguarding",
    title: "Safeguarding and crisis",
    summary: "If someone is at risk, I act — and I tell TALK.",
    body: [
      "TALK is not an emergency service. If someone is in immediate danger, I will make sure they know the free emergency numbers — 117 police, 116 ambulance, 118 fire — and help them reach help.",
      "I will take extra care with anyone under 18, and follow my professional safeguarding duties.",
      "I will tell TALK through support when I am worried about someone's safety.",
    ],
  },
  {
    id: "fees",
    title: "Fees and payouts",
    summary: `TALK keeps ${Math.round(PLATFORM_FEE_RATE * 100)}% of each session fee; the rest is mine.`,
    body: [
      `People pay for a session before it happens. TALK keeps ${Math.round(PLATFORM_FEE_RATE * 100)}% to cover payments, the platform, checks and support.`,
      "Twenty-four hours after a session ends, my share can be sent to my mobile-money wallet.",
      "If someone says a session did not happen, that fee is held while a person looks into it.",
    ],
  },
  {
    id: "accuracy",
    title: "Accuracy",
    summary: "Everything in this application is true.",
    body: [
      "The information and documents I have given are true and my own.",
      "I understand TALK may check them with the people and bodies named, and that a false statement ends my place on TALK.",
      "I am responsible for my own professional registration and insurance, and I am not employed by TALK.",
    ],
  },
] as const;
export type AgreementId = (typeof AGREEMENTS)[number]["id"];

// ------------------------------------------------------------------ sections

export type PersonalSection = {
  legalName: string;
  displayName: string;
  gender: ApplicantGender | null;
  /** "YYYY-MM-DD". */
  dateOfBirth: string;
  /** E.164, "+2207000000". */
  phone: string;
  area: Area | null;
  /** A town matching knows (lower-case), or the one they typed when outside the list. */
  town: string;
};

export type ProfessionalSection = {
  services: Service[];
  yearsExperience: number | null;
  workplace: string;
  registrationBody: string;
  registrationNumber: string;
  specializations: Specialization[];
  ageGroups: AgeGroup[];
  formats: ApplicationFormat[];
  languages: Locale[];
  /** Any other languages, in their words — Jola, Serahule, Serer, Arabic… */
  otherLanguages: string;
};

export type Qualification = {
  id: string;
  title: string;
  institution: string;
  year: number | null;
  country: string;
};

export type PracticeSection = {
  headline: string;
  bio: string;
  approach: string;
  firstSession: string;
};

export type FeeSection = { sessionRateMinor: number | null };

export type PhotoSection = { path: string | null };

export type ApplicationDocument = {
  id: string;
  type: DocType;
  /** The file's own name, for the applicant and the reviewer. */
  name: string;
  path: string;
  contentType: string;
  bytes: number;
  uploadedAt: number;
};

/** One stretch of a usual week. Times are "HH:MM" in Gambian time, which is UTC. */
export type AvailabilityRange = { id: string; day: number; start: string; end: string };
export type AvailabilitySection = { ranges: AvailabilityRange[] };

/** What the application shows of the payout account. The account itself is in payoutAccounts/{uid}. */
export type PayoutSection = {
  network: PayoutNetwork | null;
  accountHint: string;
  beneficiaryName: string;
};

export type AgreementsSection = {
  accepted: Partial<Record<AgreementId, boolean>>;
  /** Their full legal name, typed. */
  signature: string;
  signedAt: number | null;
};

export type ApplicationSections = {
  personal: PersonalSection;
  professional: ProfessionalSection;
  qualifications: Qualification[];
  practice: PracticeSection;
  fee: FeeSection;
  photo: PhotoSection;
  documents: ApplicationDocument[];
  availability: AvailabilitySection;
  payout: PayoutSection;
  agreements: AgreementsSection;
};

/** Every key the applicant may write. firestore.rules keeps exactly this list. */
export const APPLICANT_KEYS = [...SECTION_IDS, "lastStep", "updatedAt"] as const;

export type HistoryEvent = {
  at: number;
  type:
    | "created"
    | "submitted"
    | "resubmitted"
    | "review_started"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "suspended"
    | "reinstated";
  /** What staff said, shown to the applicant. */
  message?: string;
  /** Staff member's uid. Never shown to the applicant as a name. */
  by?: string;
};

export type ProviderApplication = ApplicationSections & {
  uid: string;
  status: ApplicationStatus;
  lastStep: StepId;
  /** The latest thing staff said to the applicant. */
  message: string | null;
  history: HistoryEvent[];
  createdAt: number;
  updatedAt: number;
  submittedAt: number | null;
  decidedAt: number | null;
};

export const EMPTY_SECTIONS: ApplicationSections = {
  personal: { legalName: "", displayName: "", gender: null, dateOfBirth: "", phone: "", area: null, town: "" },
  professional: {
    services: [],
    yearsExperience: null,
    workplace: "",
    registrationBody: "",
    registrationNumber: "",
    specializations: [],
    ageGroups: [],
    formats: ["video"],
    languages: [],
    otherLanguages: "",
  },
  qualifications: [],
  practice: { headline: "", bio: "", approach: "", firstSession: "" },
  fee: { sessionRateMinor: null },
  photo: { path: null },
  documents: [],
  availability: { ranges: [] },
  payout: { network: null, accountHint: "", beneficiaryName: "" },
  agreements: { accepted: {}, signature: "", signedAt: null },
};

// ---------------------------------------------------------------- reading it

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const pickAll = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => (allowed as readonly string[]).includes(x as string)))] : [];
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const STATUSES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
];
const HISTORY_TYPES: HistoryEvent["type"][] = [
  "created",
  "submitted",
  "resubmitted",
  "review_started",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
  "reinstated",
];
const NETWORKS: PayoutNetwork[] = ["wave", "afrimoney", "qmoney", "aps"];

/**
 * A stored application, made safe to use: every field present and of the
 * right type, whatever is actually in the document. Used by the screens and by
 * the functions, so a half-written draft never crashes either of them.
 */
export function toApplication(uid: string, raw: Record<string, unknown>): ProviderApplication {
  const personal = obj(raw.personal);
  const professional = obj(raw.professional);
  const practice = obj(raw.practice);
  const fee = obj(raw.fee);
  const photo = obj(raw.photo);
  const availability = obj(raw.availability);
  const payout = obj(raw.payout);
  const agreements = obj(raw.agreements);
  const accepted = obj(agreements.accepted);

  return {
    uid,
    status: pick(raw.status, STATUSES) ?? "draft",
    lastStep: (typeof raw.lastStep === "string" && isStepId(raw.lastStep) ? raw.lastStep : "personal") as StepId,
    message: typeof raw.message === "string" && raw.message ? raw.message : null,
    history: Array.isArray(raw.history)
      ? raw.history
          .map(obj)
          .map((h) => ({
            at: num(h.at) ?? 0,
            type: pick(h.type, HISTORY_TYPES) ?? "created",
            ...(typeof h.message === "string" && h.message ? { message: h.message } : {}),
            ...(typeof h.by === "string" ? { by: h.by } : {}),
          }))
      : [],
    createdAt: num(raw.createdAt) ?? 0,
    updatedAt: num(raw.updatedAt) ?? 0,
    submittedAt: num(raw.submittedAt),
    decidedAt: num(raw.decidedAt),
    personal: {
      legalName: str(personal.legalName, 120),
      displayName: str(personal.displayName, 80),
      gender: pick(personal.gender, APPLICANT_GENDERS),
      dateOfBirth: str(personal.dateOfBirth, 10),
      phone: str(personal.phone, 20),
      area: pick(personal.area, AREAS),
      town: str(personal.town, 80),
    },
    professional: {
      services: pickAll(professional.services, SERVICES),
      yearsExperience: num(professional.yearsExperience),
      workplace: str(professional.workplace, 120),
      registrationBody: str(professional.registrationBody, 120),
      registrationNumber: str(professional.registrationNumber, 80),
      specializations: pickAll(professional.specializations, SPECIALIZATIONS),
      ageGroups: pickAll(professional.ageGroups, AGE_GROUPS),
      formats: pickAll(professional.formats, APPLICATION_FORMATS),
      languages: pickAll(professional.languages, APPLICATION_LANGUAGES),
      otherLanguages: str(professional.otherLanguages, 120),
    },
    qualifications: Array.isArray(raw.qualifications)
      ? raw.qualifications.map(obj).map((q, i) => ({
          id: str(q.id, 40) || `q${i}`,
          title: str(q.title, 160),
          institution: str(q.institution, 160),
          year: num(q.year),
          country: str(q.country, 80),
        }))
      : [],
    practice: {
      headline: str(practice.headline, 120),
      bio: str(practice.bio, 1200),
      approach: str(practice.approach, 800),
      firstSession: str(practice.firstSession, 800),
    },
    fee: { sessionRateMinor: num(fee.sessionRateMinor) },
    photo: { path: typeof photo.path === "string" && photo.path ? photo.path : null },
    documents: Array.isArray(raw.documents)
      ? raw.documents.map(obj).map((d) => ({
          id: str(d.id, 60),
          type: pick(d.type, DOC_TYPES) ?? "other",
          name: str(d.name, 200),
          path: str(d.path, 300),
          contentType: str(d.contentType, 80),
          bytes: num(d.bytes) ?? 0,
          uploadedAt: num(d.uploadedAt) ?? 0,
        }))
      : [],
    availability: {
      ranges: Array.isArray(availability.ranges)
        ? availability.ranges.map(obj).map((r, i) => ({
            id: str(r.id, 40) || `r${i}`,
            day: num(r.day) ?? 1,
            start: str(r.start, 5),
            end: str(r.end, 5),
          }))
        : [],
    },
    payout: {
      network: pick(payout.network, NETWORKS),
      accountHint: str(payout.accountHint, 40),
      beneficiaryName: str(payout.beneficiaryName, 80),
    },
    agreements: {
      accepted: Object.fromEntries(
        AGREEMENTS.map((a) => [a.id, accepted[a.id] === true]),
      ) as Partial<Record<AgreementId, boolean>>,
      signature: str(agreements.signature, 120),
      signedAt: num(agreements.signedAt),
    },
  };
}

// ----------------------------------------------------------------- helpers

/** "+2207000000" from anything a Gambian mobile number is typed as. Null if it is not one. */
export function gambianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("220")) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith("00220")) digits = digits.slice(5);
  // Gambian mobile numbers are seven digits and start 2, 3, 5, 6, 7 or 9.
  return /^[235679]\d{6}$/.test(digits) ? `+220${digits}` : null;
}

/** "+220 700 0000" — how a number is read back. */
export function formatPhone(e164: string): string {
  const m = /^\+220(\d{3})(\d{4})$/.exec(e164);
  return m ? `+220 ${m[1]} ${m[2]}` : e164;
}

/** Whole years old on `now`, from "YYYY-MM-DD". Null when it is not a real date. */
export function ageOn(dateOfBirth: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) return null;
  const today = new Date(now);
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d)) age -= 1;
  return age;
}

/** What the provider receives from one session at this fee. */
export function takeHomeMinor(sessionRateMinor: number): number {
  return providerPayoutMinor(sessionRateMinor);
}

/** "HH:MM" as minutes after midnight, or null. */
export function minutesOf(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** How long one session lasts. Matches SESSION_MINUTES in booking.ts. */
export const SLOT_MINUTES = 45;
/** Sessions start on the hour: 45 minutes and a 15-minute breather. */
export const SLOT_STEP_MINUTES = 60;

/** The session start times one range gives, as minutes after midnight. */
export function startsIn(range: Pick<AvailabilityRange, "start" | "end">): number[] {
  const from = minutesOf(range.start);
  const to = minutesOf(range.end);
  if (from == null || to == null) return [];
  const starts: number[] = [];
  for (let t = from; t + SLOT_MINUTES <= to; t += SLOT_STEP_MINUTES) starts.push(t);
  return starts;
}

/** How many sessions a usual week holds. */
export function weeklySessions(ranges: AvailabilityRange[]): number {
  return ranges.reduce((sum, r) => sum + startsIn(r).length, 0);
}

/**
 * Real session start times (ms) from the usual week, for the `days` from
 * `fromMs`, skipping anything earlier than `notBefore`. Gambian time is UTC,
 * so a day here is a UTC day.
 */
export function slotTimesFrom(
  ranges: AvailabilityRange[],
  fromMs: number,
  days: number,
  notBefore: number,
): number[] {
  const start = new Date(fromMs);
  const day0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const dayMs = day0 + i * 86_400_000;
    const weekday = new Date(dayMs).getUTCDay();
    for (const range of ranges) {
      if (range.day !== weekday) continue;
      for (const minutes of startsIn(range)) {
        const at = dayMs + minutes * 60_000;
        if (at >= notBefore) out.push(at);
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// --------------------------------------------------------------- validation

/** Field → what is wrong with it, in words for the applicant. Empty when the step is fine. */
export type Problems = Record<string, string>;

const between = (s: string, min: number, max: number) => s.trim().length >= min && s.trim().length <= max;
const CURRENT_YEAR = (now: number) => new Date(now).getUTCFullYear();

export function checkPersonal(p: PersonalSection, now: number): Problems {
  const out: Problems = {};
  if (!between(p.legalName, 3, 100)) out.legalName = "Your full name, as it is on your ID.";
  if (!between(p.displayName, 2, 60)) out.displayName = "The name people will see — two letters at least.";
  if (!p.gender) out.gender = "Choose one. 'Rather not say' is fine.";
  const age = ageOn(p.dateOfBirth, now);
  // All three parts chosen and still not a date: the 31st of a short month.
  if (age == null && /^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth)) out.dateOfBirth = "That date does not exist — check the day.";
  else if (age == null) out.dateOfBirth = "Your date of birth.";
  else if (age < 18) out.dateOfBirth = "Providers on TALK are 18 or older.";
  else if (age > 100) out.dateOfBirth = "Check the year.";
  if (!gambianPhone(p.phone)) out.phone = "A Gambian mobile number — seven digits, like 700 0000.";
  if (!p.area) out.area = "Where you are based.";
  if (!between(p.town, 2, 60)) out.town = "Your town or area.";
  return out;
}

export function checkProfessional(p: ProfessionalSection): Problems {
  const out: Problems = {};
  if (p.services.length === 0) out.services = "At least one kind of support you offer.";
  if (p.yearsExperience == null || !Number.isInteger(p.yearsExperience) || p.yearsExperience < 0 || p.yearsExperience > 60)
    out.yearsExperience = "Whole years, from 0 to 60.";
  if (p.workplace.trim().length > 100) out.workplace = "Keep it under 100 characters.";
  if (p.registrationBody.trim().length > 100) out.registrationBody = "Keep it under 100 characters.";
  if (p.registrationNumber.trim().length > 60) out.registrationNumber = "Keep it under 60 characters.";
  if (p.registrationNumber.trim() && !p.registrationBody.trim())
    out.registrationBody = "Which body is that number with?";
  if (p.specializations.length === 0) out.specializations = "At least one thing you work with.";
  else if (p.specializations.length > 8) out.specializations = "Eight at most — the ones you know best.";
  if (p.ageGroups.length === 0) out.ageGroups = "Who you work with.";
  if (p.formats.length === 0) out.formats = "Video, voice, or both.";
  if (p.languages.length === 0) out.languages = "At least one of the four languages.";
  if (p.otherLanguages.trim().length > 100) out.otherLanguages = "Keep it under 100 characters.";
  return out;
}

export function checkQualifications(list: Qualification[], now: number): Problems {
  const out: Problems = {};
  if (list.length === 0) out.list = "At least one qualification.";
  if (list.length > 8) out.list = "Eight at most.";
  list.forEach((q, i) => {
    if (!between(q.title, 3, 120)) out[`${i}.title`] = "The qualification's name.";
    if (!between(q.institution, 2, 120)) out[`${i}.institution`] = "Where you studied.";
    if (q.year == null || !Number.isInteger(q.year) || q.year < 1950 || q.year > CURRENT_YEAR(now))
      out[`${i}.year`] = "The year you finished.";
    if (!between(q.country, 2, 60)) out[`${i}.country`] = "The country.";
  });
  return out;
}

export const HEADLINE_MAX = 80;
export const BIO_MIN = 160;
export const BIO_MAX = 600;
export const APPROACH_MIN = 40;
export const APPROACH_MAX = 400;
export const FIRST_SESSION_MAX = 400;

export function checkPractice(p: PracticeSection): Problems {
  const out: Problems = {};
  if (!between(p.headline, 10, HEADLINE_MAX)) out.headline = `One line, 10 to ${HEADLINE_MAX} characters.`;
  if (!between(p.bio, BIO_MIN, BIO_MAX)) out.bio = `${BIO_MIN} to ${BIO_MAX} characters.`;
  if (!between(p.approach, APPROACH_MIN, APPROACH_MAX)) out.approach = `${APPROACH_MIN} to ${APPROACH_MAX} characters.`;
  if (p.firstSession.trim().length > FIRST_SESSION_MAX) out.firstSession = `Up to ${FIRST_SESSION_MAX} characters.`;
  return out;
}

export function checkFee(f: FeeSection): Problems {
  const fee = f.sessionRateMinor;
  if (fee == null || !Number.isInteger(fee)) return { sessionRateMinor: "Set your fee." };
  if (fee < HUMAN_RATE_MIN_MINOR || fee > HUMAN_RATE_MAX_MINOR)
    return { sessionRateMinor: `Between ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)}.` };
  if (fee % 100 !== 0) return { sessionRateMinor: "Whole dalasi only." };
  return {};
}

export function checkPhoto(p: PhotoSection, uid: string): Problems {
  if (!p.path) return { path: "Add a photo of yourself." };
  if (!isOwnCredentialPath(p.path, uid)) return { path: "Upload the photo again." };
  return {};
}

export function checkDocuments(docs: ApplicationDocument[], uid: string): Problems {
  const out: Problems = {};
  if (docs.length > MAX_DOCUMENTS) out.list = `${MAX_DOCUMENTS} documents at most.`;
  if (!docs.some((d) => d.type === "id")) out.id = "Your national ID or passport.";
  if (!docs.some((d) => d.type === "degree" || d.type === "licence"))
    out.qualification = "At least one certificate or licence.";
  docs.forEach((d, i) => {
    if (!isOwnCredentialPath(d.path, uid)) out[`${i}`] = "Upload this one again.";
    else if (!DOC_ACCEPT.includes(d.contentType)) out[`${i}`] = "PDF, JPG, PNG or WebP only.";
    else if (d.bytes <= 0 || d.bytes > DOC_MAX_BYTES) out[`${i}`] = "10 MB at most.";
  });
  return out;
}

export function checkAvailability(a: AvailabilitySection): Problems {
  const out: Problems = {};
  if (a.ranges.length === 0) out.list = "At least one time in your week.";
  if (a.ranges.length > 30) out.list = "Thirty stretches at most.";
  a.ranges.forEach((r, i) => {
    const from = minutesOf(r.start);
    const to = minutesOf(r.end);
    if (!DAYS.some((d) => d.value === r.day)) out[`${i}`] = "Choose a day.";
    else if (from == null || to == null) out[`${i}`] = "Choose a start and an end.";
    else if (to - from < SLOT_MINUTES) out[`${i}`] = `Long enough for one ${SLOT_MINUTES}-minute session.`;
  });
  // Two stretches on the same day that overlap would offer the same hour twice.
  for (let i = 0; i < a.ranges.length; i++) {
    for (let j = i + 1; j < a.ranges.length; j++) {
      const x = a.ranges[i];
      const y = a.ranges[j];
      if (x.day !== y.day) continue;
      const [xs, xe, ys, ye] = [minutesOf(x.start), minutesOf(x.end), minutesOf(y.start), minutesOf(y.end)];
      if (xs == null || xe == null || ys == null || ye == null) continue;
      if (xs < ye && ys < xe) out[`${j}`] = "This overlaps another time on the same day.";
    }
  }
  return out;
}

export function checkPayout(p: PayoutSection): Problems {
  if (!p.network || !p.accountHint || !p.beneficiaryName.trim()) return { account: "Save the wallet your earnings go to." };
  return {};
}

/** Same name, ignoring case, spacing and accents a keyboard may or may not have. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .trim();
  return norm(a).length > 0 && norm(a) === norm(b);
}

export function checkAgreements(a: AgreementsSection, legalName: string): Problems {
  const out: Problems = {};
  for (const agreement of AGREEMENTS) {
    if (a.accepted[agreement.id] !== true) out[agreement.id] = "Read and accept this to continue.";
  }
  if (!a.signature.trim()) out.signature = "Type your full name to sign.";
  else if (!sameName(a.signature, legalName)) out.signature = "Type your full name exactly as on the first step.";
  if (!a.signedAt) out.signature = out.signature ?? "Sign to continue.";
  return out;
}

/** Problems with one step. `review` has none of its own: it is everything else. */
export function checkStep(step: SectionId, app: ApplicationSections & { uid: string }, now: number): Problems {
  switch (step) {
    case "personal":
      return checkPersonal(app.personal, now);
    case "professional":
      return checkProfessional(app.professional);
    case "qualifications":
      return checkQualifications(app.qualifications, now);
    case "practice":
      return checkPractice(app.practice);
    case "fee":
      return checkFee(app.fee);
    case "photo":
      return checkPhoto(app.photo, app.uid);
    case "documents":
      return checkDocuments(app.documents, app.uid);
    case "availability":
      return checkAvailability(app.availability);
    case "payout":
      return checkPayout(app.payout);
    case "agreements":
      return checkAgreements(app.agreements, app.personal.legalName);
  }
}

export function stepComplete(step: SectionId, app: ApplicationSections & { uid: string }, now: number): boolean {
  return Object.keys(checkStep(step, app, now)).length === 0;
}

/** The steps that still have something wrong, in order. Empty means it can be sent. */
export function incompleteSteps(app: ApplicationSections & { uid: string }, now: number): SectionId[] {
  return SECTION_IDS.filter((id) => !stepComplete(id, app, now));
}

/** 0–1: how much of the application is done. */
export function completion(app: ApplicationSections & { uid: string }, now: number): number {
  return (SECTION_IDS.length - incompleteSteps(app, now).length) / SECTION_IDS.length;
}

// ------------------------------------------------- what the directory shows

export function qualificationLine(q: Qualification): string {
  return [q.title.trim(), q.institution.trim(), q.year ? String(q.year) : ""].filter(Boolean).join(", ");
}

/** Labels for the summary screens. */
export const LABELS = {
  area: AREA_LABELS,
  service: SERVICE_LABELS,
  specialization: SPECIALIZATION_LABELS,
  locale: LOCALE_LABELS,
};

export const RATE_RANGE = { min: HUMAN_RATE_MIN_MINOR, max: HUMAN_RATE_MAX_MINOR };
