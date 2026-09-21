/**
 * The wire contract between the voice surface and /api/companion/*.
 *
 * Shared by the browser and the server so the two cannot drift. Nothing in
 * here may import server code — this file ships to the client.
 */

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

export type TurnRequest = {
  /** The user's utterance: base64 WAV, 16kHz mono 16-bit. */
  audio: string;
  history: HistoryTurn[];
  summary: string;
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
