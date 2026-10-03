import { renderInLanguage, speak } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { LANGUAGES, MAX_TEXT_CHARS, type Language } from "@/lib/ai/protocol";
import { json } from "../validate";

/**
 * Read this aloud.
 *
 * Anything on screen can be spoken: a provider's details, a message, a
 * question. Many of the people this is built for cannot read well, or cannot
 * see, and a product that only writes is closed to them.
 *
 * The text arrives in English (it is UI copy or a profile) and is rendered
 * into the person's own language before it is spoken, because reading a Wolof
 * speaker an English sentence in a Wolof accent helps nobody.
 *
 * Streams the same `{"type":"audio"}` lines as the turn endpoint, so the page
 * plays it through the player it already has.
 */

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in first." });
  // Reading a screen is cheap but not free: this is one TTS call each time.
  if (!allow(user.uid, "speak", 60, 5 * 60_000)) return json(429, { error: "Too many requests." });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (!text) return json(400, { error: "Nothing to say." });
  const language = (LANGUAGES as readonly string[]).includes(body.language as string)
    ? (body.language as Language)
    : "english";
  const paceWpm = typeof body.paceWpm === "number" && body.paceWpm > 0 ? Math.min(body.paceWpm, 400) : undefined;

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
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
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {}
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
