/**
 * Domain model for Talk.
 *
 * Single source of truth for collection names and document shapes. The paths
 * here mirror `firestore.rules` exactly — if you add a collection, add a rule
 * for it too, or it falls through to the catch-all deny.
 *
 * Money convention: every amount is an integer in *minor units* (bututs;
 * 1 Dalasi = 100 bututs), named `...Minor`. Never store money as a float.
 * See `app/lib/money.ts` for formatting.
 */

import type { CounsellorGender, Intake, Profession, SessionFormat } from "./matching";

// ---------------------------------------------------------------- collections

export const COLLECTIONS = {
  users: "users",
  moodEntries: "moodEntries",
  journalEntries: "journalEntries",
  consentEvents: "consentEvents",
  counsellorProfiles: "counsellorProfiles",
  privateDocs: "privateDocs",
  verificationRequests: "verificationRequests",
  availability: "availability",
  slots: "slots",
  bookings: "bookings",
  sessions: "sessions",
  messages: "messages",
  notes: "notes",
  calls: "calls",
  callerCandidates: "callerCandidates",
  calleeCandidates: "calleeCandidates",
  transactions: "transactions",
  resources: "resources",
  escalations: "escalations",
  organizations: "organizations",
  members: "members",
  auditLogs: "auditLogs",
  supportRequests: "supportRequests",
} as const;

// ---------------------------------------------------------------------- roles

/**
 * `therapist` is retained as a deprecated alias: the original auth.ts shipped
 * with it and existing user documents may carry it. Read paths normalise it to
 * `counsellor` via `normaliseRole`; nothing new should write it.
 */
export type AppRole = "patient" | "counsellor" | "admin" | "org_admin";

export type StoredRole = AppRole | "therapist";

export function normaliseRole(role: string | undefined | null): AppRole {
  if (role === "therapist") return "counsellor";
  if (
    role === "patient" ||
    role === "counsellor" ||
    role === "admin" ||
    role === "org_admin"
  ) {
    return role;
  }
  return "patient";
}

/** Languages the platform commits to in the concept note. */
export type Locale = "en" | "wo" | "mnk" | "ff";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  wo: "Wolof",
  mnk: "Mandinka",
  ff: "Pulaar",
};

// ---------------------------------------------------------------------- users

/**
 * Consent is tracked as explicit booleans rather than one blanket "accepted"
 * flag, because the concept note requires separately-consented features
 * (Personal Insights in particular) and the right to withdraw one without
 * losing the rest.
 */
export type Consents = {
  dataProcessing: boolean;
  aiDisclosure: boolean;
  personalInsights: boolean;
  marketing: boolean;
  acceptedTermsAt: number | null;
};

export const DEFAULT_CONSENTS: Consents = {
  dataProcessing: false,
  aiDisclosure: false,
  personalInsights: false,
  marketing: false,
  acceptedTermsAt: null,
};

export type UserDoc = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: AppRole;
  /** Counsellors only: cleared credential review. Always true for patients. */
  verified: boolean;
  locale: Locale;
  onboarded: boolean;
  /**
   * What the person said brought them here, captured at intake. Used to
   * suggest resources and, later, to shortlist counsellors — never shown to
   * anyone but the user themselves.
   */
  goals: string[];
  consents: Consents;
  /**
   * What Talk learned in the intake conversation — the basis for counsellor
   * suggestions. Null until they have talked to her. Private to the user.
   */
  intake: Intake | null;
  /** Set when the user belongs to an institutional package. */
  orgId?: string | null;
  createdAt: number;
  updatedAt: number;
};

// ------------------------------------------------------- wellbeing (private)

/**
 * Intake options.
 *
 * Phrased as situations rather than diagnoses on purpose — "I have been
 * feeling low" is something a person will tick; "depression" is something they
 * will close the tab over.
 */
export const INTAKE_GOALS = [
  { id: "low", label: "I have been feeling low" },
  { id: "anxious", label: "I feel anxious or on edge" },
  { id: "stress", label: "Work or study is overwhelming me" },
  { id: "grief", label: "I have lost someone" },
  { id: "relationships", label: "Something is difficult at home" },
  { id: "lonely", label: "I feel alone" },
  { id: "sleep", label: "I am not sleeping well" },
  { id: "self", label: "I want to understand myself better" },
  { id: "unsure", label: "I am not sure yet" },
] as const;

/** 1 = worst, 5 = best. Deliberately coarse — this is a check-in, not a scale. */
export type MoodScore = 1 | 2 | 3 | 4 | 5;

export const MOOD_LABELS: Record<MoodScore, string> = {
  1: "Struggling",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Great",
};

export type MoodEntry = {
  id: string;
  score: MoodScore;
  /** Free-form tags the user picks, e.g. "sleep", "work", "family". */
  tags: string[];
  note: string;
  recordedAt: number;
};

