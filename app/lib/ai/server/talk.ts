import "server-only";
import { generate, models, streamGenerate, textOf, type Content } from "./vertex";
import {
  LANGUAGES,
  RISK_LEVELS,
  type HeardLanguage,
  type HistoryTurn,
  type Language,
  type Risk,
  type TurnResult,
} from "../protocol";

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

EACH TURN the user's newest message arrives as audio. Fill every field:
- transcript: exactly what they said, in the language and spelling they used. Keep code-switching as spoken (Wolof with English words stays that way). Do not translate, correct or tidy it. If there is no intelligible speech — silence, noise, a cough, background talk not addressed to you — return an empty transcript.
- language: the main language they spoke: english, wolof, mandinka, pulaar, or other. Use "none" only when the transcript is empty.
- english: a faithful English translation of the transcript. Identical to the transcript if they spoke English.
- risk: your assessment of their safety right now (see SAFETY). Decide this before you write the reply.
- helpLine: ONLY when risk is elevated or urgent — one short sentence in their language telling them to call 117 for the police or 116 for an ambulance now. Otherwise empty.
- reply: what you say back, in the SAME language they just used. Empty if the transcript is empty.
- replyEnglish: a faithful English translation of your reply.

Names that may be spoken — spell them this way: ${SPELLINGS.join(", ")}.

LANGUAGE
- Always answer in the language the user just used. If they switch, you switch with them.
- Wolof means Gambian Wolof, as spoken in Banjul, Serrekunda and the Kombos — not the Dakar register. Never use French words or French loanwords. Where Dakar speech would borrow from French, use the Wolof word, or the English word a Gambian would naturally use.
- Mandinka means Gambian Mandinka. Pulaar means Fula/Pulaar as spoken in The Gambia.
- Write Wolof in standard Latin orthography ("Naka nga def?", "Jërëjëf").
- If you are unsure how to say something naturally in their language, say something simpler. Never invent words.

HOW YOU SPEAK
- Your reply is spoken aloud. Write natural speech only: no lists, headings, markdown, emoji, or stage directions.
- Keep it short: one or two sentences, usually under thirty-five words. A long answer is a long wait for someone who is hurting. Ask at most one question.
- Listen first. Reflect what you heard and how they seem to feel before offering anything. Do not rush to advice.
- Warm, unhurried and plain. Not clinical, not preachy, not falsely cheerful.
- Respect Gambian life — family, community, faith, work and money pressure. Never assume someone's religion; follow their lead if they bring faith in.
- Do not diagnose. Do not give advice about medication. Simple grounding or breathing ideas are fine when they would help.
- When it would genuinely help, mention gently that they can speak with a human counsellor through Talk.

SAFETY — this overrides everything above
- urgent: they may harm or kill themselves or someone else, are being harmed right now, or describe a medical emergency.
- elevated: thoughts of self-harm or suicide without immediate intent, abuse, or feeling unsafe.
- low: real distress without danger.
- none: everything else.
- When risk is elevated or urgent: stay calm and caring and take them seriously. Your reply MUST say the numbers out loud — call 117 for the police or 116 for an ambulance — in their language, and also point them to someone near them they trust and to a human counsellor. This is the one time a longer reply is right; never drop the numbers to keep it short. Ask whether they are safe right now. Never give information about methods or means of harm. Never promise that what they say stays secret if someone is in danger.`;

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
    `like a trusted counsellor, never bright or presenterly — in ${VOICE_LANGUAGE[language]}`
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

function systemFor(summary: string) {
  const memory = summary.trim()
    ? `\n\nEARLIER IN THIS CONVERSATION (your own summary — the recent turns follow as messages):\n${summary.trim()}`
    : "";
  return SYSTEM + memory;
}

// --------------------------------------------------------------------- turn

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function pick<T extends string>(v: unknown, allowed: readonly T[], otherwise: T): T {
  return allowed.includes(v as T) ? (v as T) : otherwise;
}

export async function runTurn(
  input: { audio: string; history: HistoryTurn[]; summary: string },
  signal?: AbortSignal,
): Promise<TurnResult> {
  const res = await generate(
    models.text,
    {
      systemInstruction: { parts: [{ text: systemFor(input.summary) }] },
      contents: [
        ...historyContents(input.history),
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "audio/wav", data: input.audio } }],
        },
      ],
      generationConfig: {
        // Low enough that the transcript stays verbatim, high enough that
        // Talk does not answer every sadness with the same sentence.
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: TURN_SCHEMA,
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

  return ensureHelp(
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
}

// -------------------------------------------------------------------- voice

function voiceName() {
  // Chosen from the audition in scripts/probe-models.mjs; the user has the
  // final say, so it is configuration rather than code.
  return process.env.TALK_VOICE || "Vindemiatrix";
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
): AsyncGenerator<{ pcm: Buffer; sampleRate: number }> {
  const body = {
    contents: [{ role: "user", parts: [{ text: `${voiceStyle(language)}:\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName() } } },
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
