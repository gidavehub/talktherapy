/**
 * The HTTP shell around Talk's conversation, for Cloud Functions.
 *
 * The Next routes this replaces returned a `Response` built on a
 * ReadableStream. A function gets Express-style `req`/`res` instead, so the
 * same newline-delimited JSON is written with `res.write` — the contract on
 * the wire is unchanged, and the page reads it exactly as before.
 *
 * These functions are onRequest rather than onCall for one reason: a callable
 * waits for the whole result and hands it back in one piece. Talk's voice has
 * to START PLAYING before the sentence has finished being synthesised, which
 * is the difference between a conversation and a wait.
 */

// `Request` is firebase-functions' own (it adds rawBody); the response is
// Express's, which is what the handler is actually given.
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  LANGUAGES,
  MAX_HISTORY_TURNS,
  MAX_SUMMARY_CHARS,
  MAX_TURN_CHARS,
  type HistoryTurn,
  type Language,
  type TurnEvent,
  type TurnResult,
} from "../../../app/lib/ai/protocol";
import { speak } from "./talk";

// Pinned for the same reason as functions/src/payments.ts: off Cloud Functions
// the default app would take this machine's ADC project, and an ID token's
// audience would be checked against the wrong one.
if (getApps().length === 0) {
  initializeApp({
    projectId:
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209",
  });
}

/**
 * The browser calls these from another origin, so every one needs CORS.
 *
 * Authorization has to be allowed explicitly — a request carrying it is never
 * a "simple" request, so the browser preflights first and will not send the
 * real one unless the header is named here.
 */
export function cors(req: Request, res: Response): boolean {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

/**
 * Who is calling.
 *
 * These endpoints spend real money on Vertex, so they are never open: a
 * request must carry a Firebase ID token. Verifying one needs no privileges —
 * it is a signature check against Google's public certificates — which is why
 * it still works in a function running as the AI identity, which can read
 * nothing.
 */
export async function callerUid(req: Request): Promise<string | null> {
  return (await callerClaims(req))?.uid ?? null;
}

/**
 * Who is calling, and what they have paid for.
 *
 * The paid consultation is a custom claim on the same token (set by the
 * payment functions — see grantClaim in ../index.ts), so it is covered by the
 * same signature check and needs no database read. That matters here: these
 * functions run as an identity that cannot read the database at all.
 */
export async function callerClaims(
  req: Request,
): Promise<{ uid: string; aiTier: string | null; aiExpiresAt: number | null } | null> {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      aiTier: typeof decoded.aiTier === "string" ? decoded.aiTier : null,
      aiExpiresAt: typeof decoded.aiExpiresAt === "number" ? decoded.aiExpiresAt : null,
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- rate limiting

/**
 * Per-user sliding window, in memory.
 *
 * Per instance only, so it bounds a runaway client or a stolen token rather
 * than a determined attacker — App Check is the real answer before launch.
 * Cloud Functions makes this slightly weaker than it was in one Next server
 * (several instances, several windows) and slightly stronger in practice,
 * because an idle instance is reaped and its windows with it.
 */
const windows = new Map<string, number[]>();

export function allow(uid: string, bucket: string, limit: number, windowMs: number): boolean {
  const key = `${bucket}:${uid}`;
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  windows.set(key, hits);
  return true;
}

// ------------------------------------------------------------- validation

/** Untrusted client input → a bounded, well-formed history. */
export function cleanHistory(raw: unknown, max = MAX_HISTORY_TURNS): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryTurn[] = [];
  for (const t of raw.slice(-max)) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const role = r.role === "talk" ? "talk" : r.role === "user" ? "user" : null;
    const text = typeof r.text === "string" ? r.text.slice(0, MAX_TURN_CHARS).trim() : "";
    if (!role || !text) continue;
    const english = typeof r.english === "string" ? r.english.slice(0, MAX_TURN_CHARS).trim() : undefined;
    const language = LANGUAGES.includes(r.language as Language) ? (r.language as Language) : undefined;
    out.push({ role, text, english, language });
  }
  return out;
}

