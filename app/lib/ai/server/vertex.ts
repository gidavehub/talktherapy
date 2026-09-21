import "server-only";
import { GoogleAuth } from "google-auth-library";

/**
 * Minimal Vertex AI client for Talk.
 *
 * REST rather than an SDK: the calls are two endpoints and one auth header,
 * and the SDKs lag behind preview models (the TTS model name is not in any of
 * them yet).
 *
 * Auth is the `talk-ai` service account, which holds roles/aiplatform.user and
 * NOTHING else — a leaked AI key cannot read a single journal entry. That
 * split is verified by scripts/verify-service-accounts.mjs.
 *
 * NO FALLBACK MODELS. A model is named once, in env, and if it fails the call
 * fails. Retrying the same model on 429 is not a fallback: 429 on the global
 * endpoint is capacity contention on the shared pool, and it clears in about a
 * second (measured by scripts/probe-pipeline.mjs).
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — see .env.example`);
  return v;
}

export const models = {
  /** gemini-3.8-flash: hears, transcribes, translates and replies. */
  get text() {
    return required("GEMINI_TEXT_MODEL");
  },
  /** gemini-3.1-flash-tts-preview: Talk's voice. */
  get tts() {
    return required("GEMINI_TTS_MODEL");
  },
};

let authClient: ReturnType<GoogleAuth["getClient"]> | null = null;

function client() {
  if (!authClient) {
    // A key file locally; inline JSON where the host has no filesystem for
    // secrets (Vercel, App Hosting). Never both, never neither.
    const json = process.env.TALK_AI_CREDENTIALS_JSON;
    const auth = new GoogleAuth({
      ...(json ? { credentials: JSON.parse(json) } : { keyFile: required("TALK_AI_CREDENTIALS") }),
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    authClient = auth.getClient();
    // A failed load must not be cached forever.
    authClient.catch(() => (authClient = null));
  }
  return authClient;
}

async function token(): Promise<string> {
  const t = (await (await client()).getAccessToken()).token;
  if (!t) throw new Error("Could not obtain a Vertex access token");
  return t;
}

function endpoint(model: string, method: string) {
  const project = required("GOOGLE_CLOUD_PROJECT");
  const location = process.env.VERTEX_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1beta1/projects/${project}/locations/${location}/publishers/google/models/${model}:${method}`;
}

export type Part = { text?: string; inlineData?: { mimeType: string; data: string }; thought?: boolean };
export type Content = { role: "user" | "model"; parts: Part[] };

export type GenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Part[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { totalTokenCount?: number; thoughtsTokenCount?: number };
};

export class VertexError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 503]);
const MAX_ATTEMPTS = 4;

async function send(model: string, method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(endpoint(model, method), {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) return res;
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      await res.body?.cancel();
      if (process.env.NODE_ENV === "development") {
        console.info(`[vertex] ${model} ${res.status} — retry ${attempt + 1}`);
      }
      const wait = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, wait));
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      continue;
    }
    const text = await res.text();
    throw new VertexError(`${model} ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 400)}`, res.status);
  }
}

export async function generate(model: string, body: unknown, signal?: AbortSignal): Promise<GenerateResponse> {
  const res = await send(model, "generateContent", body, signal);
  return (await res.json()) as GenerateResponse;
}

/**
 * Server-sent events from streamGenerateContent, one parsed chunk at a time.
 * Vertex separates events with CRLF pairs, so line endings are normalised
 * before splitting — splitting on "\n\n" alone silently yields nothing.
 */
export async function* streamGenerate(
  model: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<GenerateResponse> {
  const res = await send(model, "streamGenerateContent?alt=sse", body, signal);
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of event.split("\n")) {
          if (line.startsWith("data: ")) yield JSON.parse(line.slice(6)) as GenerateResponse;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Concatenated text of the first candidate, excluding thought parts. */
export function textOf(res: GenerateResponse): string {
  return (res.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
}