export type JournalEntry = {
  id: string;
  title: string;
  body: string;
  /** Set when the entry was written against a guided prompt. */
  promptId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ConsentEvent = {
  id: string;
  key: keyof Consents;
  granted: boolean;
  /** Where the user was when they made the choice, for auditability. */
  surface: string;
  recordedAt: number;
};

// --------------------------------------------------------------- counsellors

export type CounsellorStatus =
  | "draft"
  | "pending"
  | "verified"
  | "rejected"
  | "suspended";

export type CounsellorProfile = {
  uid: string;
  displayName: string;
  headline: string;
  bio: string;
  specializations: string[];
  languages: Locale[];
  qualifications: string[];
  yearsExperience: number;
  /** Per-session fee in bututs. Concept note range: D700–D3,000. */
  sessionRateMinor: number;
  status: CounsellorStatus;
  photoPath: string | null;
  ratingAvg: number;
  ratingCount: number;
  timezone: string;
  /** Which kind of professional — decides fit for the help someone asked for. */
  profession: Profession | null;
  /** Many people ask for a counsellor of a particular gender; null if unstated. */
  gender: CounsellorGender | null;
  /** How they meet clients. */
  formats: SessionFormat[];
  /** Town or area, e.g. "Serrekunda". */
  location: string | null;
  /**
   * A sample profile for testing the product, not a real person. Always
   * labelled as such wherever it is shown. See scripts/seed-sample-counsellors.
   */
  sample: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CredentialDoc = {
  id: string;
  label: string;
  /** Storage download URL. Treated as a capability — see firestore.rules. */
  url: string;
  storagePath: string;
  contentType: string;
  bytes: number;
  uploadedAt: number;
};

export type VerificationRequest = {
  id: string;
  counsellorId: string;
  status: "pending" | "approved" | "rejected";
  /** Admin's note on the decision. Shown to the applicant on rejection. */
  reviewNote: string | null;
  reviewedBy: string | null;
  submittedAt: number;
  reviewedAt: number | null;
};

// ------------------------------------------------------ availability/booking

export type SlotStatus = "open" | "held" | "booked" | "cancelled";

export type AvailabilitySlot = {
  id: string;
  counsellorId: string;
  startsAt: number;
  endsAt: number;
  status: SlotStatus;
  bookingId: string | null;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "processing" | "paid" | "refunded" | "failed";

export type Booking = {
  id: string;
  patientId: string;
  counsellorId: string;
  /**
   * Denormalised `[patientId, counsellorId]`. Load-bearing: one composite
   * index serves "my bookings" for both roles, and the security rule becomes
   * a membership test with no extra document reads.
   */
  participants: string[];
  slotId: string;
  startsAt: number;
  endsAt: number;
  status: BookingStatus;
  /** Only ever moved by the payment webhook — see firestore.rules. */
  paymentStatus: PaymentStatus;
  amountMinor: number;
  currency: "GMD";
  transactionId: string | null;
  patientNote: string;
  createdAt: number;
  updatedAt: number;
};

// ------------------------------------------------------------------ sessions

export type SessionKind = "ai" | "human";

export type SessionStatus = "scheduled" | "active" | "ended" | "abandoned";

export type TalkSession = {
  id: string;
  kind: SessionKind;
  patientId: string;
  /** Null for AI sessions. */
  counsellorId: string | null;
  /** Denormalised participant uids — see `Booking.participants`. */
  participants: string[];
  bookingId: string | null;
  status: SessionStatus;
  locale: Locale;
  startedAt: number | null;
  endedAt: number | null;
  /** Server-side duration cap in seconds, from the tier the user paid for. */
  durationLimitSec: number;
  createdAt: number;
};

export type MessageRole = "user" | "assistant" | "system";

export type SessionMessage = {
  id: string;
  /**
   * Copied from the parent session onto every message deliberately. The
   * obvious alternative — a get() on the parent in the security rule — costs
   * a billed read per message, and a companion conversation writes hundreds.
   * At the 50k reads/day free quota that alone would sink the app.
   */
  participants: string[];
  role: MessageRole;
  text: string;
  /** Set when the safety layer flagged this turn. */
  flagged?: boolean;
  createdAt: number;
};

export type SessionNote = {
  id: string;
  counsellorId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

// ------------------------------------------------------------------- pricing

/**
 * AI consultation tiers, straight from the concept note. Pricing is set so a
 * human counsellor is the cheaper and therefore encouraged path — the AI is a
 * bridge, not a destination.
 */
export const AI_TIERS = {
  initial: {
    id: "initial",
    label: "Initial consultation",
    amountMinor: 250_00,
    durationSec: 7 * 60,
    blurb: "A first 5–7 minute conversation that ends with a referral.",
  },
  extended: {
    id: "extended",
    label: "Extended session",
    amountMinor: 500_00,
    durationSec: 20 * 60,
    blurb: "A longer 20 minute check-in if you are not ready for a human yet.",
  },
} as const;

export type AiTierId = keyof typeof AI_TIERS;

/** Concept note range for human consultations: D700–D3,000. */
export const HUMAN_RATE_MIN_MINOR = 700_00;
export const HUMAN_RATE_MAX_MINOR = 3_000_00;

// ------------------------------------------------------------- WebRTC rooms

/**
 * Signaling document at `calls/{sessionId}`. Holds only the SDP handshake;
 * ICE candidates live in the two subcollections beside it.
 *
 * Counsellor is always the impolite peer (initiator) and the patient always
 * polite, derived from the session rather than negotiated — that resolves
 * glare without the two sides having to agree on a coin flip.
 */
export type CallRoom = {
  sessionId: string;
  participants: string[];
  offer: { type: "offer"; sdp: string } | null;
  answer: { type: "answer"; sdp: string } | null;
  state: "idle" | "offering" | "answering" | "connected" | "reconnecting" | "ended";
  /** Bumped on renegotiation or an ICE restart. */
  negotiationId: string;
  createdAt: number;
  endedAt: number | null;
  endedBy: string | null;
};

export type IceCandidateDoc = {
  id: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
  createdAt: number;
};

// -------------------------------------------------------------- transactions

export type TransactionStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

export type Transaction = {
  id: string;
  userId: string;
  counsellorId: string | null;
  bookingId: string | null;
  sessionId: string | null;
  provider: "modempay" | "simulated";
  /** Modem Pay payment-intent id. */
  providerRef: string | null;
  amountMinor: number;
  /** Platform's cut, for split payouts. */
  feeMinor: number;
  currency: "GMD";
  status: TransactionStatus;
  createdAt: number;
  updatedAt: number;
};

// ----------------------------------------------------------------- resources

export type ResourceFormat = "article" | "audio" | "video" | "exercise";

export type ResourceTopic =
  | "stress"
  | "grief"
  | "relationships"
  | "self-esteem"
  | "workplace"
  | "academic"
  | "loneliness"
  | "emotional-regulation"
  | "personal-development"
  | "coping"
  | "family";

export const RESOURCE_TOPIC_LABELS: Record<ResourceTopic, string> = {
  stress: "Stress management",
  grief: "Grief and loss",
  relationships: "Relationships",
  "self-esteem": "Self-esteem",
  workplace: "Workplace wellbeing",
  academic: "Academic pressure",
  loneliness: "Loneliness",
  "emotional-regulation": "Emotional regulation",
  "personal-development": "Personal development",
  coping: "Healthy coping",
  family: "Family and social",
};

export type Resource = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  format: ResourceFormat;
  topics: ResourceTopic[];
  locales: Locale[];
  readingMinutes: number;
  mediaUrl: string | null;
  coverPath: string | null;
  status: "draft" | "published";
  publishedAt: number | null;
  updatedAt: number;
};

// ---------------------------------------------------------------- escalation

/**
 * Raised when a conversation indicates possible immediate risk. The concept
 * note treats this as a foundational requirement, not a feature — see
 * `app/lib/safety/`.
 */
export type EscalationSeverity = "watch" | "urgent" | "emergency";

export type Escalation = {
  id: string;
  userId: string;
  sessionId: string | null;
  severity: EscalationSeverity;
  /** What tripped the check. Never the raw disclosure. */
  trigger: string;
  status: "open" | "acknowledged" | "resolved";
  handledBy: string | null;
  createdAt: number;
  resolvedAt: number | null;
};

// -------------------------------------------------------------- institutions

export type Organization = {
  id: string;
  name: string;
  kind: "company" | "university" | "school" | "ngo" | "youth" | "other";
  seatsPurchased: number;
  seatsUsed: number;
  contactEmail: string;
  createdAt: number;
  updatedAt: number;
};

export type OrgMember = {
  uid: string;
  orgRole: "admin" | "member";
  invitedEmail: string;
  status: "invited" | "active" | "removed";
  joinedAt: number | null;
};

// ------------------------------------------------------------ support

export type SupportTopic =
  | "general"
  | "account"
  | "booking"
  | "counsellor"
  | "organisation"
  | "safety";

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  general: "General question",
  account: "My account",
  booking: "A booking or payment",
  counsellor: "Joining as a counsellor",
  organisation: "Institutional packages",
  safety: "Reporting a concern",
};

export type SupportRequest = {
  id: string;
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  /** Null when submitted by someone who is not signed in. */
  userId: string | null;
  status: "new" | "open" | "resolved";
  createdAt: number;
};

// ----------------------------------------------------------------- audit log

export type AuditLog = {
  id: string;
  actorId: string;
  action: string;
  targetPath: string;
  metadata: Record<string, unknown>;
  createdAt: number;
};
