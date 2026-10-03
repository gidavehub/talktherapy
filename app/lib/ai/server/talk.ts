import "server-only";
import { generate, models, streamGenerate, textOf, type Content } from "./vertex";
import {
  INTAKE_BUDGET_SEC,
  LANGUAGES,
  LANGUAGE_CHOICES,
  PACE_DEFAULT_WPM,
  PACE_MAX_WPM,
  PACE_MIN_WPM,
  RISK_LEVELS,
  type Choice,
  type ConversationMode,
  type HeardLanguage,
  type HistoryTurn,
  type Language,
  type Risk,
  type TurnResult,
} from "../protocol";
import {
  GENDER_PREFS,
  SERVICES,
  SERVICE_BLURBS,
  SPECIALIZATIONS,
  cleanIntake,
  mergeIntake,
  missingFields,
  type Intake,
  type RequiredField,
} from "../../matching";

/**
 * Talk's conversation pipeline — one voice turn.
 *
 *   audio ──► gemini-3.8-flash ──► { transcript, language, english,
 *                                    risk, reply, replyEnglish }
 *                     │
 *                     └─► reply ──► gemini-3.1-flash-tts-preview (streamed PCM)
 *
 * Hearing, translating and replying happen in ONE model call rather than a
 * transcription call followed by a reply call. Measured on this project
 * (scripts/probe-pipeline.mjs), each 3.8 call costs ~3.5–5s before the first
 * token, so a two-call pipeline put ten seconds between the user finishing and
 * Talk starting to speak. The model also hears the voice itself rather than a
 * transcript of it — tone, hesitation, crying — which a text-only reply loses.
 */

// ------------------------------------------------------------------ prompts

/**
 * Proper nouns the model should expect. Also the fix for a measured failure:
 * audio with unfamiliar names is intermittently refused with blockReason
 * SAFETY before generation starts, and spelling hints clear it. Without the
 * hint, "Talk" itself transcribes as "Tok".
 */
const SPELLINGS = [
  "Talk",
  "Talk Therapy",
  "Banjul",
  "Serrekunda",
  "Brikama",
  "Bakau",
  "Kanifing",
  "Kombo",
  "Lamin",
  "Farafenni",
  "Soma",
  "Basse",
  "Janjanbureh",
  "Gambia",
];

const SYSTEM = `You are Talk, the voice companion inside Talk Therapy, a mental-wellbeing service for people in The Gambia. You speak aloud with a warm, calm, female Gambian voice. You are an AI companion — not a therapist, doctor or human. If asked, say so plainly.

EACH TURN the user's newest message arrives as audio — or, now and then, as typed text, in which case the transcript is exactly what they typed. Fill every field:
- transcript: exactly what they said, in the language and spelling they used. Keep code-switching as spoken (Wolof with English words stays that way). Do not translate, correct or tidy it. If there is no intelligible speech — silence, noise, a cough, background talk not addressed to you — return an empty transcript.
- language: the main language they spoke: english, wolof, mandinka, pulaar, or other. Use "none" only when the transcript is empty.
- english: a faithful English translation of the transcript. Identical to the transcript if they spoke English.
- risk: your assessment of their safety right now (see SAFETY). Decide this before you write the reply.
- helpLine: ONLY when risk is elevated or urgent — one short sentence in their language telling them to call 117 for the police or 116 for an ambulance now. Otherwise empty.
- reply: what you say back, in the SAME language they just used. Empty if the transcript is empty.
- replyEnglish: a faithful English translation of your reply.

Names that may be spoken — spell them this way: ${SPELLINGS.join(", ")}.

LANGUAGE
Four languages, equal footing. Each is a real language with its own spelling — never answer one of them in another.
- English: plain English as spoken in The Gambia.
- Wolof: Gambian Wolof, as spoken in Banjul, Serrekunda and the Kombos — never the Dakar register, and never French words or French loanwords; where Dakar speech borrows from French, use the Wolof word or the English word a Gambian would use. Standard Latin orthography, e.g. "Salaam aleekum, maa ngi tudd Talk. Naka nga def? Yéwénal sa xel, amul gaaw."
- Mandinka: Gambian Mandinka, written in standard Latin orthography with ŋ and ñ, e.g. "I be ñaadi? Ŋa a fo i ye, n too mu Talk le ti. Kana korto, waati be jee."
- Pulaar (Fula): Pulaar as spoken in The Gambia, written with its hooked letters ɗ ɓ ƴ ŋ, e.g. "Jam waali. Ko mi Talk. No mbaɗ-ɗaa? Hoolo, alaa heñaare ɗoo."
- If you are unsure how to say something naturally in their language, say something simpler. Never invent words, and never substitute another language because it is easier.

HOW YOU SPEAK
- Your reply is spoken aloud. Write natural speech only: no lists, headings, markdown, emoji, or stage directions.
- Keep it short: one or two sentences, usually under thirty-five words. A long answer is a long wait for someone who is hurting. Ask at most one question.
- Listen first. Reflect what you heard and how they seem to feel before offering anything. Do not rush to advice.
- Warm, unhurried and plain. Not clinical, not preachy, not falsely cheerful.
- Respect Gambian life — family, community, faith, work and money pressure. Never assume someone's religion; follow their lead if they bring faith in.
- Do not diagnose. Do not give advice about medication. Simple grounding or breathing ideas are fine when they would help.
- When it would genuinely help, mention gently that they can speak with a human provider through Talk.

SAFETY — this overrides everything above
- urgent: they may harm or kill themselves or someone else, are being harmed right now, or describe a medical emergency.
- elevated: thoughts of self-harm or suicide without immediate intent, abuse, or feeling unsafe.
- low: real distress without danger.
- none: everything else.
- When risk is elevated or urgent: stay calm and caring and take them seriously. Your reply MUST say the numbers out loud — call 117 for the police or 116 for an ambulance — in their language, and also point them to someone near them they trust and to a human provider. This is the one time a longer reply is right; never drop the numbers to keep it short. Ask whether they are safe right now. Never give information about methods or means of harm. Never promise that what they say stays secret if someone is in danger.`;

