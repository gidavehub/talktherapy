/**
 * Proves the three models Talk depends on actually work on this project, with
 * this account, before any of it gets wired into the app.
 *
 *   node scripts/probe-models.mjs            # everything
 *   node scripts/probe-models.mjs --tts      # just the voice tests
 *   node scripts/probe-models.mjs --lang     # just the multilingual tests
 *
 * Auth: shells out to `gcloud auth print-access-token`. That avoids adding
 * google-auth-library to the app's dependency tree for a script, and means the
 * probe uses exactly the credentials a developer already has. Override the
 * account with GCLOUD_ACCOUNT, or pass a token directly in VERTEX_TOKEN.
 *
 * There is deliberately NO fallback anywhere in here. If a model is wrong or
 * unavailable the probe fails loudly — a probe that quietly degrades to a
 * working model is how you ship against a model you never tested.
 */

import { execSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const PROJECT = process.env.VERTEX_PROJECT || "talk-therapy-509209";
const ACCOUNT = process.env.GCLOUD_ACCOUNT || "davelabs01@gmail.com";
const OUT = process.env.OUT || "scratch/voice-probe";

// The three models, named once. Everything below reads from here so a rename
// cannot leave half the probe measuring a model nothing calls.
const MODELS = {
  text: "gemini-3.8-flash",
  tts: "gemini-3.1-flash-tts-preview",
  // Transcription is the text model with audio handed to it as inlineData —
  // there is no separate speech-to-text model in this stack.
  transcribe: "gemini-3.8-flash",
};

const GCLOUD =
  process.env.GCLOUD_BIN ||
  "C:\\Users\\conne\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd";

import { existsSync } from "node:fs";

const AI_KEY = process.env.TALK_AI_CREDENTIALS || "./secrets/talk-ai-sa.json";

let cachedToken = null;
async function token() {
  if (process.env.VERTEX_TOKEN) return process.env.VERTEX_TOKEN;
  if (cachedToken) return cachedToken;

  // Prefer the talk-ai service account — it is what the app itself will use,
  // so the probe exercises the same identity and would catch a missing role.
  // gcloud ADC is the fallback for a machine that has not been given the key.
  if (existsSync(AI_KEY)) {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      keyFile: AI_KEY,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    cachedToken = (await (await auth.getClient()).getAccessToken()).token;
    return cachedToken;
  }
  // execSync with a shell, not execFileSync: gcloud on Windows is a .cmd
  // shim, and Node refuses to spawn one directly (EINVAL).
  cachedToken = execSync(`"${GCLOUD}" auth print-access-token --account=${ACCOUNT}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return cachedToken;
}

const url = (model) =>
  `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global` +
  `/publishers/google/models/${model}:generateContent`;

async function post(model, body) {
  const res = await fetch(url(model), {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${model} → ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  return JSON.parse(text);
}

/** Raw PCM out of the TTS model needs a RIFF header before anything will play it. */
function pcmToWav(base64, sampleRate) {
  const pcm = Buffer.from(base64, "base64");
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([h, pcm]), seconds: pcm.length / (sampleRate * 2) };
}

async function speak(text, voiceName, style) {
  const json = await post(MODELS.tts, {
    // The style description is prepended to the transcript — this is how the
    // model is told *how* to sound, and it is the whole "audio profile".
    contents: [{ role: "user", parts: [{ text: style ? `${style}:\n\n${text}` : text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });

  const blocked = json.promptFeedback?.blockReason;
  if (blocked) throw new Error(`blocked by safety filter: ${blocked}`);

  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("no audio returned");

  const rate = Number((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1]) || 24000;
  return { ...pcmToWav(part.inlineData.data, rate), mimeType: part.inlineData.mimeType };
}

async function transcribe(wav, hints = []) {
  const spellings = hints.length
    ? `\n\nThese names may appear — spell them exactly this way if you hear them: ${hints.join(", ")}.`
    : "";

  const json = await post(MODELS.transcribe, {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } },
          {
            text:
              "Transcribe this audio verbatim. Return only the words spoken, with no commentary, " +
              "no speaker labels and no formatting. If there is no speech at all, return an empty string." +
              spellings,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });

  if (json.promptFeedback?.blockReason) {
    return { text: "", blocked: json.promptFeedback.blockReason };
  }
  return {
    text: (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim(),
    blocked: null,
  };
}

async function detectLanguage(text) {
  const json = await post(MODELS.text, {
    contents: [{ role: "user", parts: [{ text }] }],
    systemInstruction: {
      parts: [
        {
          text:
            "Identify the language of the user's message. Answer with exactly one of: " +
            "english, wolof, mandinka, pulaar. Nothing else.",
        },
      ],
    },
    generationConfig: { temperature: 0, maxOutputTokens: 2000 },
  });
  return (json.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------

const ok = (m) => console.log(`  \u001b[32m✓\u001b[0m ${m}`);
const bad = (m) => console.log(`  \u001b[31m✗\u001b[0m ${m}`);
const warn = (m) => console.log(`  \u001b[33m~\u001b[0m ${m}`);

let failures = 0;

async function step(name, fn) {
  console.log(`\n\u001b[1m${name}\u001b[0m`);
  try {
    await fn();
  } catch (e) {
    bad(e.message);
    failures += 1;
  }
}

// Candidate voices for "Talk". The brief is a warm Gambian woman — calm, not
// bright or presenterly. These get auditioned and the files written out so a
// human can actually listen rather than trusting a description.
const CANDIDATES = [
  { voice: "Kore", note: "firm, even" },
  { voice: "Aoede", note: "breathy, warm" },
  { voice: "Leda", note: "youthful" },
  { voice: "Autonoe", note: "bright" },
  { voice: "Vindemiatrix", note: "gentle, low" },
  { voice: "Sulafat", note: "warm" },
];

const TALK_STYLE =
  "a warm, calm Gambian woman in her thirties speaking gently and unhurriedly, " +
  "like a trusted counsellor — soft-spoken, steady, never bright or presenterly";

// Gambian Wolof, not Senegalese: no French loanwords.
const LINES = {
  english: "Hello, I am Talk. Take your time — there is no rush here.",
  wolof: "Salaam aleekum, maa ngi tudd Talk. Naka nga def? Yéwénal sa xel, amul gaaw.",
  mandinka: "I be ñaadi? Ŋa a fo i ye, n too mu Talk le ti. Kana korto, waati be jee.",
  pulaar: "Jam waali. Ko mi Talk. No mbaɗ-ɗaa? Hoolo, alaa heñaare ɗoo.",
};

async function main() {
  const only = process.argv.slice(2);
  const want = (k) => only.length === 0 || only.includes(`--${k}`);

  await mkdir(OUT, { recursive: true });

  console.log(`\u001b[1mTalk — model probe\u001b[0m`);
  console.log(`project: ${PROJECT}`);
  console.log(`account: ${ACCOUNT}`);
  console.log(`models : ${MODELS.text} | ${MODELS.tts}`);

  if (want("text")) {
    await step(`1. Text — ${MODELS.text}`, async () => {
      const j = await post(MODELS.text, {
        contents: [{ role: "user", parts: [{ text: "Reply with exactly: READY" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2000 },
      });
      const out = (j.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
      if (!out) throw new Error("empty response");
      ok(`responded "${out}" (${j.usageMetadata?.totalTokenCount} tokens)`);
    });
  }

  if (want("tts")) {
    await step(`2. Voice audition — ${MODELS.tts}`, async () => {
      for (const c of CANDIDATES) {
        try {
          const r = await speak(LINES.english, c.voice, TALK_STYLE);
          const file = path.join(OUT, `voice-${c.voice}.wav`);
          await writeFile(file, r.wav);
          ok(`${c.voice.padEnd(14)} ${r.seconds.toFixed(1)}s  ${(r.wav.length / 1024).toFixed(0)}KB  → ${file}`);
        } catch (e) {
          bad(`${c.voice.padEnd(14)} ${e.message}`);
          failures += 1;
        }
      }
      console.log(`\n  Listen to these and pick one. Style brief used:\n  "${TALK_STYLE}"`);
    });
  }

  if (want("lang")) {
    await step(`3. Multilingual speech — ${MODELS.tts}`, async () => {
      const voice = process.env.TALK_VOICE || "Vindemiatrix";
      for (const [lang, line] of Object.entries(LINES)) {
        try {
          const r = await speak(line, voice, TALK_STYLE);
          const file = path.join(OUT, `lang-${lang}.wav`);
          await writeFile(file, r.wav);
          ok(`${lang.padEnd(9)} ${r.seconds.toFixed(1)}s → ${file}`);
        } catch (e) {
          bad(`${lang.padEnd(9)} ${e.message}`);
          failures += 1;
        }
      }
      warn("A file being produced does NOT mean the pronunciation is correct.");
      warn("A Gambian speaker has to listen to the Wolof, Mandinka and Pulaar.");
    });

    await step(`4. Language detection — ${MODELS.text}`, async () => {
      for (const [expected, line] of Object.entries(LINES)) {
        const got = await detectLanguage(line);
        if (got.includes(expected)) ok(`${expected.padEnd(9)} detected as "${got}"`);
        else {
          bad(`${expected.padEnd(9)} detected as "${got}" — expected ${expected}`);
          failures += 1;
        }
      }
    });
  }

  if (want("transcribe")) {
    await step(`5. Transcription round-trip — ${MODELS.transcribe}`, async () => {
      const spoken = LINES.english;
      const r = await speak(spoken, "Vindemiatrix", TALK_STYLE);
      await writeFile(path.join(OUT, "transcribe-source.wav"), r.wav);

      const cold = await transcribe(r.wav);
      const hinted = await transcribe(r.wav, ["Talk"]);

      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const said = norm(spoken).split(" ");
      const recall = (t) => {
        const got = new Set(norm(t).split(" "));
        const hits = said.filter((w) => got.has(w)).length;
        return Math.round((hits / said.length) * 100);
      };

      console.log(`    spoken : "${spoken}"`);
      console.log(`    cold   : "${cold.text}"${cold.blocked ? ` [BLOCKED: ${cold.blocked}]` : ""}`);
      console.log(`    hinted : "${hinted.text}"${hinted.blocked ? ` [BLOCKED: ${hinted.blocked}]` : ""}`);

      if (!hinted.text) throw new Error("hinted transcription came back empty");
      const pct = recall(hinted.text);
      if (pct >= 80) ok(`recall ${pct}% with hints`);
      else {
        bad(`recall only ${pct}% — too lossy`);
        failures += 1;
      }
      if (cold.blocked) {
        warn("Cold run was safety-blocked. Local proper nouns need spelling hints —");
        warn("this is a known behaviour and matters a lot for Wolof/Mandinka names.");
      }
    });
  }

  console.log(
    failures === 0
      ? `\n\u001b[32m\u001b[1mALL CHECKS PASSED\u001b[0m — audio in ${OUT}/\n`
      : `\n\u001b[31m\u001b[1m${failures} CHECK(S) FAILED\u001b[0m\n`,
  );
  // exitCode, not exit(): letting the loop drain avoids a libuv assertion
  // on Windows when gRPC/auth handles are still closing.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("\u001b[31mFATAL:\u001b[0m", e.message);
  process.exit(1);
});
