import { presentProviders } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { LANGUAGES } from "@/lib/ai/protocol";
import { cleanIntake } from "@/lib/matching";
import { json } from "../validate";
import { speakingResponse } from "../stream";

/**
 * The end of the onboarding: Talk says who she found.
 *
 * The whole point of the conversation is this hand-off, and it has to work
 * for someone who cannot read the cards on screen — so she introduces each
 * provider out loud, in their language, with the reason each one fits, and
 * the names come back as buttons to tap.
 */

export const maxDuration = 45;

/** Shaped by the client from its own ranking; names and numbers only. */
type IncomingProvider = {
  uid?: unknown;
  name?: unknown;
  services?: unknown;
  languages?: unknown;
  location?: unknown;
  fee?: unknown;
  reasons?: unknown;
};

const text = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 6) =>
  Array.isArray(v) ? v.map((x) => text(x, 60)).filter(Boolean).slice(0, max) : [];

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in to talk to Talk." });
  if (!allow(user.uid, "present", 20, 5 * 60_000)) return json(429, { error: "Too many requests." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const providers = (Array.isArray(body.providers) ? body.providers : [])
    .slice(0, 3)
    .map((p: IncomingProvider) => ({
      uid: text(p.uid, 64),
      name: text(p.name, 80),
      services: list(p.services),
      languages: list(p.languages),
      location: text(p.location, 60),
      fee: text(p.fee, 24),
      reasons: list(p.reasons, 4),
    }))
    .filter((p) => p.uid && p.name);

  if (!providers.length) return json(400, { error: "No providers to present." });

  const intake = cleanIntake(body.intake, LANGUAGES);
  return speakingResponse(req.signal, "companion/present", () => presentProviders(intake, providers, req.signal));
}
