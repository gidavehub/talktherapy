/**
 * Measures the voice pipeline's building blocks before the app depends on them:
 *
 *   A. Does the TTS model stream (audio arriving in chunks), and how soon?
 *   B. Can ONE gemini-3.8-flash call transcribe + detect language + translate,
 *      from audio, into a JSON schema? (Saves a whole round trip per turn.)
 *   C. How long does a reply take, and does thinking change that?
 *
 *   node scripts/probe-pipeline.mjs
 *
 * Uses the talk-ai service account, the same identity the app uses. No
 * fallbacks: a wrong model name fails loudly.
 */

import { GoogleAuth } from "google-auth-library";
import { existsSync } from "node:fs";

const PROJECT = process.env.VERTEX_PROJECT || "talk-therapy-509209";
const KEY = process.env.TALK_AI_CREDENTIALS || "./secrets/talk-ai-sa.json";
const TEXT = "gemini-3.8-flash";
const TTS = "gemini-3.1-flash-tts-preview";
const VOICE = process.env.TALK_VOICE || "Vindemiatrix";

if (!existsSync(KEY)) throw new Error(`missing ${KEY}`);
const auth = new GoogleAuth({ keyFile: KEY, scopes: "https://www.googleapis.com/auth/cloud-platform" });
const token = (await (await auth.getClient()).getAccessToken()).token;

const base = (m) =>
  `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/publishers/google/models/${m}`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function post(model, body) {
  const t0 = performance.now();
  // 429 is capacity contention on the shared pool, not a bad request: retry the
  // SAME model with backoff. Never a different model.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base(model)}:generateContent`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt + Math.random() * 300));
      continue;
    }
    if (!res.ok) throw new Error(`${model} ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
    return { json: JSON.parse(text), ms: Math.round(performance.now() - t0), retries: attempt };
  }
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const STYLE = "a warm, calm Gambian woman speaking gently and unhurriedly, like a trusted counsellor";
const ttsBody = (text) => ({
  contents: [{ role: "user", parts: [{ text: `${STYLE}:\n\n${text}` }] }],
  generationConfig: {
    responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
  },
});

async function speak(text) {
  const { json, ms } = await post(TTS, ttsBody(text));
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`no audio (${JSON.stringify(json.promptFeedback ?? {})})`);
  const rate = Number((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1]) || 24000;
  const pcm = Buffer.from(part.inlineData.data, "base64");
  return { wav: pcmToWav(pcm, rate), ms, seconds: pcm.length / (rate * 2), mime: part.inlineData.mimeType };
}

// ---------------------------------------------------------------- A. TTS stream
console.log("\nA. TTS streaming");
const LINE =
  "I hear you. That sounds like a lot to carry on your own. Would you tell me a little more about what has been happening this week?";
{
  const whole = await speak(LINE);
  console.log(`  non-stream: ${whole.ms}ms for ${whole.seconds.toFixed(1)}s of audio (${whole.mime})`);

  const t0 = performance.now();
  const res = await fetch(`${base(TTS)}:streamGenerateContent?alt=sse`, {
    method: "POST", headers, body: JSON.stringify(ttsBody(LINE)),
  });
  if (!res.ok) {
    console.log(`  stream: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  } else {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", chunks = 0, first = 0, bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Vertex separates SSE events with CRLF pairs; normalise before splitting.
      buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const j = JSON.parse(line.slice(6));
        const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
        if (p) {
          chunks += 1;
          bytes += Buffer.from(p.inlineData.data, "base64").length;
          if (!first) first = Math.round(performance.now() - t0);
        }
      }
    }
    console.log(`  stream: ${chunks} audio chunks, first at ${first}ms, total ${Math.round(performance.now() - t0)}ms, ${(bytes / 48000).toFixed(1)}s audio`);
  }
}

