import { runTurn, speak } from "@/lib/ai/server/talk";
import { allow, requireUser } from "@/lib/server/requireUser";
import { MAX_AUDIO_BASE64, type TurnEvent } from "@/lib/ai/protocol";
import { cleanHistory, cleanSummary, json } from "../validate";

/**
 * One voice turn: the user's utterance in, Talk's words and voice out.
 *
 * Streams newline-delimited JSON so the page can show what was heard and
 * start playing Talk's voice before the whole reply has been synthesised:
 *
 *   {"type":"turn", transcript, language, english, risk, reply, replyEnglish}
 *   {"type":"audio", pcm, sampleRate}   ← many, as the voice streams
 *   {"type":"done"}                     ← or {"type":"error", ...}
 */

export const maxDuration = 60;

/** Voice chunks arrive every ~10ms; batching to ~0.2s keeps the event count sane. */
const MIN_AUDIO_BYTES = 9600;

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
  if (!audio || audio.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 64))) {
    return json(400, { error: "Missing or oversized audio." });
  }
  const history = cleanHistory(body.history);
  const summary = cleanSummary(body.summary);

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: TurnEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // client went away
        }
      };

      const t0 = Date.now();
      const log = (what: string) => {
        if (process.env.NODE_ENV === "development") console.info(`[companion/turn] ${what} +${Date.now() - t0}ms`);
      };
      try {
        const turn = await runTurn({ audio, history, summary }, signal);
        log(`heard ${turn.language}, risk ${turn.risk}`);
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
            for await (const chunk of speak(turn.reply, turn.language, signal)) {
              rate = chunk.sampleRate;
              pending.push(chunk.pcm);
              pendingBytes += chunk.pcm.length;
              // Ship the very first chunk at once — that is the latency the
              // user hears — and batch the rest.
              if (first || pendingBytes >= MIN_AUDIO_BYTES) {
                if (first) log("first audio");
                flush();
                first = false;
              }
            }
            flush();
            log("voice done");
          } catch (e) {
            if (signal.aborted) throw e;
            // The words already reached the page; say the voice failed rather
            // than pretending the whole turn did.
            send({ type: "error", stage: "voice", message: voiceError(e) });
          }
        }
        send({ type: "done" });
      } catch (e) {
        if (!signal.aborted) {
          console.error("[companion/turn]", e);
          send({ type: "error", stage: "turn", message: "Talk couldn't respond just then. Please try again." });
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

function voiceError(e: unknown) {
  console.error("[companion/turn] voice", e);
  return "Talk's voice didn't come through this time — her words are shown instead.";
}