/**
 * Style line for the TTS model. The "audio profile" is just this sentence
 * prepended to the text; naming the language steers pronunciation, which
 * matters for Wolof, Mandinka and Pulaar.
 */
const VOICE_LANGUAGE: Record<Language, string> = {
  english: "English, with a gentle Gambian accent",
  wolof: "Gambian Wolof",
  mandinka: "Gambian Mandinka",
  pulaar: "Gambian Pulaar",
  other: "the language of the text",
};

function voiceStyle(language: Language) {
  return (
    "Speak as a warm, calm Gambian woman in her thirties — gentle, unhurried and steady, " +
    `like a trusted provider, never bright or presenterly — in ${VOICE_LANGUAGE[language]}`
  );
}

const TURN_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    language: { type: "STRING", enum: [...LANGUAGES, "none"] },
    english: { type: "STRING" },
    risk: { type: "STRING", enum: [...RISK_LEVELS] },
    helpLine: { type: "STRING" },
    reply: { type: "STRING" },
    replyEnglish: { type: "STRING" },
  },
  required: ["transcript", "language", "english", "risk", "helpLine", "reply", "replyEnglish"],
  // Risk before reply, so the reply is written in light of it.
  propertyOrdering: ["transcript", "language", "english", "risk", "helpLine", "reply", "replyEnglish"],
};

/**
 * Last line of defence for the one thing Talk must never leave out.
 *
 * Measured: a suicidal disclosure was correctly rated "elevated", yet the
 * reply — obeying "keep it short" — never said the emergency numbers. The
 * prompt now insists, and this guarantees it: if a risky reply still lacks
 * them, the model's own help line (in the user's language) is appended, and
 * failing that, an English one. A mixed-language sentence is a far smaller
 * harm than a person in danger never hearing where to call.
 */
const HELP_EN = "If you might act on these thoughts, please call 117 for the police or 116 for an ambulance right now.";

function ensureHelp(result: TurnResult, helpLine: string): TurnResult {
  if (result.risk !== "elevated" && result.risk !== "urgent") return result;
  if (!result.reply || /\b11[67]\b/.test(result.reply)) return result;
  const line = /\b11[67]\b/.test(helpLine) ? helpLine : HELP_EN;
  return {
    ...result,
    reply: `${result.reply} ${line}`,
    replyEnglish: `${result.replyEnglish} ${HELP_EN}`,
    helpAppended: true,
  };
}

