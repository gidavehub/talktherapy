import { summarize } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { FOLD_TURNS } from "@/lib/ai/protocol";
import { cleanHistory, cleanSummary, json } from "../validate";

/**
 * Folds the oldest turns of a conversation into its running summary.
 *
 * Called by the page in the background once history outgrows the window, so
 * it never adds latency to a turn the user is waiting on.
 */

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in to talk to Talk." });
  if (!allow(user.uid, "summarize", 20, 5 * 60_000)) return json(429, { error: "Too many requests." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const turns = cleanHistory(body.turns, FOLD_TURNS * 2);
  if (!turns.length) return json(400, { error: "Nothing to summarise." });

  try {
    const summary = await summarize(cleanSummary(body.summary), turns, req.signal);
    return json(200, { summary });
  } catch (e) {
    console.error("[companion/summarize]", e);
    return json(502, { error: "Summary failed." });
  }
}
