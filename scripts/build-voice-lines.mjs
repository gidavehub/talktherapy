/**
 * Record what Talk says on the landing page, once, as files.
 *
 *   cd functions && npm run build && cd .. && npm run build:voice
 *   npm run build:voice -- --draft-wolof     fill missing Wolof from the model
 *   npm run build:voice -- --force           re-record everything
 *   npm run build:voice -- --only=welcome    one line
 *
 * Somebody opening the landing page hears Talk straight away, so her voice
 * there cannot wait on a model: each line is synthesised HERE, at build time,
 * through the same speak() the conversation uses (so it is the same voice),
 * encoded to MP3 and committed under public/voice/onboarding. Nothing is
 * generated per visit.
 *
 * MP3, not WAV: 24 kHz 16-bit audio is ~48 KB a second, and the first visit
 * is often on Gambian mobile data. At 48 kbps a line is a few kilobytes.
 *
 * File names carry a hash of the text, so a changed line is a new URL and an
 * old one can be cached for ever.
 *
 * Writes app/lib/ai/voice-lines.generated.json, which the page reads. A line
 * whose text has not changed is not re-recorded (the hash says so) unless
 * --force. On any failure nothing is written for that line and the script
 * exits non-zero: a half-made file on the landing page is worse than none.
 *
 * Needs ./secrets/talk-ai-sa.json (see scripts/lib/talk.mjs) — never run as
 * part of `next build`, which has to work on a host without that key.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { Mp3Encoder } from "@breezystack/lamejs";
import { renderInLanguage, spokenPcm, turn } from "./lib/talk.mjs";

const SOURCE = "app/lib/ai/onboarding-lines.json";
const MANIFEST = "app/lib/ai/voice-lines.generated.json";
const OUT_DIR = "public/voice/onboarding";
const PUBLIC_PATH = "/voice/onboarding";
const LOCALES = { en: "english", wo: "wolof" };

const args = process.argv.slice(2);
const force = args.includes("--force");
const draftWolof = args.includes("--draft-wolof");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;

const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Silence off both ends, keeping a breath of it.
 *
 * The voice model leaves up to a second either side, and on a page where the
 * English and Wolof take turns, that dead air is what makes a short line feel
 * slow and the rotation feel broken.
 */
function trimSilence(pcm, sampleRate) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const loud = (s) => Math.abs(s) > 600;
  let first = samples.findIndex(loud);
  if (first < 0) return pcm;
  let last = samples.length - 1;
  while (last > first && !loud(samples[last])) last -= 1;
  const pad = Math.round(sampleRate * 0.12);
  first = Math.max(0, first - pad);
  last = Math.min(samples.length - 1, last + pad);
  return Buffer.from(pcm.subarray(first * 2, (last + 1) * 2));
}

/** 16-bit mono PCM → MP3 at 48 kbps, which is plenty for one voice. */
function toMp3(pcm, sampleRate) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const encoder = new Mp3Encoder(1, sampleRate, 48);
  const out = [];
  const block = 1152;
  for (let i = 0; i < samples.length; i += block) {
    const chunk = encoder.encodeBuffer(samples.subarray(i, i + block));
    if (chunk.length) out.push(Buffer.from(chunk));
  }
  const tail = encoder.flush();
  if (tail.length) out.push(Buffer.from(tail));
  return Buffer.concat(out);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const source = await readJson(SOURCE, null);
  if (!source) throw new Error(`cannot read ${SOURCE}`);
  const previous = await readJson(MANIFEST, { lines: [] });
  const prevById = new Map(previous.lines.map((l) => [l.id, l]));

  await mkdir(OUT_DIR, { recursive: true });
  let sourceChanged = false;
  const lines = [];

  for (const line of source.lines) {
    if (only && line.id !== only) {
      if (prevById.has(line.id)) lines.push(prevById.get(line.id));
      continue;
    }

    // Wolof missing: draft it, but only when asked, and say it is a draft.
    if (!line.wo?.trim()) {
      if (!draftWolof) throw new Error(`"${line.id}" has no Wolof. Write it in ${SOURCE}, or pass --draft-wolof.`);
      line.wo = (await renderInLanguage("wolof", line.en)).trim();
      line.woDraft = true;
      // Back to English, so whoever checks it can see what the draft says.
      line.woBack = (await turn({ text: line.wo })).english;
      sourceChanged = true;
      console.log(`  drafted wolof for ${line.id}: ${line.wo}\n      reads back as: ${line.woBack}`);
    }

    const clips = {};
    for (const [locale, language] of Object.entries(LOCALES)) {
      const text = line[locale].trim();
      const hash = sha(`${language}\n${text}`);
      const before = prevById.get(line.id)?.clips?.[locale];
      if (!force && before?.sha256 === hash) {
        clips[locale] = before;
        continue;
      }

      const spoken = await spokenPcm(text, language);
      const { sampleRate } = spoken;
      const pcm = trimSilence(spoken.pcm, sampleRate);
      const seconds = pcm.length / (sampleRate * 2);
      const mp3 = toMp3(pcm, sampleRate);
      const name = `${line.id}.${locale}.${hash.slice(0, 10)}.mp3`;
      await writeFile(`${OUT_DIR}/${name}`, mp3);
      clips[locale] = {
        src: `${PUBLIC_PATH}/${name}`,
        text,
        seconds: Math.round(seconds * 100) / 100,
        bytes: mp3.length,
        sha256: hash,
        ...(locale === "wo" ? { draft: line.woDraft !== false } : {}),
      };
      console.log(`  ${line.id}.${locale}: ${seconds.toFixed(1)}s, ${(mp3.length / 1024).toFixed(1)} KB — ${text}`);
    }
    lines.push({ id: line.id, clips });
  }

  if (sourceChanged) await writeFile(SOURCE, `${JSON.stringify(source, null, 2)}\n`);

  const manifest = {
    note: "GENERATED by scripts/build-voice-lines.mjs from onboarding-lines.json. Do not edit.",
    lines,
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // Files no line points at any more: a changed line's old recording.
  const kept = new Set(lines.flatMap((l) => Object.values(l.clips).map((c) => c.src.split("/").pop())));
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith(".mp3") && !kept.has(file)) {
      await unlink(`${OUT_DIR}/${file}`);
      console.log(`  removed ${file} (no longer used)`);
    }
  }

  const total = lines.flatMap((l) => Object.values(l.clips)).reduce((n, c) => n + c.bytes, 0);
  console.log(`\n${lines.length} lines, ${(total / 1024).toFixed(0)} KB in all → ${MANIFEST}`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exitCode = 1;
});