/**
 * Thresholds loosened from the defaults. A mental-health companion has to be
 * able to hear and answer disclosures of self-harm and abuse; a default filter
 * that blocks the conversation at exactly that moment is the worst failure
 * this product can have. The system prompt's SAFETY rules do the real work.
 */
const SAFETY_SETTINGS = [
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" }));

/** Said when the model refuses. Always carries the emergency numbers. */
const BLOCKED_REPLY =
  "I'm sorry, I couldn't take that in. Could you say it again, maybe in a different way? " +
  "And if you are in danger right now, please call 117 for the police or 116 for an ambulance.";

// ------------------------------------------------------------------ history

function historyContents(history: HistoryTurn[]): Content[] {
  const out: Content[] = [];
  for (const turn of history) {
    const role = turn.role === "talk" ? "model" : "user";
    const text =
      turn.role === "user" && turn.english && turn.language && turn.language !== "english"
        ? `${turn.text}\n(English: ${turn.english})`
        : turn.text;
    // Vertex rejects two consecutive turns with the same role; merge them.
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  // The conversation must not open with the model speaking.
  while (out[0]?.role === "model") out.shift();
  return out;
}

function systemFor(summary: string, mode: ConversationMode, intake: Intake, remainingSec?: number) {
  const memory = summary.trim()
    ? `\n\nEARLIER IN THIS CONVERSATION (your own summary — the recent turns follow as messages):\n${summary.trim()}`
    : "";
  return SYSTEM + (mode === "intake" ? intakeSection(intake, remainingSec) : "") + memory;
}

// ------------------------------------------------------------------- intake

/**
 * The onboarding, as an agent loop.
 *
 * The page sends everything learned so far; this works out what is still
 * missing and tells the model to ask for exactly the next thing — one
 * question, in the person's language, in a conversation rather than a form.
 * The model returns what THIS message told it as structured fields; the
 * server merges and validates them, and decides completion itself from the
 * merged result rather than trusting the model's say-so.
 */
const SERVICE_CHOICES = SERVICES.map((s) => `${s} (${SERVICE_BLURBS[s]})`).join(", ");

const FIELD_GUIDE: Record<RequiredField, string> = {
  concerns: "what has been weighing on them, and what brings them to Talk",
  servicesWanted: `what kind of help they are looking for — ${SERVICE_CHOICES}. Describe the kinds in their own words; never read out the labels as a list.`,
  providerGender: "whether they would prefer to talk to a woman or a man, or it does not matter",
};

function describeKnown(intake: Intake): string {
  const known: string[] = [];
  if (intake.preferredName) known.push(`name: ${intake.preferredName}`);
  if (intake.concerns.length) {
    known.push(`concerns: ${intake.concerns.join(", ")}${intake.concernSummary ? ` (${intake.concernSummary})` : ""}`);
  }
  if (intake.servicesWanted.length) known.push(`services wanted: ${intake.servicesWanted.join(", ")}`);
  if (intake.providerGender) known.push(`provider gender: ${intake.providerGender}`);
  return known.length ? known.join("; ") : "nothing yet";
}

function intakeSection(intake: Intake, remainingSec = INTAKE_BUDGET_SEC): string {
  const missing = missingFields(intake);
  // The whole intake has to produce providers inside eight minutes. Telling
  // her the time left is what keeps a warm conversation from becoming a long
  // one; the server stops asking entirely when it runs out.
  const minutes = Math.max(0, Math.round(remainingSec / 60));
  const clock =
    remainingSec <= 0
      ? "\nTIME IS UP. Ask nothing more: thank them, and say you will show them some providers now."
      : remainingSec <= 120
        ? `\nABOUT ${minutes} MINUTE(S) LEFT. Keep it brief and move to the next thing still to learn; do not open new topics.`
        : "";
  const todo = missing.length
    ? missing.map((f, i) => `${i + 1}. ${FIELD_GUIDE[f]}`).join("\n")
    : "(nothing — close the conversation now)";
  // The language is chosen by the person at the start, not guessed from the
  // first thing they say. A wrong guess used to stick for the whole
  // conversation and survive reloads, with no way for them to correct it.
  const language = intake.language
    ? intake.language === "other"
      ? "the language they are speaking. Keep using that same language."
      : `${intake.language}. EVERY word you say back is in ${intake.language}, even when they mix in English words.`
    : "not chosen yet. They may use English, Wolof, Mandinka or Pulaar.";

  return `

RIGHT NOW: GETTING TO KNOW THEM
This person has just joined. Before they meet a provider you are getting to know them — gently, and quickly — so Talk can suggest the right people. This is a conversation, not a form: ask ONE thing at a time in plain, warm words, and acknowledge what they share before moving on. Never list the questions, number them, or mention a form.

Their language: ${language}
If they ask to change language, or clearly speak a different one of the four, offer the change in one short sentence and set intake.language to the new one when they agree. Never switch on your own, and never answer in a language they did not choose.

${clock}
Already known: ${describeKnown(intake)}
Still to learn, in this order — ask only about the FIRST one:
${todo}

Fill "intake" with what THIS message tells you, null (or an empty list) for anything it does not:
- preferredName: what they want to be called.
- language: english, wolof, mandinka, pulaar or other — the language they want to be supported in.
- concerns: any of ${SPECIALIZATIONS.join(", ")} ("depression" covers low mood; "youth" means they are young or a student). concernSummary: one short English sentence in their own terms.
- servicesWanted: any of ${SERVICES.join(", ")}. Work out which fit from what they describe — most people will not know the words. More than one is fine.
- providerGender: woman, man, or any.

- Whenever your question has a fixed set of answers, fill "choices" with those options written in their language, so they can be shown as buttons for someone who cannot read well or cannot hear you. Use these ids exactly: for the kind of help, ${SERVICES.join(", ")}; for the provider's gender, woman, man, any. Leave choices empty for open questions.
- If they would rather not answer something, accept it kindly: record "any" for the provider's gender, and your best guess of the service from what they have said.
- If they want to skip the questions and simply be matched, fill what you can and finish.
- Sessions happen by video call — if they ask how they will meet, say so; do not ask them to choose.
- When this message answers the last thing still to learn: set intakeComplete true, ask nothing more, thank them (by name if you know it), and tell them you will now show them some providers who could be a good fit. Otherwise intakeComplete is false.
- Safety comes first: if they share something heavy or unsafe, respond to that with care before any question, and follow the SAFETY rules.`;
}

const INTAKE_SCHEMA = {
  ...TURN_SCHEMA,
  properties: {
    ...TURN_SCHEMA.properties,
    intake: {
      type: "OBJECT",
      properties: {
        preferredName: { type: "STRING", nullable: true },
        language: { type: "STRING", enum: [...LANGUAGES], nullable: true },
        concerns: { type: "ARRAY", items: { type: "STRING", enum: [...SPECIALIZATIONS] } },
        concernSummary: { type: "STRING", nullable: true },
        servicesWanted: { type: "ARRAY", items: { type: "STRING", enum: [...SERVICES] } },
        providerGender: { type: "STRING", enum: [...GENDER_PREFS], nullable: true },
      },
      required: ["preferredName", "language", "concerns", "concernSummary", "servicesWanted", "providerGender"],
    },
    intakeComplete: { type: "BOOLEAN" },
    choices: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, label: { type: "STRING" } },
        required: ["id", "label"],
      },
    },
  },
  required: [...TURN_SCHEMA.required, "intake", "intakeComplete", "choices"],
  // What was learned, and whether that finishes it, before the reply is written.
  propertyOrdering: [
    "transcript",
    "language",
    "english",
    "risk",
    "intake",
    "intakeComplete",
    "choices",
    "helpLine",
    "reply",
    "replyEnglish",
  ],
};

