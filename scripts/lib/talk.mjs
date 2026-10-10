/**
 * Talk's brain, called directly, for the smoke tests.
 *
 *   import { turn, greet, spokenBytes } from "./lib/talk.mjs";
 *
 * These used to POST to /api/companion/* on a local dev server. That endpoint
 * is now a Cloud Function, and reaching it needs a Firebase ID token — which a
 * script has no way to get without an account. So the tests call the brain
 * itself instead, from the compiled functions bundle.
 *
 * That is not a weaker test. What these scripts have always been about is
 * whether Talk HEARS the right language, rates risk correctly and says the
 * emergency numbers — the brain, not the HTTP envelope around it. The envelope
 * is a token check, a rate limit and some JSON lines, and those are the same
 * for every one of the five.
 *
 * Run `npm run build` in functions/ first; this imports its output. Vertex is
 * reached with TALK_AI_CREDENTIALS (./secrets/talk-ai-sa.json by default),
 * exactly as the deployed function reaches it as the talk-ai identity.
 */

import { readFileSync } from "node:fs";

// The env the brain reads: model names, region, voice. Taken from .env.local
// so a script and the app can never disagree about which model is in use.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
process.env.TALK_AI_CREDENTIALS ||= "./secrets/talk-ai-sa.json";

const brain = await import("../../functions/lib/functions/src/ai/talk.js");

/** One turn, as the companionTurn function would run it. */
export function turn(input) {
  return brain.runTurn({
    history: [],
    summary: "",
    mode: "companion",
    intake: null,
    ...input,
  });
}

/** Talk's opening, as companionGreet would run it. */
export function greet(input = {}) {
  return brain.runGreeting({ mode: "companion", intake: null, displayName: null, ...input });
}

export const presentProviders = brain.presentProviders;
export const renderInLanguage = brain.renderInLanguage;
export const summarize = brain.summarize;

/**
 * How many bytes of voice a reply produces.
 *
 * The HTTP tests asserted "spoken aloud" by counting audio events; this counts
 * the PCM those events would have carried. Zero still means her voice failed,
 * which is the thing worth catching — it happens intermittently, and the words
 * alone are not enough for someone who cannot read them.
 */
export async function spokenBytes(text, language, paceWpm) {
  let bytes = 0;
  for await (const chunk of brain.speak(text, language, undefined, paceWpm)) {
    bytes += chunk.pcm.length;
  }
  return bytes;
}

/**
 * Her voice for a line, as one buffer of 16-bit mono PCM.
 *
 * For the pre-recorded lines (scripts/build-voice-lines.mjs): the same speak()
 * the conversation uses, so the landing page and the app are the same voice.
 * Collected and joined ONCE — a header per chunk would make a file that plays
 * only its first chunk.
 */
export async function spokenPcm(text, language, paceWpm) {
  const parts = [];
  let sampleRate = 24000;
  for await (const chunk of brain.speak(text, language, undefined, paceWpm)) {
    parts.push(chunk.pcm);
    sampleRate = chunk.sampleRate;
  }
  const pcm = Buffer.concat(parts);
  if (!pcm.length) throw new Error(`no audio for "${text.slice(0, 40)}…"`);
  return { pcm, sampleRate, seconds: pcm.length / (sampleRate * 2) };
}
