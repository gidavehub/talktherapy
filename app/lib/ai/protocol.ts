/**
 * The wire contract between the voice surface and /api/companion/*.
 *
 * Shared by the browser and the server so the two cannot drift. Nothing in
 * here may import server code — this file ships to the client.
 */

import type { Intake } from "../matching";

export const LANGUAGES = ["english", "wolof", "mandinka", "pulaar", "other"] as const;
export type Language = (typeof LANGUAGES)[number];
/** What the model reports when the audio held no intelligible speech. */
export type HeardLanguage = Language | "none";

export const LANGUAGE_LABEL: Record<Language, string> = {
  english: "English",
  wolof: "Wolof",
  mandinka: "Mandinka",
  pulaar: "Pulaar",
  other: "Other",
};

export const RISK_LEVELS = ["none", "low", "elevated", "urgent"] as const;
export type Risk = (typeof RISK_LEVELS)[number];

/** One remembered line of the conversation, as the model will be shown it. */
export type HistoryTurn = {
  role: "user" | "talk";
  /** What was said, in the language it was said in. */
  text: string;
  /** English rendering, when `text` is not English. */
  english?: string;
  language?: Language;
};

/**
 * Context window, kept deliberately simple until it is designed properly:
 * the most recent turns verbatim, everything older folded into a running
 * summary. The client owns both and sends them each turn, so the server stays
 * stateless.
 */
export const MAX_HISTORY_TURNS = 24;
/** When history grows past the window, this many of the oldest are folded. */
export const FOLD_TURNS = 12;
export const MAX_SUMMARY_CHARS = 4000;
export const MAX_TURN_CHARS = 1500;
/** ~60s of 16kHz 16-bit mono WAV, base64-encoded. */
export const MAX_AUDIO_BASE64 = 2_800_000;

/**
 * companion — an open conversation.
 * intake    — Talk is getting to know a new person (the onboarding), steering
 *             toward what she needs to suggest providers.
 */
export type ConversationMode = "companion" | "intake";

export type TurnRequest = {
  /** The user's utterance: base64 WAV, 16kHz mono 16-bit. Either this or `text`. */
  audio?: string;
  /** A typed message, for anyone who cannot or would rather not speak. */
  text?: string;
  history: HistoryTurn[];
  summary: string;
  mode?: ConversationMode;
  /** Intake mode: everything learned so far (see lib/matching Intake). */
  intake?: unknown;
  /** Seconds since the conversation began, for the 8-minute intake budget. */
  elapsedSec?: number;
  /** How fast this person speaks, in words per minute. */
  paceWpm?: number;
};

export const MAX_TEXT_CHARS = 2000;

/**
 * One answer to a question with a fixed set of answers, written in the
 * person's own language. Shown as a button and spoken aloud, so someone who
 * cannot read well — or cannot hear the question — can still answer.
 */
export type Choice = { id: string; label: string };

/** The four languages, offered before anything else is asked. */
export const LANGUAGE_CHOICES: Choice[] = [
  { id: "english", label: "English" },
  { id: "wolof", label: "Wolof" },
  { id: "mandinka", label: "Mandinka" },
  { id: "pulaar", label: "Pulaar (Fula)" },
];

/**
 * Talk matches the person's speaking pace. Measured from their own speech;
 * these bounds stop a very slow or very fast speaker dragging her with them.
 */
export const PACE_DEFAULT_WPM = 150;
export const PACE_MIN_WPM = 80;
export const PACE_MAX_WPM = 200;

/** The whole intake has to reach providers inside this. */
export const INTAKE_BUDGET_SEC = 8 * 60;

export type GreetRequest = {
  mode: ConversationMode;
  intake?: unknown;
  /** From the account, so Talk can greet by name when she knows it. */
  displayName?: string | null;
};

/** What the model heard and what it will say. */
export type TurnResult = {
  transcript: string;
  language: HeardLanguage;
  english: string;
  risk: Risk;
  reply: string;
  replyEnglish: string;
  /** True when the model refused and a scripted reply was substituted. */
  blocked?: boolean;
  /**
   * True when the reply was risky but left out the emergency numbers, and the
   * server appended them. Worth tracking: it means the prompt is losing.
   */
  helpAppended?: boolean;
  /** Talk speaking first — nothing was heard. */
  greeting?: boolean;
  /** Intake mode: everything known after this turn (merged, validated). */
  intake?: Intake;
  /** Intake mode: everything needed has been learned; the page moves on. */
  intakeComplete?: boolean;
  /** Answers to the question just asked, as buttons. */
  choices?: Choice[];
  /** True while Talk is waiting for the language to be chosen. */
  awaitingLanguage?: boolean;
  /** Playback rate for her voice, so she speaks at the person's pace. */
  speechRate?: number;
};

/**
 * The turn endpoint streams newline-delimited JSON:
 *   one `turn` event, then zero or more `audio` events, then `done` or `error`.
 */
export type TurnEvent =
  | ({ type: "turn" } & TurnResult)
  | {
      type: "audio";
      /** Base64 signed 16-bit little-endian mono PCM. */
      pcm: string;
      sampleRate: number;
    }
  | { type: "done" }
  | { type: "error"; message: string; stage: "turn" | "voice" };

export type SummarizeRequest = { summary: string; turns: HistoryTurn[] };
export type SummarizeResponse = { summary: string };