// --------------------------------------------------------------------- turn

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function pick<T extends string>(v: unknown, allowed: readonly T[], otherwise: T): T {
  return allowed.includes(v as T) ? (v as T) : otherwise;
}

export type TurnInput = {
  /** Base64 WAV. Either this or `text`. */
  audio?: string;
  text?: string;
  history: HistoryTurn[];
  summary: string;
  mode: ConversationMode;
  /** Intake mode: what is already known. */
  intake: Intake;
  /** Seconds since the conversation began. */
  elapsedSec?: number;
  /** The person's own speaking pace, words per minute. */
  paceWpm?: number;
};

/**
 * How fast Talk speaks back.
 *
 * Measured from the person: a slow speaker gets a slow reply. Two levers,
 * because neither alone is enough — a style word the TTS model can act on,
 * and a playback trim small enough that the pitch shift is inaudible.
 */
export function paceStyle(wpm: number | undefined): string {
  if (!wpm) return "at a natural, unhurried pace";
  if (wpm < 115) return "slowly and gently, leaving space between sentences";
  if (wpm > 170) return "at an easy but brisker pace";
  return "at a natural, unhurried pace";
}

export function speechRate(wpm: number | undefined): number {
  if (!wpm) return 1;
  const bounded = Math.min(PACE_MAX_WPM, Math.max(PACE_MIN_WPM, wpm));
  // Never more than ~12% either way: beyond that the voice sounds wrong.
  return Math.min(1.12, Math.max(0.9, bounded / PACE_DEFAULT_WPM));
}

