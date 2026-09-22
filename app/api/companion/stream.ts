import "server-only";
import { speak } from "@/lib/ai/server/talk";
import type { TurnEvent, TurnResult } from "@/lib/ai/protocol";

/**
 * The streamed response shared by every companion route that makes Talk
 * speak: newline-delimited JSON of
 *
 *   {"type":"turn", ...}               what was heard, and what Talk says
 *   {"type":"audio", pcm, sampleRate}  many, as her voice streams
 *   {"type":"done"}                    or {"type":"error", ...}
 *
 * so the page can show the words and start playing her voice before the
 * whole reply has been synthesised.
 */

/** Voice chunks arrive every ~10ms; batching to ~0.2s keeps the event count sane. */
const MIN_AUDIO_BYTES = 9600;

export function speakingResponse(
  signal: AbortSignal,
  label: string,
  produce: () => Promise<TurnResult>,
): Response {
  const encoder = new TextEncoder();

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
        if (process.env.NODE_ENV === "development") console.info(`[${label}] ${what} +${Date.now() - t0}ms`);
      };

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
        if (!signal.aborted) {
          console.error(`[${label}]`, e);
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
