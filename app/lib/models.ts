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

import type { Intake, ProviderGender, Service, SessionFormat } from "./matching";

// ---------------------------------------------------------------- collections

export const COLLECTIONS = {
  users: "users",
  moodEntries: "moodEntries",
  journalEntries: "journalEntries",
  consentEvents: "consentEvents",
  providerProfiles: "providerProfiles",
  privateDocs: "privateDocs",
  verificationRequests: "verificationRequests",
  availability: "availability",
  slots: "slots",
  bookings: "bookings",
  sessions: "sessions",
  chats: "chats",
  messages: "messages",
  notes: "notes",
  calls: "calls",
  callerCandidates: "callerCandidates",
  calleeCandidates: "calleeCandidates",
  transactions: "transactions",
  /** `payments/{paymentIntentId}` — server-written payment state. */
  payments: "payments",
  /**
   * `paymentEvents/{eventKey}` — the webhook idempotency ledger. One document
   * per delivery acted on; its only job is to exist. See
   * functions/src/payments.ts for why it is written in the same transaction as
   * the fulfilment it guards.
   */
  paymentEvents: "paymentEvents",
  /**
   * `entitlements/{uid}` — the AI consultation somebody has paid for. Server-
   * written only, and a collection of its own rather than a field on the user
   * document: that document is self-writable, so a field there would let
   * anybody grant themselves the D200 consultation from the browser console.
   */
  entitlements: "entitlements",
  resources: "resources",
  escalations: "escalations",
  organizations: "organizations",
  members: "members",
  auditLogs: "auditLogs",
  supportRequests: "supportRequests",
} as const;

// ---------------------------------------------------------------------- roles

/**
 * `therapist` and `counsellor` are retained as deprecated aliases: earlier
 * versions shipped
 * with it and existing user documents may carry it. Read paths normalise it to
 * `provider` via `normaliseRole`; nothing new should write it.
 */
export type AppRole = "patient" | "provider" | "admin" | "org_admin";

/** Both older names for the same role still exist in stored documents. */
export type StoredRole = AppRole | "therapist" | "counsellor";

export function normaliseRole(role: string | undefined | null): AppRole {
  if (role === "therapist" || role === "counsellor") return "provider";
  if (
    role === "patient" ||
    role === "provider" ||
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
  /**
   * When Talk SPOKE the consent and they said yes — out loud or by tapping.
   * Distinct from acceptedTermsAt, which only ever meant a button press under
   * small print: for somebody who cannot read, that was never consent.
   */
  spokenConsentAt: number | null;
  /**
   * A guardian completed the under-18 form. For onboarding, triage and
   * flagging ONLY — never clinical consent, which the provider obtains under
   * their own licensing before treatment begins.
   */
  guardianConsent: boolean;
  guardianConsentAt: number | null;
};

export const DEFAULT_CONSENTS: Consents = {
  dataProcessing: false,
  aiDisclosure: false,
  personalInsights: false,
  marketing: false,
  acceptedTermsAt: null,
  spokenConsentAt: null,
  guardianConsent: false,
  guardianConsentAt: null,
};

export type UserDoc = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: AppRole;
  /** Providers only: cleared credential review. Always true for patients. */
  verified: boolean;
  locale: Locale;
  onboarded: boolean;
  /**
   * What the person said brought them here, captured at intake. Used to
   * suggest resources and, later, to shortlist providers — never shown to
   * anyone but the user themselves.
   */
  goals: string[];
  consents: Consents;
  /**
   * What Talk learned in the intake conversation — the basis for provider
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
  /**
   * The evidence: what language the consent was given in, whether it was
   * spoken or tapped, the version of the words they heard, and — for a
   * guardian — their relationship to the patient and their typed name.
   */
  detail?: Record<string, unknown> | null;
};

/**
 * The consent keys that hold a yes or no.
 *
 * recordConsent writes `consents.<key> = granted`, so it must only ever be
 * given these. The timestamp keys (acceptedTermsAt, spokenConsentAt,
 * guardianConsentAt) are numbers, and writing `true` into one would corrupt
 * the very record that says WHEN somebody agreed.
 */
export type BooleanConsentKey = {
  [K in keyof Consents]: Consents[K] extends boolean ? K : never;
}[keyof Consents];

// ----------------------------------------------------------------- providers

export type ProviderStatus =
  | "draft"
  | "pending"
  | "verified"
  | "rejected"
  | "suspended";