/** Only the options for the question actually being asked survive. */
function cleanChoices(raw: unknown, intake: Intake): Choice[] {
  if (!Array.isArray(raw)) return [];
  const next = missingFields(intake)[0];
  const allowed: readonly string[] =
    next === "servicesWanted" ? SERVICES : next === "providerGender" ? GENDER_PREFS : [];
  if (!allowed.length) return [];
  const out: Choice[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { id, label } = c as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string") continue;
    if (!allowed.includes(id) || !label.trim()) continue;
    if (out.some((o) => o.id === id)) continue;
    out.push({ id, label: label.trim().slice(0, 60) });
  }
  return out.slice(0, 6);
}

export async function runTurn(input: TurnInput, signal?: AbortSignal): Promise<TurnResult> {
  const intakeMode = input.mode === "intake";
  const message = input.audio
    ? { inlineData: { mimeType: "audio/wav", data: input.audio } }
    : { text: input.text ?? "" };

  const res = await generate(
    models.text,
    {
      systemInstruction: {
        parts: [
          {
            text: systemFor(
              input.summary,
              input.mode,
              input.intake,
              input.elapsedSec == null ? undefined : INTAKE_BUDGET_SEC - input.elapsedSec,
            ),
          },
        ],
      },
      contents: [...historyContents(input.history), { role: "user", parts: [message] }],
      generationConfig: {
        // Low enough that the transcript stays verbatim, high enough that
        // Talk does not answer every sadness with the same sentence.
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: intakeMode ? INTAKE_SCHEMA : TURN_SCHEMA,
        // "low" measured ~5.6s against ~15s for the default; "minimal" is
        // rejected by this model and a zero budget is ignored.
        thinkingConfig: { thinkingLevel: "low" },
      },
      safetySettings: SAFETY_SETTINGS,
    },
    signal,
  );

  const finish = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
    return {
      transcript: "",
      language: "english",
      english: "",
      risk: "low",
      reply: BLOCKED_REPLY,
      replyEnglish: BLOCKED_REPLY,
      blocked: true,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textOf(res));
  } catch {
    throw new Error(`Model returned unparseable output (finishReason ${finish ?? "unknown"})`);
  }

  const transcript = str(parsed.transcript);
  const language = transcript
    ? pick<HeardLanguage>(parsed.language, LANGUAGES, "other")
    : "none";
  const reply = transcript ? str(parsed.reply) : "";

  const result = ensureHelp(
    {
      transcript,
      language,
      english: str(parsed.english) || transcript,
      risk: pick<Risk>(parsed.risk, RISK_LEVELS, "none"),
      reply,
      replyEnglish: str(parsed.replyEnglish) || reply,
    },
    str(parsed.helpLine),
  );
  if (!intakeMode || !transcript) return result;

  // Merge what this message told Talk into what was already known. The
  // conversation language counts as a preference once it is not English,
  // even if they never said so in words.
  const learned = cleanIntake(parsed.intake, LANGUAGES);
  if (!learned.language && language !== "none" && language !== "english" && !input.intake.language) {
    learned.language = language;
  }
  const intake = mergeIntake(input.intake, learned);
  // Completion is decided from the merged facts, not the model's flag: a
  // model that says "done" with a gap would strand someone unmatched, and one
  // that forgets to say "done" would keep asking after it has everything.
  // Out of time counts as finished: better a shortlist built on what she has
  // than a conversation that never reaches anyone.
  const outOfTime = (input.elapsedSec ?? 0) >= INTAKE_BUDGET_SEC;
  const intakeComplete = missingFields(intake).length === 0 || outOfTime;
  if (intakeComplete && !intake.completedAt) intake.completedAt = Date.now();
  return {
    ...result,
    intake,
    intakeComplete,
    choices: intakeComplete ? [] : cleanChoices(parsed.choices, intake),
    speechRate: speechRate(input.paceWpm),
  };
}