// ------------------------------------------------- B. one-call understanding
console.log("\nB. Transcribe + detect + translate in one call");
const UNDERSTAND_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    language: { type: "STRING", enum: ["english", "wolof", "mandinka", "pulaar", "other", "none"] },
    english: { type: "STRING" },
  },
  required: ["transcript", "language", "english"],
};
const SAMPLES = {
  english: "I have not been sleeping well since I lost my job, and I feel like I am letting my family down.",
  wolof: "Dama tàyyi lool. Sama xel dafa jaaxle, te duma nelaw guddi.",
};
for (const [lang, line] of Object.entries(SAMPLES)) {
  const { wav } = await speak(line);
  for (const thinking of [undefined, "low"]) {
    try {
      const { json, ms } = await post(TEXT, {
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } },
            {
              text:
                "Transcribe this audio verbatim in the language spoken, identify that language, " +
                "and translate it into English. Names that may appear: Talk.",
            },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: UNDERSTAND_SCHEMA,
          ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
        },
      });
      const out = JSON.parse(json.candidates[0].content.parts.map((p) => p.text || "").join(""));
      console.log(`  [${lang}, thinking=${thinking ?? "default"}] ${ms}ms thoughts=${json.usageMetadata?.thoughtsTokenCount ?? 0}`);
      console.log(`     said   : ${line}`);
      console.log(`     heard  : ${out.transcript}  (${out.language})`);
      console.log(`     english: ${out.english}`);
    } catch (e) {
      console.log(`  [${lang}, thinking=${thinking ?? "default"}] FAILED ${e.message}`);
    }
  }
}

// ------------------------------------------------------------- C. reply time
console.log("\nC. Reply latency");
for (const thinking of [undefined, "minimal", "low"]) {
  try {
    const { json, ms } = await post(TEXT, {
      systemInstruction: { parts: [{ text: "You are Talk, a warm companion. Reply in one or two short spoken sentences." }] },
      contents: [{ role: "user", parts: [{ text: SAMPLES.english }] }],
      generationConfig: {
        temperature: 0.7,
        ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
      },
    });
    const out = json.candidates[0].content.parts.map((p) => p.text || "").join("").trim();
    console.log(`  thinking=${thinking ?? "default"}: ${ms}ms thoughts=${json.usageMetadata?.thoughtsTokenCount ?? 0} → ${out}`);
  } catch (e) {
    console.log(`  thinking=${thinking ?? "default"}: FAILED ${e.message}`);
  }
}

// ------------------------------------------------ D. one call for the turn
console.log("\nD. Whole turn in one call (hear + translate + reply)");
const TURN_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    language: { type: "STRING", enum: ["english", "wolof", "mandinka", "pulaar", "other", "none"] },
    english: { type: "STRING" },
    reply: { type: "STRING" },
    replyEnglish: { type: "STRING" },
    risk: { type: "STRING", enum: ["none", "low", "elevated", "urgent"] },
  },
  required: ["transcript", "language", "english", "reply", "replyEnglish", "risk"],
  propertyOrdering: ["transcript", "language", "english", "reply", "replyEnglish", "risk"],
};
{
  const { wav } = await speak(SAMPLES.wolof);
  for (const tc of [undefined, { thinkingLevel: "low" }, { thinkingBudget: 0 }]) {
    try {
      const { json, ms, retries } = await post(TEXT, {
        systemInstruction: {
          parts: [{
            text:
              "You are Talk, a warm companion for people in The Gambia. The user speaks to you by voice. " +
              "Transcribe their audio verbatim, identify the language, translate it to English, then reply " +
              "in THE SAME LANGUAGE they used, in one or two short spoken sentences. Gambian Wolof, never " +
              "Senegalese Wolof, and never French words.",
          }],
        },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: TURN_SCHEMA,
          ...(tc ? { thinkingConfig: tc } : {}),
        },
      });
      const out = JSON.parse(json.candidates[0].content.parts.map((p) => p.text || "").join(""));
      console.log(`  thinking=${JSON.stringify(tc ?? "default")}: ${ms}ms retries=${retries} thoughts=${json.usageMetadata?.thoughtsTokenCount ?? 0}`);
      console.log(`     heard : ${out.transcript} (${out.language}) → ${out.english}`);
      console.log(`     reply : ${out.reply}`);
      console.log(`     (en)  : ${out.replyEnglish}   risk=${out.risk}`);
    } catch (e) {
      console.log(`  thinking=${JSON.stringify(tc ?? "default")}: FAILED ${e.message}`);
    }
  }
}
process.exitCode = 0;