export type ProviderProfile = {
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
  status: ProviderStatus;
  photoPath: string | null;
  ratingAvg: number;
  ratingCount: number;
  timezone: string;
  /**
   * What this person offers — therapy, psychotherapy, mental health
   * counselling, psychosocial support, social work. Matched directly against
   * what someone asks Talk for.
   */
  services: Service[];
  /** Many people ask for a provider of a particular gender; null if unstated. */
  gender: ProviderGender | null;
  /** How they meet clients. */
  formats: SessionFormat[];
  /** Town or area, e.g. "Serrekunda". */
  location: string | null;
  /**
   * A sample profile for testing the product, not a real person. Always
   * labelled as such wherever it is shown. See scripts/seed-sample-providers.
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
  providerId: string;
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
  providerId: string;
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
  providerId: string;
  /**
   * Denormalised `[patientId, providerId]`. Load-bearing: one composite
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
  /**
   * The patient said they are under 18. Stamped by the bookSession function
   * from the patient's own record — the client never supplies it, and the
   * rules refuse every client write to a booking, so it cannot be cleared.
   */
  patientMinor: boolean;
  /**
   * A Google Meet link the provider may attach, for anyone who would rather
   * meet there. The session itself happens inside Talk; this is the fallback
   * the owner asked for, set by the provider and nobody else (firestore.rules
   * lets them write this one field and only a meet.google.com address).
   */
  meetUrl: string | null;
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
  providerId: string | null;
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
  providerId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

// ------------------------------------------------------------------- pricing

/**
 * AI consultation tiers. Pricing is set so a human provider is the cheaper and
 * therefore encouraged path — the AI is a bridge, not a destination.
 */
export const AI_TIERS = {
  initial: {
    id: "initial",
    label: "Initial consultation",
    amountMinor: 200_00,
    durationSec: 8 * 60,
    blurb: "A first conversation, up to 8 minutes, that ends with matched providers.",
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

/** What a consultation payment is FOR, as it travels in the payment's metadata. */
export const AI_PURPOSE: Record<AiTierId, string> = {
  initial: "ai_initial",
  extended: "ai_extended",
};

export function tierForPurpose(purpose: string | null | undefined): AiTierId | null {
  if (purpose === AI_PURPOSE.initial) return "initial";
  if (purpose === AI_PURPOSE.extended) return "extended";
  return null;
}

/**
 * How long after paying somebody has to START the conversation they bought.
 * Generous, so a phone that died or a bad connection is not a lost D200.
 */
export const AI_ENTITLEMENT_VALID_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Once started, a conversation may run to this multiple of its paid length,
 * wall-clock, from its first word — 8 minutes becomes 12, 20 becomes 30. The
 * slack is for pauses and a dropped line; the limit is what makes "up to 8
 * minutes" true. Enforced by the server from the token, not by the page.
 */
export const AI_WINDOW_GRACE = 1.5;

/** When a conversation that started at `startedAt` must end. */
export function consultationEndsAt(tier: AiTierId, startedAt: number, expiresAt: number): number {
  return Math.min(startedAt + AI_TIERS[tier].durationSec * 1000 * AI_WINDOW_GRACE, expiresAt);
}

/**
 * What a held consultation pays for. The initial one is the intake — the
 * conversation that ends with matched providers. Talking to Talk after that
 * is the longer one. The longer one covers an intake too.
 */
export function tierCovers(held: AiTierId, mode: "intake" | "companion"): boolean {
  return mode === "intake" ? true : held === "extended";
}

/** Holding `held`, would buying `wanted` be paying twice for the same thing? */
export function tierAlreadyHeld(held: AiTierId, wanted: AiTierId): boolean {
  return held === "extended" || held === wanted;
}

/**
 * `entitlements/{uid}` — WRITTEN ONLY BY THE SERVER, by the same transaction
 * that marks the payment fulfilled. This is what decides whether somebody
 * received the consultation they paid for.
 */
export type Entitlement = {
  uid: string;
  aiTier: AiTierId;
  durationLimitSec: number;
  status: "granted";
  paymentIntentId: string;
  amountMinor: number;
  grantedAt: number;
  /** Start by this, or it lapses. */
  expiresAt: number;
  /** When the conversation began — set by the server the first time it starts. */
  startedAt: number | null;
  /** When it must end. Null until it starts. */
  endsAt: number | null;
  updatedAt: number;
};

/** Paid for, not lapsed, and — once started — not yet run out. */
export function entitlementActive(
  e: Pick<Entitlement, "status" | "expiresAt"> & { endsAt?: number | null } | null,
  now: number,
): boolean {
  if (!e || e.status !== "granted" || e.expiresAt <= now) return false;
  return e.endsAt == null || e.endsAt > now;
}

/** Concept note range for human consultations: D700–D3,000. */
export const HUMAN_RATE_MIN_MINOR = 700_00;
export const HUMAN_RATE_MAX_MINOR = 3_000_00;

// ------------------------------------------------------------- WebRTC rooms

/**
 * Signaling document at `calls/{sessionId}`. Holds only the SDP handshake;
 * ICE candidates live in the two subcollections beside it.
 *
 * Provider is always the impolite peer (initiator) and the patient always
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
  providerId: string | null;
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

// -------------------------------------------------------------- payments

/**
 * `payments/{paymentIntentId}` — one document per payment intent.
 *
 * WRITTEN ONLY BY THE SERVER, with the Admin SDK, from
 * functions/src/payments.ts. firestore.rules lets the owner read their own and
 * lets no client write any of it, because this document is what decides
 * whether someone received the thing they paid for.
 *
 * Distinct from `Transaction` above, which is the ledger a user and a provider
 * see for their own history. This is the gateway's state machine.
 */
export type PaymentDoc = {
  /** The provider's payment-intent id, and this document's own id. */
  paymentIntentId: string;
  provider: "modempay" | "simulated";
  /** Who paid. Null only while a payment is held for review unmatched. */
  uid: string | null;
  /** What was bought, e.g. "ai_initial". Matches `PaymentPurpose`. */
  purpose: string | null;
  /** What we asked for, in bututs. The figure the webhook checks against. */
  amountMinor: number | null;
  currency: "GMD";
  /** Rails the hosted page offered, e.g. ["wallet", "card"]. */
  paymentMethods: string[];
  status: "pending" | "succeeded" | "failed";
  /** Last event name applied, for tracing a payment's history. */
  event: string | null;
  /** True once the thing paid for has actually been granted. */
  fulfilled: boolean;
  /**
   * Money arrived but something did not add up — the payer could not be
   * matched, or the amount differed. Deliberately NOT auto-activated; a human
   * resolves it with the money already safely received.
   */
  needsReview: boolean;
  reviewReason: string | null;
  customerEmail: string | null;
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
  | "provider"
  | "organisation"
  | "safety";

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  general: "General question",
  account: "My account",
  booking: "A booking or payment",
  provider: "Joining as a provider",
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

// ---------------------------------------------------------------------- chat

/**
 * A conversation. One document per thread, carrying enough denormalised state
 * to render the whole chat list without reading a single message.
 *
 * `participants` is the entire access control story: firestore.rules tests
 * membership of this array and nothing else, which is why the rules forbid
 * changing it after create. Adding a uid to a live chat would retroactively
 * hand over every message in it.
 *
 * Shaped for groups from the start even though the UI is 1:1 — group sessions
 * are coming, and the only thing that changes is the length of this array.
 */
export type Chat = {
  id: string;
  participants: string[];
  /**
   * A group session's name, set by the provider who started it — "Thursday
   * grief group". Null for a two-person chat, which is named by the other
   * person.
   */
  title: string | null;
  /**
   * Who started a group session. The provider leads it; firestore.rules only
   * lets a provider create one. Null for a two-person chat.
   */
  createdBy: string | null;
  /**
   * uid -> display name, written once when the chat is opened.
   *
   * Denormalised because there is no other way for a provider to learn a
   * patient's name: firestore.rules refuses `users/{uid}` to everyone but its
   * owner and an admin, and that is worth keeping. Whoever opens the chat can
   * read both names at that moment — their own profile and the provider
   * directory — so writing them here costs nothing and spares the provider
   * side a thread full of "Patient".
   *
   * Only the people in the chat can read it. May be missing on a chat opened
   * before this field existed, so every reader needs a fallback.
   */
  names: Record<string, string>;
  /**
   * The patient is under 18. Denormalised here because `users/{uid}` is
   * refused to the provider by design and must stay that way — this is how
   * the flag reaches the chat header without widening that rule. Written by
   * the patient's own client, so a determined minor could clear it; the copy a
   * provider can trust is `Booking.patientMinor`, written by the server.
   */
  minor: boolean;
  /** Preview line for the chat list. For media this is a label, not a caption. */
  lastMessage: string;
  lastMessageAt: number;
  /**
   * Messages each participant has not opened yet, keyed by uid. Kept on the
   * chat so the list badge costs no message reads: a sender increments
   * everyone else's counter in the same batch that writes the message.
   */
  unread: Record<string, number>;
  /**
   * uid -> client clock reading when they were last seen typing. A timestamp
   * rather than a boolean because a tab closed mid-sentence can never clear a
   * boolean, and the thread would then show "typing…" for ever. Readers treat
   * anything older than TYPING_TTL_MS as not typing.
   */
  typing: Record<string, number>;
  createdAt: number;
};

export type ChatMessageKind = "text" | "voice" | "image" | "file";

/**
 * One message.
 *
 * `participants` is copied from the parent chat onto every message, exactly as
 * `SessionMessage` does it and for the same reason: the obvious rule — get()
 * the parent chat — bills a document read per message, and a conversation that
 * is actually working produces hundreds against a 50k/day free quota.
 */
export type ChatMessage = {
  id: string;
  senderId: string;
  participants: string[];
  kind: ChatMessageKind;
  /** The body for `text`; for media kinds, a label that can stand in for it. */
  text: string;
  /**
   * Storage object path — NOT a download URL. A `getDownloadURL()` token is a
   * capability that bypasses storage.rules entirely, so storing the path and
   * fetching through `getBlob()` is what actually keeps a voice note private
   * to the people in the chat. See the `chat-media/` block in storage.rules.
   */
  mediaPath: string | null;
  /** Voice notes only. */
  durationSec: number | null;
  /**
   * Set once a voice note has been transcribed, so it can be read aloud or
   * read as text. Nothing writes it yet — transcription is a later phase — but
   * the field exists so switching it on needs no migration.
   */
  transcript: string | null;
  createdAt: number;
  /** uids who have opened the thread since this arrived. Includes the sender. */
  readBy: string[];
  /**
   * Local only — never written, never read back. True while Firestore has the
   * write queued but the server has not acknowledged it, which is the real
   * distinction behind the one-tick / two-tick state.
   */
  pending?: boolean;
};
