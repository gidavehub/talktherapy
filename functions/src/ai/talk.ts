import { generate, models, streamGenerate, textOf, type Content } from "./vertex";
import { fold, mentions } from "../../../app/lib/ai/choiceMatch";
import {
  INTAKE_BUDGET_SEC,
  LANGUAGES,
  LANGUAGE_ALIASES,
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
} from "../../../app/lib/ai/protocol";
import {
  AGE_RANGES,
  AREAS,
  GENDER_PREFS,
  SERVICES,
  USER_GENDERS,
  SERVICE_BLURBS,
  SPECIALIZATIONS,
  cleanIntake,
  isMinor,
  mergeIntake,
  missingFields,
  type Intake,
  type RequiredField,
} from "../../../app/lib/matching";

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

The people you connect them with are PROVIDERS — "a provider", "a human provider". Never call them counsellors or counselors: not everyone on Talk is one, and the service names what each of them offers (therapy, psychotherapy, mental health counselling, psychosocial support, social work). Say "provider" in English, and its natural equivalent in the other languages.

EACH TURN the user's newest message arrives as audio — or, now and then, as typed text, in which case the transcript is exactly what they typed. Fill every field:
- transcript: exactly what they said, in the language and spelling they used. Keep code-switching as spoken (Wolof with English words stays that way). Do not translate, correct or tidy it. If there is no intelligible speech — silence, noise, a cough, background talk not addressed to you — return an empty transcript.
- language: the main language they spoke: english, wolof, mandinka, pulaar, or other. Use "none" only when the transcript is empty.
- english: a faithful English translation of the transcript. Identical to the transcript if they spoke English.
- risk: your assessment of their safety right now (see SAFETY). Decide this before you write the reply.
- helpLine: ONLY when risk is elevated or urgent — one short sentence in their language telling them to call 117 for the police or 116 for an ambulance now. For someone under 18 it also tells them to tell an adult they trust — a parent, a teacher, a health worker — today. Otherwise empty.
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
 * Talk's audio profile: who is speaking, where, and how her accent sounds.
 *
 * A STREET Gambian accent, by direction — the way people actually talk in
 * Serrekunda, not a polished or broadcast voice. Left to itself the TTS model
 * gives English a generic West African lilt that leans Nigerian, so the notes
 * say what the accent is AND what it is not; the scene (an evening on the
 * bantaba, a friend having a hard time) carries the register better than
 * adjectives do. Naming the language and its everyday variety also steers
 * pronunciation, which matters for Wolof, Mandinka and Pulaar.
 */
const VOICE_ACCENT: Record<Language, string> = {
  english:
    "English, in a thick, natural Gambian street accent from Serrekunda — Wolof rhythm and vowels " +
    "in her English, every syllable even, flat and steady intonation, 'th' said as 't' or 'd'. " +
    "NOT Nigerian, NOT Ghanaian, NOT British or American",
  wolof:
    "everyday street Wolof of Serrekunda and Banjul, Gambian not Senegalese — relaxed and " +
    "conversational, never formal or broadcast",
  mandinka: "everyday Gambian Mandinka — relaxed and conversational, never formal or broadcast",
  pulaar: "everyday Gambian Pulaar — relaxed and conversational, never formal or broadcast",
  other: "the language of the text, with a natural Gambian street accent",
};