export function cleanSummary(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, MAX_SUMMARY_CHARS) : "";
}

export function json(res: Response, status: number, body: unknown): void {
  res.status(status).set("Cache-Control", "no-store").json(body);
}

// -------------------------------------------------------------- streaming

/** Voice chunks arrive every ~10ms; batching to ~0.2s keeps the event count sane. */
const MIN_AUDIO_BYTES = 9600;

/**
 * The streamed reply shared by every route that makes Talk speak:
 *
 *   {"type":"turn", ...}               what was heard, and what Talk says
 *   {"type":"audio", pcm, sampleRate}  many, as her voice streams
 *   {"type":"done"}                    or {"type":"error", ...}
 *
 * so the page can show the words and start playing her voice before the whole
 * reply has been synthesised.
 */
export async function speakingResponse(
  res: Response,
  label: string,
  produce: () => Promise<TurnResult>,
  /** The person's own speaking pace, so Talk answers at their speed. */
  paceWpm?: number,
): Promise<void> {
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Cache-Control", "no-store");
  // Tells any proxy in the way not to hold the body back until it is complete,
  // which would defeat the entire point of streaming it.
  res.set("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let open = true;
  const send = (event: TurnEvent) => {
    if (!open) return;
    try {
      open = res.write(JSON.stringify(event) + "\n") || open;
    } catch {
      open = false; // the client went away
    }
  };

  // The client hanging up mid-sentence is ordinary — somebody closed the tab,
  // or tapped to interrupt — so it stops the work rather than logging a fault.
  const aborted = { value: false };
  res.on("close", () => {
    aborted.value = true;
    open = false;
  });

  const t0 = Date.now();
  const log = (what: string) => console.info(`[${label}] ${what} +${Date.now() - t0}ms`);

  try {
    const turn = await produce();
    log(`heard ${turn.language}, risk ${turn.risk}${turn.intakeComplete ? ", intake complete" : ""}`);
    send({ type: "turn", ...turn });

    if (turn.reply && turn.language !== "none") {
      try {
        let pending: Buffer[] = [];
        let pendingBytes = 0;
        let rate = 24000;
        let first = true;
        const flush = () => {
          if (!pendingBytes) return;
          const all = Buffer.concat(pending);
          // 16-bit samples: never split one across events.
          const even = all.length - (all.length % 2);
          send({ type: "audio", pcm: all.subarray(0, even).toString("base64"), sampleRate: rate });
          pending = even < all.length ? [all.subarray(even)] : [];
          pendingBytes = all.length - even;
        };

        const controller = new AbortController();
        res.on("close", () => controller.abort());

        for await (const chunk of speak(turn.reply, turn.language, controller.signal, paceWpm)) {
          rate = chunk.sampleRate;
          pending.push(chunk.pcm);
          pendingBytes += chunk.pcm.length;
          // Ship the very first chunk at once — that is the latency the user
          // hears — and batch the rest.
          if (first || pendingBytes >= MIN_AUDIO_BYTES) {
            if (first) log("first audio");
            flush();
            first = false;
          }
        }
        flush();
        log("voice done");
      } catch (e) {
        if (aborted.value) throw e;
        // The words already reached the page; say the voice failed rather than
        // pretending the whole turn did.
        console.error(`[${label}] voice`, e);
        send({
          type: "error",
          stage: "voice",
          message: "Talk's voice didn't come through this time — her words are shown instead.",
        });
      }
    }
    send({ type: "done" });
  } catch (e) {
    if (!aborted.value) {
      console.error(`[${label}]`, e);
      send({ type: "error", stage: "turn", message: "Talk couldn't respond just then. Please try again." });
    }
  } finally {
    try {
      res.end();
    } catch {
      // Already closed by the client.
    }
  }
}
