/**
 * Talk's conversation, as Cloud Functions.
 *
 * These spend real money on Vertex, and they hold the identity that can. That
 * is why they are here and not in the web app: a web host holds the public
 * Firebase config and nothing more.
 *
 * EVERY ONE RUNS AS `talk-ai`, which holds roles/aiplatform.user and nothing
 * else. So a flaw in this file can waste model budget and cannot read a single
 * journal entry — the same split the service-account key used to give, now
 * enforced by the runtime instead of by a file that had to exist somewhere.
 *
 * onRequest rather than onCall, deliberately: a callable waits for the whole
 * result and returns it in one piece, and Talk's voice has to start playing
 * before the sentence has finished being synthesised. That difference is the
 * difference between a conversation and a wait.
 */

import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  FOLD_TURNS,
  LANGUAGES,
  MAX_AUDIO_BASE64,
  MAX_TEXT_CHARS,
  type Language,
} from "../../app/lib/ai/protocol";
import { cleanIntake } from "../../app/lib/matching";
import {
  presentProviders,
  renderInLanguage,
  runGreeting,
  runTurn,
  speak,
  summarize,
} from "./ai/talk";
import {
  allow,
  callerClaims,
  cleanHistory,
  cleanSummary,
  cors,
  json,
  speakingResponse,
} from "./ai/http";

const REGION = "us-east4";

/** The identity these run as. Vertex and nothing else. */
const AI_SERVICE_ACCOUNT = "talk-ai@talk-therapy-509209.iam.gserviceaccount.com";

const options = (timeoutSeconds: number, memory: "256MiB" | "512MiB" = "512MiB") => ({
  region: REGION,
  serviceAccount: AI_SERVICE_ACCOUNT,
  timeoutSeconds,
  memory,
  // One turn is seconds of model time; a cold start on top of that is felt.
  // Zero still, because an idle instance costs money and this is pre-launch.
  minInstances: 0,
  concurrency: 20,
});

/** Aborts the model work when the person closes the tab or taps to interrupt. */
function abortOnClose(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  return controller.signal;
}

/**
 * Whether a conversation with Talk has to be paid for first.
 *
 * Off until the web app that takes the payment is live: switching it on
 * before then would answer every conversation on the deployed site with
 * "not paid for", with no way to pay. Turn it on in functions/.env
 * (CONSULTATION_GATE=on) and redeploy these functions, in that order, after
 * the front end ships.
 */
const gateOn = () => process.env.CONSULTATION_GATE === "on";

/**
 * Everything these endpoints share: CORS, a POST, a signed-in caller, a paid
 * consultation, a body.
 *
 * The consultation check is HERE, once, so no endpoint can be added without
 * it. It is the real gate — the page's own check is only so somebody is shown
 * the payment sheet instead of an error. `paid: false` is for reading the
 * screen aloud, which every signed-in person uses, paying or not: an
 * accessibility feature is not part of the product being sold.
 */
async function entry(
  req: Request,
  res: Response,
  bucket: string,
  limit: number,
  { paid = true }: { paid?: boolean } = {},
): Promise<{ uid: string; body: Record<string, unknown> } | null> {
  if (cors(req, res)) return null;

  if (req.method !== "POST") {
    res.set("Allow", "POST");
    json(res, 405, { error: "Use POST." });
    return null;
  }

  const caller = await callerClaims(req);
  if (!caller) {
    json(res, 401, { error: "Sign in to talk to Talk." });
    return null;
  }
  const { uid } = caller;

  if (paid && gateOn()) {
    const live = caller.aiTier !== null && caller.aiExpiresAt !== null && caller.aiExpiresAt > Date.now();
    if (!live) {
      json(res, 402, { error: "Your consultation has not been paid for yet.", code: "payment_required" });
      return null;
    }
  }

  if (!allow(uid, bucket, limit, 5 * 60_000)) {
    json(res, 429, {
      error: "That's a lot in a short time. Take a breath and try again in a minute.",
    });
    return null;
  }

  // Cloud Functions parses JSON for us; a malformed body arrives as something
  // that is not an object.
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body !== "object" || Array.isArray(body)) {
    json(res, 400, { error: "Invalid request body." });
    return null;
  }

  return { uid, body };
}

const num = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : undefined;

// ------------------------------------------------------------------- a turn

/**
 * One turn: the utterance (or typed message) in, Talk's words and voice out.
 *
 * In intake mode she is doing the onboarding — the request carries what she
 * has learned so far, and the reply carries the merged result and whether she
 * now has enough to suggest providers.
 */
export const companionTurn = onRequest(options(120), async (req, res) => {
  // A turn is at least ~6s end to end, so 40 in five minutes is far past any
  // real conversation while still capping what one account can spend.
  const start = await entry(req, res, "turn", 40);
  if (!start) return;
  const { body } = start;

  const audio = typeof body.audio === "string" ? body.audio : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (audio && (audio.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 64)))) {
    json(res, 400, { error: "Oversized or malformed audio." });
    return;
  }
  if (!audio && !text) {
    json(res, 400, { error: "Say or type something first." });
    return;
  }

  const paceWpm = num(body.paceWpm, 400);
  const signal = abortOnClose(res);
  const input = {
    audio: audio || undefined,
    text: audio ? undefined : text,
    history: cleanHistory(body.history),
    summary: cleanSummary(body.summary),
    mode: body.mode === "intake" ? ("intake" as const) : ("companion" as const),
    intake: cleanIntake(body.intake, LANGUAGES),
    elapsedSec: num(body.elapsedSec, 4 * 60 * 60),
    paceWpm,
    awaitingConsent: body.awaitingConsent === true,
    displayName: typeof body.displayName === "string" ? body.displayName.slice(0, 80) : null,
  };

  await speakingResponse(res, "companion/turn", () => runTurn(input, signal), paceWpm);
});