function voicePrompt(language: Language, paceWpm: number | undefined, text: string) {
  // "Read the following aloud" is not decoration. Without it, short or
  // fragmentary text after the profile — "Yes.", a bare time range, "Times
  // free: 09:00, 10:00" — is refused with PROHIBITED_CONTENT (12 of 15 tries,
  // against 0 of 15 with it), and those are exactly what read-aloud on the
  // booking screens sends. Spoken length is unchanged: the instruction is
  // followed, not read out.
  return `AUDIO PROFILE: A Gambian woman in her thirties, born and raised in Serrekunda.
THE SCENE: Evening, sitting on the bantaba outside her compound, talking quietly with a friend who is going through a hard time.
DIRECTOR'S NOTES
Accent: ${VOICE_ACCENT[language]}.
Style: warm, relaxed and down-to-earth, like a big sister — never polished, never presenterly, never theatrical.
Pacing: ${paceStyle(paceWpm)}.

Read the following aloud exactly as written:

${text}`;
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
/**
 * The same numbers for a child — they are still the ones for immediate
 * danger — plus the thing a child most needs told: an adult whose job it is
 * to help. Never "call the police" alone.
 */
const HELP_EN_MINOR =
  "If you are in danger, call 117 for the police or 116 for an ambulance right now, and tell an adult you trust — a parent, a teacher, a health worker — today.";

function ensureHelp(result: TurnResult, helpLine: string, minor = false): TurnResult {
  if (result.risk !== "elevated" && result.risk !== "urgent") return result;
  if (!result.reply || /\b11[67]\b/.test(result.reply)) return result;
  const fallback = minor ? HELP_EN_MINOR : HELP_EN;
  const line = /\b11[67]\b/.test(helpLine) ? helpLine : fallback;
  return {
    ...result,
    reply: `${result.reply} ${line}`,
    replyEnglish: `${result.replyEnglish} ${fallback}`,
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

function systemFor(
  summary: string,
  mode: ConversationMode,
  intake: Intake,
  remainingSec?: number,
  awaitingConsent = false,
) {
  const memory = summary.trim()
    ? `\n\nEARLIER IN THIS CONVERSATION (your own summary — the recent turns follow as messages):\n${summary.trim()}`
    : "";
  // The consent turn is its own small job: the intake waits until it is done.
  const task = awaitingConsent ? CONSENT_SECTION : mode === "intake" ? intakeSection(intake, remainingSec) : "";
  // In BOTH modes. Most returning people are in companion mode, and a child in
  // danger there needs this as much as one who is mid-intake.
  return SYSTEM + minorSafety(intake) + task + memory;
}

/**
 * Safety, for somebody under 18. SAFETY above still applies in full — 117 and
 * 116 are still the numbers for immediate danger — but a child also needs an
 * adult whose job it is to protect them, and must never be left thinking their
 * only option is to call the police alone.
 */
function minorSafety(intake: Intake): string {
  if (!isMinor(intake)) return "";
  return `

THIS PERSON IS UNDER 18
- When risk is elevated or urgent: keep 117 and 116 — they are still the numbers for immediate danger — AND name an adult whose job is to protect children: a teacher, a health worker, or the Department of Social Welfare. Encourage them to tell a parent or another adult they trust today.
- Never tell a child their only option is to call the police on their own.
- Never promise to keep a secret where a child is being harmed or is in danger. Say kindly that keeping them safe matters more.
- Be plain and gentle, and do not ask for details of abuse — that is for the people who will help them in person.`;
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
  ageRange: `roughly how old they are — one of ${AGE_RANGES.join(", ")}. Ask it lightly, the way a person would, not as a form field.`,
  location: `which part of the country they are in — ${AREAS.filter((a) => a !== "outside").join(", ")}, or outside The Gambia. A town name is enough; work out the area yourself.`,
  gender: 'whether they are a woman, a man, or would describe themselves another way — and "unsaid" is a perfectly good answer if they would rather not say.',
  concerns: "what has been weighing on them, and what brings them to Talk",
  servicesWanted: `what kind of help they are looking for — ${SERVICE_CHOICES}. Name the kinds in your own words, as speech — never as a read-out list of labels.`,
  providerGender: "whether they would prefer to talk to a woman or a man, or it does not matter",
};

function describeKnown(intake: Intake): string {
  const known: string[] = [];
  if (intake.preferredName) known.push(`name: ${intake.preferredName}`);
  if (intake.ageRange) known.push(`age: ${intake.ageRange}`);
  if (intake.location) known.push(`area: ${intake.location}`);
  if (intake.gender) known.push(`gender: ${intake.gender}`);
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
  // Told the WHOLE time, not only at the end: a conversation that learns in
  // the last two minutes that it has two minutes left has already spent six
  // on small talk.
  const total = Math.round(INTAKE_BUDGET_SEC / 60);
  const clock =
    remainingSec <= 0
      ? "\nTIME IS UP. Ask nothing more: thank them, and say you will show them some providers now."
      : remainingSec <= 120
        ? `\nABOUT ${minutes} MINUTE(S) LEFT of ${total}. Keep it brief and move to the next thing still to learn; do not open new topics.`
        : `\nTime: about ${minutes} of ${total} minutes left. Unhurried, but every question should move towards the providers; save tangents for them.`;
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
    : "not chosen yet. Set intake.language ONLY when they NAME a language or ask to speak one. They " +
      "may name it in English or in the language's own name: Fula, Fulani, Fulfulde, Peul or Haalpulaar " +
      "all mean pulaar; Mandingo or Manding mean mandinka; Wollof or Walaf mean wolof; Angale or " +
      "Anglais mean english. The single English word \"Fula\" is an answer of Pulaar, not a sign they " +
      "want English. But SPEAKING English is not CHOOSING English — somebody who just tells you their " +
      "name in English has not answered the question; leave intake.language empty and ask which " +
      "language they would like, briefly, before anything else.";

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
- ageRange, location, gender: the background above, as the exact ids listed.
- language: english, wolof, mandinka, pulaar or other — the language they want to be supported in.
- concerns: any of ${SPECIALIZATIONS.join(", ")} ("depression" covers low mood; "youth" means they are young or a student). concernSummary: one short English sentence in their own terms.
- servicesWanted: any of ${SERVICES.join(", ")}. Work out which fit from what they describe — most people will not know the words. More than one is fine.
- providerGender: woman, man, or any.

- Whenever your question has a fixed set of answers, fill "choices" with those options written in their language, so they can be shown as buttons for someone who cannot read well or cannot hear you. ALSO name the options out loud in your reply, briefly and as speech ("…, …, or …?") — many people using Talk cannot read the buttons at all, and hearing the options is how they answer. Use these ids exactly: age, ${AGE_RANGES.join(", ")}; area, ${AREAS.join(", ")}; their own gender, ${USER_GENDERS.join(", ")}; the kind of help, ${SERVICES.join(", ")}; the provider's gender, woman, man, any. Leave choices empty for open questions.
- If they would rather not answer something, accept it kindly: record "any" for the provider's gender, and your best guess of the service from what they have said.
- If they want to skip the questions and simply be matched, fill what you can and finish.
- Sessions happen by video call — if they ask how they will meet, say so; do not ask them to choose.
- When this message answers the last thing still to learn: set intakeComplete true, ask nothing more, thank them (by name if you know it), and tell them you will now show them some providers who could be a good fit. Otherwise intakeComplete is false.
- Safety comes first: if they share something heavy or unsafe, respond to that with care before any question, and follow the SAFETY rules.`;
}

/** Talk has just spoken the consent and is waiting for the answer. */
const CONSENT_SECTION = `

RIGHT NOW: CONSENT
You have just told them what you keep, that the provider they choose will see a summary of it, and that you are an AI and not a therapist — and asked whether that is alright. Their message is the answer.
- consentGranted: "yes" if they agree, in any words or language (yes, okay, fine, waaw, haa, eey, go on). "no" if they refuse. "unclear" for anything else, including a question.
- If unclear: answer their question if they asked one, then ask again, more simply, whether that is alright. Ask NOTHING else.
- If no or yes: keep the reply very short — the next thing they hear is decided for you.
- SAFETY still comes first: if what they say is about danger or harm, rate the risk and respond to that, whatever they answered.`;

const CONSENT_SCHEMA = {
  ...TURN_SCHEMA,
  properties: {
    ...TURN_SCHEMA.properties,
    consentGranted: { type: "STRING", enum: ["yes", "no", "unclear"] },
  },
  required: [...TURN_SCHEMA.required, "consentGranted"],
  // What they answered, before anything is said back.
  propertyOrdering: [
    "transcript",
    "language",
    "english",
    "risk",
    "consentGranted",
    "helpLine",
    "reply",
    "replyEnglish",
  ],
};

const INTAKE_SCHEMA = {
  ...TURN_SCHEMA,
  properties: {
    ...TURN_SCHEMA.properties,
    intake: {
      type: "OBJECT",
      properties: {
        preferredName: { type: "STRING", nullable: true },
        language: { type: "STRING", enum: [...LANGUAGES], nullable: true },
        ageRange: { type: "STRING", enum: [...AGE_RANGES], nullable: true },
        location: { type: "STRING", enum: [...AREAS], nullable: true },
        gender: { type: "STRING", enum: [...USER_GENDERS], nullable: true },
        concerns: { type: "ARRAY", items: { type: "STRING", enum: [...SPECIALIZATIONS] } },
        concernSummary: { type: "STRING", nullable: true },
        servicesWanted: { type: "ARRAY", items: { type: "STRING", enum: [...SERVICES] } },
        providerGender: { type: "STRING", enum: [...GENDER_PREFS], nullable: true },
      },
      required: [
        "preferredName",
        "language",
        "ageRange",
        "location",
        "gender",
        "concerns",
        "concernSummary",
        "servicesWanted",
        "providerGender",
      ],
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
  /** This message answers the consent question. */
  awaitingConsent?: boolean;
  /** From the account, for the opening that follows a yes. */
  displayName?: string | null;
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
    next === "servicesWanted"
      ? SERVICES
      : next === "providerGender"
        ? GENDER_PREFS
        : next === "ageRange"
          ? AGE_RANGES
          : next === "location"
            ? AREAS
            : next === "gender"
              ? USER_GENDERS
              : [];
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
  // Kept apart from everything below so a consent answer can never be merged
  // into the intake as if it were an answer about age or place.
  if (input.awaitingConsent) return consentTurn(input, signal);
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
    isMinor(input.intake),
  );
  // At their pace in every conversation, not only the intake.
  if (!intakeMode || !transcript) return { ...result, speechRate: speechRate(input.paceWpm) };

  // Merge what this message told Talk into what was already known. The
  // conversation language counts as a preference once it is not English,
  // even if they never said so in words.
  // The language is CHOSEN — named, or tapped — never guessed from how they
  // happen to be speaking. (It used to be set from the detected language when
  // that was not English; the prompt now tells the model to ask instead, and
  // doing both left Talk asking "which language?" with no buttons and no way
  // to answer it by voice.)
  const learned = cleanIntake(parsed.intake, LANGUAGES);
  // SPEAKING English is not CHOOSING English. Somebody who answers the
  // language question with "My name is Fatou" has not picked a language — but
  // the model, seeing English, sometimes records English anyway, and then pins
  // the whole conversation to it, so a Wolof speaker who could only manage
  // their name in English is answered in English from then on. While the
  // language is unset, English is only accepted when the word was SAID —
  // "I'm Fula, but I prefer English" said it; "My name is Fatou" did not.
  let englishUnsaid = false;
  if (!input.intake.language && learned.language === "english") {
    const said = mentions(transcript, LANGUAGE_CHOICES, LANGUAGE_ALIASES);
    if (!said.some((c) => c.id === "english")) {
      learned.language = null;
      englishUnsaid = true;
    }
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
  // The model's reply assumed the English it recorded, so it has moved on to a
  // question that must not be asked yet. Ask the language instead — unless
  // the reply is answering danger, which is never replaced.
  const risky = result.risk === "elevated" || result.risk === "urgent";
  const reasked =
    englishUnsaid && !intake.language && !intakeComplete && !risky
      ? { reply: LANGUAGE_REASK, replyEnglish: LANGUAGE_REASK }
      : {};
  return {
    ...result,
    ...reasked,
    intake,
    intakeComplete,
    // A finished intake asks nothing more — not even the language.
    ...(intakeComplete
      ? { choices: [] }
      : !intake.language
        ? {
            // Still unanswered: keep asking it, buttons and all.
            awaitingLanguage: true,
            choices: LANGUAGE_CHOICES,
          }
        : { choices: cleanChoices(parsed.choices, intake) }),
    speechRate: speechRate(input.paceWpm),
  };
}

/**
 * The answer to the consent question.
 *
 * A tap is read directly. Anything spoken goes to the model with a schema of
 * its own — yes, no, or unclear — and with the full safety rules, because
 * somebody can answer "no" and say they are in danger in the same breath.
 *
 * On a yes, the reply IS the opening that follows — the first question — so
 * agreeing costs one round trip, not two. On a no, the fixed refusal is spoken
 * and the question stays open: saying yes later still works.
 */
async function consentTurn(input: TurnInput, signal?: AbortSignal): Promise<TurnResult> {
  const language: Language = input.intake.language ?? "english";
  const script = CONSENT_SCRIPT[language];
  const pending = {
    awaitingConsent: true,
    choices: consentChoices(language),
    consentVersion: consentVersion(language),
    intake: input.intake,
    speechRate: speechRate(input.paceWpm),
  };

  const tapped = input.text ? tappedConsent(input.text) : null;
  let granted: "yes" | "no" | "unclear";
  let heard: TurnResult;

  if (tapped) {
    granted = tapped;
    const text = input.text ?? "";
    heard = { transcript: text, language, english: text, risk: "none", reply: "", replyEnglish: "" };
  } else {
    const message = input.audio
      ? { inlineData: { mimeType: "audio/wav", data: input.audio } }
      : { text: input.text ?? "" };
    const res = await generate(
      models.text,
      {
        systemInstruction: {
          parts: [{ text: systemFor(input.summary, input.mode, input.intake, undefined, true) }],
        },
        contents: [...historyContents(input.history), { role: "user", parts: [message] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: CONSENT_SCHEMA,
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
        ...pending,
      };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(textOf(res));
    } catch {
      throw new Error(`Model returned unparseable output (finishReason ${finish ?? "unknown"})`);
    }
    const transcript = str(parsed.transcript);
    // Silence is not an answer. Nothing to say back; the question stands.
    if (!transcript) {
      return { transcript: "", language: "none", english: "", risk: "none", reply: "", replyEnglish: "", ...pending };
    }
    granted = pick(parsed.consentGranted, ["yes", "no", "unclear"] as const, "unclear");
    const reply = str(parsed.reply);
    heard = ensureHelp(
      {
        transcript,
        language: pick<HeardLanguage>(parsed.language, LANGUAGES, "other"),
        english: str(parsed.english) || transcript,
        risk: pick<Risk>(parsed.risk, RISK_LEVELS, "none"),
        reply,
        replyEnglish: str(parsed.replyEnglish) || reply,
      },
      str(parsed.helpLine),
      isMinor(input.intake),
    );
  }

  // Danger outranks everything: the model's reply, with the numbers in it,
  // is what they hear — whatever they answered.
  const risky = heard.risk === "elevated" || heard.risk === "urgent";

  if (granted === "yes") {
    const next = risky
      ? { reply: heard.reply, replyEnglish: heard.replyEnglish }
      : await runGreeting(
          {
            mode: input.mode,
            intake: input.intake,
            displayName: input.displayName ?? null,
            consented: true,
            afterConsent: true,
          },
          signal,
        );
    return {
      ...heard,
      reply: next.reply,
      replyEnglish: next.replyEnglish,
      consentGranted: "yes",
      consentVersion: consentVersion(language),
      awaitingConsent: false,
      choices: [],
      intake: input.intake,
      speechRate: speechRate(input.paceWpm),
    };
  }

  const reply =
    risky || (granted === "unclear" && heard.reply)
      ? { reply: heard.reply, replyEnglish: heard.replyEnglish }
      : granted === "no"
        ? { reply: script.declined, replyEnglish: CONSENT_SCRIPT.english.declined }
        : { reply: script.text, replyEnglish: CONSENT_SCRIPT.english.text };
  return { ...heard, ...reply, consentGranted: granted, ...pending };
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

/**
 * Asked again when the model recorded English that was never named — its own
 * reply was then written as if English were settled, and moves on to a
 * question nobody should hear yet.
 */
const LANGUAGE_REASK = "Which language would you like to speak — English, Wolof, Mandinka, or Pulaar?";

/**
 * The consent, spoken before the first question: what Talk keeps, that the
 * provider they choose will see a summary of it, and that she is an AI and
 * not a therapist.
 *
 * FIXED TEXT, per language, never generated in the moment. It is the one
 * legally load-bearing sentence in the product: a paraphrase that differs
 * from one session to the next cannot be shown to be what somebody agreed to.
 * The ledger records which version was spoken (CONSENT_VERSION).
 *
 * The English is the source. The Wolof, Mandinka and Pulaar were drafted once
 * by the model, back-translated to check the meaning survived, and frozen
 * here — and are marked as drafts in the ledger until a Gambian translator
 * has checked them.
 */
const CONSENT_VERSION = "2026-10";
const CONSENT_DRAFT: Record<Language, boolean> = {
  english: false,
  wolof: true,
  mandinka: true,
  pulaar: true,
  other: false,
};
const CONSENT_SCRIPT: Record<Language, { text: string; yes: string; no: string; declined: string }> = {
  english: {
    text:
      "Before we begin: I keep what you tell me so I can find you the right provider, and the provider you choose will see a short summary of it. I am an AI, not a therapist. Is that alright with you?",
    yes: "Yes, that's alright",
    no: "No",
    declined:
      "That's alright. I can't go on without your yes, but if you change your mind, just say yes. If you are in danger right now, call 117 for the police or 116 for an ambulance.",
  },
  // TODO(translation): human translator, not a model. Back-translation of the
  // draft: "Before we begin: what you tell me I will save so I can find the
  // provider best for you, and the provider you choose will see a short
  // summary of what you said. I am an AI, not a therapist. Is that fine with you?"
  wolof: {
    text:
      "Bala nu koy tàmbli: li nga may wax dama koy denc ngir man laa seetal provider bi la gënël, te provider bi nga tànn dina gis summary bu gàtt ci li nga wax. Man AI laa, duma therapist. Ndax loolu baax na ci yaw?",
    yes: "Waaw, loolu baax na",
    no: "Déedéet",
    declined:
      "Amul problem. Mënuma wéy te waxuloo waaw, waaye boo soppee sa xel, waxal waaw rekk. Boo nekkee ci danger léegi, woo 117 ngir police walla 116 ngir ambulance.",
  },
  // TODO(translation): human translator, not a model. Back-translation of the
  // draft: "Before we start: I will save your words so that we can find the
  // right provider for you, and the provider you choose will see parts of it.
  // I am an AI, not a doctor. Does that sound okay to you?"
  mandinka: {
    text:
      "Kabuŋ ŋa damina: n b'i la kumoolu mara la le walasa ŋa provider ñaamato soto i ye, aniŋ i ye provider meŋ sugandi a b'a duntolu je la. Nte mu AI le ti, nte te dandanlaa ti. Wo dantaŋ be bori la i bulu?",
    yes: "Haa, wo be beteyaala le",
    no: "Hani",
    declined:
      "N te noola ka taa ñɛ fo ni i ko haa, bari ni i la mirando yelenta, a fo doron haa. Ni i be toroo kono saayin, karandi 117 ka kanta poliso la fo 116 ka kanta ambulanso la.",
  },
  // TODO(translation): human translator, not a model. Back-translation of the
  // draft: "Before we start: I save what you say to help you get a provider
  // that suits you, and the provider you choose will see a short summary of
  // what you said. I am an AI, not a mental health doctor. Is that okay with you?"
  pulaar: {
    text:
      "Ko adii nde min puɗɗotoo: miɗo moofta ko kaal-ɗaa koo ngam wallitde ma heɓde provider mo moƴƴani ma, kadi provider mo cuɓ-ɗaa oo maa yiy daartol pamarol e ko mbi-ɗaa koo. Min ko mi AI, wonaa mi cafroowo hakkille. Ɗuum ina moƴƴi e maa?",
    yes: "Eey, ɗum no moƴƴi",
    no: "Alaa",
    declined:
      "Alaa caɗeele. Mi waawaa jokkude so a jaɓaani, kono so a waylii miijo maa, wi'u tan eey. So aɗa e baasal jooni, noddu 117 ngam poliis walla 116 ngam ambulance.",
  },
  other: {
    text:
      "Before we begin: I keep what you tell me so I can find you the right provider, and the provider you choose will see a short summary of it. I am an AI, not a therapist. Is that alright with you?",
    yes: "Yes, that's alright",
    no: "No",
    declined:
      "That's alright. I can't go on without your yes, but if you change your mind, just say yes. If you are in danger right now, call 117 for the police or 116 for an ambulance.",
  },
};

function consentVersion(language: Language): string {
  return `${CONSENT_VERSION}-${language}${CONSENT_DRAFT[language] ? "-draft" : ""}`;
}

function consentChoices(language: Language): Choice[] {
  const script = CONSENT_SCRIPT[language];
  return [
    { id: "consent-yes", label: script.yes },
    { id: "consent-no", label: script.no },
  ];
}

/** Talk asks for consent: the fixed text, with Yes and No as buttons. */
function consentPrompt(language: Language, intake: Intake): TurnResult {
  return {
    transcript: "",
    language,
    english: "",
    risk: "none",
    reply: CONSENT_SCRIPT[language].text,
    replyEnglish: CONSENT_SCRIPT.english.text,
    greeting: true,
    awaitingConsent: true,
    choices: consentChoices(language),
    consentVersion: consentVersion(language),
    intake,
  };
}

/**
 * A tapped button arrives as the button's own words. Those need no model to
 * read — and must not get one, because a tap is unambiguous and a model is not.
 */
function tappedConsent(text: string): "yes" | "no" | null {
  const said = fold(text);
  for (const script of Object.values(CONSENT_SCRIPT)) {
    if (said === fold(script.yes)) return "yes";
    if (said === fold(script.no)) return "no";
  }
  if (said === "yes") return "yes";
  if (said === "no") return "no";
  return null;
}

/**
 * Talk introduces the people she found.
 *
 * Spoken, in their language, because the person this is built for may not be
 * able to read the cards beside it. Each provider gets one line — who they
 * are, where they are, and why they fit — and then she asks which one.
 */
export type PresentedProvider = {
  uid: string;
  name: string;
  services: string[];
  languages: string[];
  location: string;
  fee: string;
  reasons: string[];
};

export async function presentProviders(
  intake: Intake,
  providers: PresentedProvider[],
  signal?: AbortSignal,
): Promise<TurnResult> {
  const language: Language = intake.language ?? "english";
  const lines = providers
    .map(
      (p, i) =>
        `${i + 1}. ${p.name}${p.location ? `, ${p.location}` : ""}${
          p.services.length ? ` — ${p.services.join(", ")}` : ""
        }${p.languages.length ? `, speaks ${p.languages.join(" and ")}` : ""}${p.fee ? `, ${p.fee} a session` : ""}${
          p.reasons.length ? ` (fits because: ${p.reasons.join(", ")})` : ""
        }`,
    )
    .join("\n");

  const said = await sayInLanguage(
    language,
    `Tell ${intake.preferredName ?? "them"} you have found some people who could help, then introduce each of these in ONE short sentence each — the name exactly as written, where they are, and the single best reason they fit. Do not read out the fee or list every service; that is on the screen beside you. Finish by asking which one they would like to talk to.\n${lines}`,
    signal,
  );
  const reply = said.reply || `I found ${providers.length} people who could help. Which one would you like?`;

  return {
    transcript: "",
    language,
    english: "",
    risk: "none",
    reply,
    replyEnglish: said.replyEnglish || reply,
    greeting: true,
    intake,
    // The names as buttons, in the order she said them.
    choices: providers.map((p) => ({ id: p.uid, label: p.name })),
  };
}

/**
 * English text as it would be said in another language — for reading the
 * screen aloud. Not a literal translation: it is meant to be heard, so names,
 * numbers and prices stay as they are.
 */
export async function renderInLanguage(
  language: Language,
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const said = await sayInLanguage(
    language,
    `Say this naturally, as speech, keeping every name, number and price exactly as written: "${text}"`,
    signal,
  );
  // If the model gives nothing back, the English is still better than silence.
  return said.reply || text;
}

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
  input: {
    mode: ConversationMode;
    intake: Intake;
    displayName: string | null;
    /** `false`: say the consent before anything else. See GreetRequest.consented. */
    consented?: boolean;
    /** They have just said yes — thank them briefly instead of greeting again. */
    afterConsent?: boolean;
  },
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

  // Consent comes next — after the language, so it is heard in theirs, and
  // before the first question, so nothing is kept before they agree.
  if (input.consented === false) return consentPrompt(language, intake);

  const nameQuestion = name ? `whether you may call them ${name}` : "what they would like to be called";
  if (input.mode === "intake" && !started) {
    // The language is settled, so the opening is spoken in it — the first
    // thing they hear is their own language, not English.
    const opening = await sayInLanguage(
      language,
      input.afterConsent
        ? `They have just said yes to how Talk works; they have not told you anything else yet. Thank them in two or three words, then ask ${nameQuestion}. Two short sentences at most.`
        : `Greet them warmly, say you are Talk, an AI companion who will help find them the right provider, and ask ${nameQuestion}. Two short sentences at most.`,
      signal,
    );
    return { transcript: "", language, english: "", risk: "none", ...opening, greeting: true, intake };
  }

  const lead = input.afterConsent
    ? `They have just said yes to how Talk works. In ${language}, thank them in two or three words${name ? ` by name (${name})` : ""}`
    : null;
  const ask =
    input.mode === "intake"
      ? `${lead ?? `They are coming back to finish getting started. In ${language}, welcome them back${name ? ` by name (${name})` : ""} in one short sentence`}, then ask about: ${FIELD_GUIDE[missingFields(intake)[0] ?? "concerns"]}.`
      : `${lead ?? `They have opened a conversation with you. In ${language}, greet them warmly${name ? ` by name (${name})` : ""}`} and ask, in one short sentence, what is on their mind today.`;

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
    contents: [{ role: "user", parts: [{ text: voicePrompt(language, paceWpm, text) }] }],
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