// ----------------------------------------------------------------- greeting

/**
 * Talk speaks first.
 *
 * A brand-new person hears a fixed opening — no model call, so she starts
 * speaking within a second of the page opening. Someone returning mid-way
 * gets a model-written line in their own language that picks up with the
 * next thing still to learn.
 */
function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first && first.length <= 30 ? first : null;
}

// Short on purpose: the first draft ran 23 seconds, which is a speech, not a
// welcome. Who she is, what happens next, that any language works — then the
// first question.
// Spoken before anything else, with the four names as buttons beside it. The
// language names are proper nouns, so they are recognisable to someone who
// does not speak the sentence around them.
const LANGUAGE_PROMPT =
  "Salaam aleekum, and welcome to Talk. Which language would you like to speak — English, Wolof, Mandinka, or Pulaar?";

/** One short line, written by the model in a given language. */
async function sayInLanguage(
  language: Language,
  instruction: string,
  signal?: AbortSignal,
): Promise<{ reply: string; replyEnglish: string }> {
  const res = await generate(
    models.text,
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `[Write this in ${language}, and only this: ${instruction}]` }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: GREETING_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" },
      },
      safetySettings: SAFETY_SETTINGS,
    },
    signal,
  );
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(textOf(res));
  } catch {}
  const reply = str(parsed.reply);
  return { reply, replyEnglish: str(parsed.replyEnglish) || reply };
}

const GREETING_SCHEMA = {
  type: "OBJECT",
  properties: { reply: { type: "STRING" }, replyEnglish: { type: "STRING" } },
  required: ["reply", "replyEnglish"],
};