// ----------------------------------------------------------- Talk goes first

/**
 * Onboarding opens with her voice rather than instructions on a screen: a new
 * person hears who she is and her first question; somebody returning mid-way
 * is welcomed back in their own language, where they left off.
 */
export const companionGreet = onRequest(options(60), async (req, res) => {
  const start = await entry(req, res, "greet", 20);
  if (!start) return;
  const { body } = start;

  const signal = abortOnClose(res);
  const input = {
    mode: body.mode === "intake" ? ("intake" as const) : ("companion" as const),
    intake: cleanIntake(body.intake, LANGUAGES),
    displayName: typeof body.displayName === "string" ? body.displayName.slice(0, 80) : null,
    // Only an explicit false asks: see GreetRequest.consented.
    consented: body.consented === false ? false : undefined,
  };

  await speakingResponse(res, "companion/greet", () => runGreeting(input, signal));
});

// ------------------------------------------------------------ read it aloud

/**
 * Read this aloud.
 *
 * Anything on screen can be spoken: a provider's details, a message, a time.
 * Many of the people this is built for cannot read well, or cannot see, and a
 * product that only writes is closed to them.
 *
 * The text arrives in English — it is UI copy or a profile — and is rendered
 * into the person's own language before it is spoken, because reading a Wolof
 * speaker an English sentence in a Wolof accent helps nobody.
 */
export const companionSpeak = onRequest(options(60), async (req, res) => {
  // Reading a screen is cheap but not free: one TTS call each time.
  const start = await entry(req, res, "speak", 60, { paid: false });
  if (!start) return;
  const { body } = start;

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (!text) {
    json(res, 400, { error: "Nothing to say." });
    return;
  }

  const language = (LANGUAGES as readonly string[]).includes(body.language as string)
    ? (body.language as Language)
    : "english";
  const paceWpm = num(body.paceWpm, 400);
  const signal = abortOnClose(res);

  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.set("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let open = true;
  const send = (event: unknown) => {
    if (!open) return;
    try {
      res.write(JSON.stringify(event) + "\n");
    } catch {
      open = false;
    }
  };
  res.on("close", () => (open = false));

  try {
    const spoken = language === "english" ? text : await renderInLanguage(language, text, signal);
    send({ type: "text", text: spoken, language });
    for await (const chunk of speak(spoken, language, signal, paceWpm)) {
      send({ type: "audio", pcm: chunk.pcm.toString("base64"), sampleRate: chunk.sampleRate });
    }
    send({ type: "done" });
  } catch (e) {
    if (!signal.aborted) {
      console.error("[companion/speak]", e);
      send({ type: "error", stage: "voice", message: "Could not read that aloud." });
    }
  } finally {
    try {
      res.end();
    } catch {
      // Already closed by the client.
    }
  }
});

// --------------------------------------------------------- who she found

/**
 * The end of the onboarding: Talk says who she found.
 *
 * The whole point of the conversation is this hand-off, and it has to work for
 * someone who cannot read the cards on screen — so she introduces each
 * provider out loud, in their language, with the reason each one fits, and the
 * names come back as buttons to tap.
 */
export const companionPresent = onRequest(options(90), async (req, res) => {
  const start = await entry(req, res, "present", 20);
  if (!start) return;
  const { body } = start;

  const text = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const list = (v: unknown, max = 6) =>
    Array.isArray(v) ? v.map((x) => text(x, 60)).filter(Boolean).slice(0, max) : [];

  // Shaped by the client from its own ranking; names and numbers only.
  const providers = (Array.isArray(body.providers) ? body.providers : [])
    .slice(0, 3)
    .map((p: Record<string, unknown>) => ({
      uid: text(p.uid, 64),
      name: text(p.name, 80),
      services: list(p.services),
      languages: list(p.languages),
      location: text(p.location, 60),
      fee: text(p.fee, 24),
      reasons: list(p.reasons, 4),
    }))
    .filter((p) => p.uid && p.name);

  if (!providers.length) {
    json(res, 400, { error: "No providers to present." });
    return;
  }

  const signal = abortOnClose(res);
  const intake = cleanIntake(body.intake, LANGUAGES);
  await speakingResponse(res, "companion/present", () => presentProviders(intake, providers, signal));
});

// ------------------------------------------------------------- summarising

/**
 * Folds the oldest turns of a conversation into its running summary.
 *
 * Called in the background once history outgrows the window, so it never adds
 * latency to a turn somebody is waiting on.
 */
export const companionSummarize = onRequest(options(60, "256MiB"), async (req, res) => {
  const start = await entry(req, res, "summarize", 20);
  if (!start) return;
  const { body } = start;

  const turns = cleanHistory(body.turns, FOLD_TURNS * 2);
  if (!turns.length) {
    json(res, 400, { error: "Nothing to summarise." });
    return;
  }

  try {
    const summary = await summarize(cleanSummary(body.summary), turns, abortOnClose(res));
    json(res, 200, { summary });
  } catch (e) {
    console.error("[companion/summarize]", e);
    json(res, 502, { error: "Summary failed." });
  }
});
