import { runGreeting } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { LANGUAGES } from "@/lib/ai/protocol";
import { cleanIntake } from "@/lib/matching";
import { json } from "../validate";
import { speakingResponse } from "../stream";

/**
 * Talk speaks first.
 *
 * Onboarding opens with her voice rather than instructions on a screen: a new
 * person hears who she is and her first question; someone returning mid-way
 * is welcomed back in their own language and picked up where they left off.
 */

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in to talk to Talk." });
  if (!allow(user.uid, "greet", 20, 5 * 60_000)) return json(429, { error: "Too many requests." });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}

  const input = {
    mode: body.mode === "intake" ? "intake" : "companion",
    intake: cleanIntake(body.intake, LANGUAGES),
    displayName: typeof body.displayName === "string" ? body.displayName.slice(0, 80) : null,
  } as const;

  return speakingResponse(req.signal, "companion/greet", () => runGreeting(input, req.signal));
}