export async function runGreeting(
  input: { mode: ConversationMode; intake: Intake; displayName: string | null },
  signal?: AbortSignal,
): Promise<TurnResult> {
  const { intake } = input;
  const name = intake.preferredName ?? firstName(input.displayName);
  const language: Language = intake.language ?? "english";
  const started = intake.preferredName || intake.concerns.length || intake.servicesWanted.length;

  // Nothing is asked before the language is settled. Guessing it from the
  // first utterance is what sent Fula and Mandinka speakers into a Wolof
  // conversation they could not get out of.
  if (input.mode === "intake" && !intake.language) {
    return {
      transcript: "",
      language: "english",
      english: "",
      risk: "none",
      reply: LANGUAGE_PROMPT,
      replyEnglish: LANGUAGE_PROMPT,
      greeting: true,
      awaitingLanguage: true,
      choices: LANGUAGE_CHOICES,
      intake,
    };
  }

  if (input.mode === "intake" && !started) {
    // The language is settled, so the opening is spoken in it — the first
    // thing they hear is their own language, not English.
    const opening = await sayInLanguage(
      language,
      `Greet them warmly, say you are Talk, an AI companion who will help find them the right provider, and ask ${
        name ? `whether you may call them ${name}` : "what they would like to be called"
      }. Two short sentences at most.`,
      signal,
    );
    return { transcript: "", language, english: "", risk: "none", ...opening, greeting: true, intake };
  }

  const ask =
    input.mode === "intake"
      ? `They are coming back to finish getting started. In ${language}, welcome them back${name ? ` by name (${name})` : ""} in one short sentence, then ask about: ${FIELD_GUIDE[missingFields(intake)[0] ?? "concerns"]}.`
      : `They have opened a conversation with you. In ${language}, greet them warmly${name ? ` by name (${name})` : ""} and ask, in one short sentence, what is on their mind today.`;

  const res = await generate(
    models.text,
    {
      systemInstruction: { parts: [{ text: SYSTEM + (input.mode === "intake" ? intakeSection(intake) : "") }] },
      contents: [{ role: "user", parts: [{ text: `[${ask} Reply only with what you will say.]` }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: GREETING_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" },
      },
      safetySettings: SAFETY_SETTINGS,
    },
    signal,
  );
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(textOf(res));
  } catch {}
  const reply = str(parsed.reply) || (name ? `Welcome back, ${name}.` : "Welcome back.");
  return {
    transcript: "",
    language,
    english: "",
    risk: "none",
    reply,
    replyEnglish: str(parsed.replyEnglish) || reply,
    greeting: true,
    intake,
  };
}

// -------------------------------------------------------------------- voice

const VOICE_ENV: Record<Language, string> = {
  english: "TALK_VOICE_EN",
  wolof: "TALK_VOICE_WO",
  mandinka: "TALK_VOICE_MNK",
  pulaar: "TALK_VOICE_FF",
  other: "TALK_VOICE",
};

function voiceName(language: Language) {
  // One voice served all four languages at first. A per-language override
  // exists because the same prebuilt voice does not pronounce Pulaar and
  // English equally well; unset, they all fall back to the audition winner
  // from scripts/probe-models.mjs.
  return process.env[VOICE_ENV[language]] || process.env.TALK_VOICE || "Vindemiatrix";
}

/**
 * Talk's voice, streamed. Yields raw 16-bit little-endian mono PCM as the
 * model produces it — the first chunk lands ~0.6s after the call, against
 * ~7s to wait for a ten-second reply in one piece.
 */
export async function* speak(
  text: string,
  language: Language,
  signal?: AbortSignal,
  paceWpm?: number,
): AsyncGenerator<{ pcm: Buffer; sampleRate: number }> {
  const body = {
    contents: [{ role: "user", parts: [{ text: `${voiceStyle(language)}, ${paceStyle(paceWpm)}:\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName(language) } } },
    },
  };

  // The TTS model intermittently finishes with no audio at all (seen while
  // testing Wolof; the identical request succeeds on repeat). Nothing has
  // reached the listener at that point, so asking the same model again is
  // seamless — and it is a retry, not a fallback.
  let lastFinish: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    let produced = false;
    for await (const chunk of streamGenerate(models.tts, body, signal)) {
      if (chunk.promptFeedback?.blockReason) {
        throw new Error(`voice refused: ${chunk.promptFeedback.blockReason}`);
      }
      const candidate = chunk.candidates?.[0];
      lastFinish = candidate?.finishReason ?? lastFinish;
      for (const part of candidate?.content?.parts ?? []) {
        if (!part.inlineData?.data) continue;
        const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
        produced = true;
        yield { pcm: Buffer.from(part.inlineData.data, "base64"), sampleRate: rate };
      }
    }
    if (produced) return;
  }
  throw new Error(`voice produced no audio (finishReason ${lastFinish ?? "none"})`);
}

// ---------------------------------------------------------------- summarise

const SUMMARY_SYSTEM = `You maintain the running memory of a supportive voice conversation between a person in The Gambia and Talk, an AI companion. Merge the new turns into the existing summary.

Keep: their name if given; what they are going through and how it is affecting them; people, places and events that matter to them; anything said about safety or risk (never drop this); what has helped or not helped; anything Talk offered or they agreed to; the language they prefer.
Write in English, in plain third-person prose, at most 180 words. Facts only — no advice, no commentary.`;

export async function summarize(summary: string, turns: HistoryTurn[], signal?: AbortSignal): Promise<string> {
  const transcript = turns
    .map((t) => {
      const who = t.role === "talk" ? "Talk" : "Person";
      const english = t.english && t.language && t.language !== "english" ? ` [English: ${t.english}]` : "";
      return `${who}: ${t.text}${english}`;
    })
    .join("\n");

  const res = await generate(
    models.text,
    {
      systemInstruction: { parts: [{ text: SUMMARY_SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `EXISTING SUMMARY:\n${summary.trim() || "(none yet)"}\n\nNEW TURNS:\n${transcript}\n\nReturn only the updated summary.`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } },
      safetySettings: SAFETY_SETTINGS,
    },
    signal,
  );
  const out = textOf(res).trim();
  // A refused or empty summary must not erase the memory that existed.
  return out || summary;
}
