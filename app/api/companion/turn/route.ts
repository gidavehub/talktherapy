import { runTurn } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { LANGUAGES, MAX_AUDIO_BASE64, MAX_TEXT_CHARS } from "@/lib/ai/protocol";
import { cleanIntake } from "@/lib/matching";
import { cleanHistory, cleanSummary, json } from "../validate";
import { speakingResponse } from "../stream";

/**
 * One turn: the user's utterance (or typed message) in, Talk's words and
 * voice out, streamed — see ../stream.ts for the event format.
 *
 * In intake mode Talk is doing the onboarding: the request carries what she
 * has learned so far, and the response carries the merged result and whether
 * she now has everything she needs to suggest counsellors.
 */

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in to talk to Talk." });
  // A turn is at least ~6s end to end, so 40 in five minutes is far past any
  // real conversation while still capping what one account can spend.
  if (!allow(user.uid, "turn", 40, 5 * 60_000)) {
    return json(429, { error: "That's a lot of turns in a short time. Take a breath and try again in a minute." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const audio = typeof body.audio === "string" ? body.audio : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (audio && (audio.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 64)))) {
    return json(400, { error: "Oversized or malformed audio." });
  }
  if (!audio && !text) return json(400, { error: "Say or type something first." });

  const mode = body.mode === "intake" ? "intake" : "companion";
  const input = {
    audio: audio || undefined,
    text: audio ? undefined : text,
    history: cleanHistory(body.history),
    summary: cleanSummary(body.summary),
    mode,
    intake: cleanIntake(body.intake, LANGUAGES),
  } as const;

  return speakingResponse(req.signal, "companion/turn", () => runTurn(input, req.signal));
}
