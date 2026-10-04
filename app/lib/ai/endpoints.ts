/**
 * Where Talk's conversation lives.
 *
 * Cloud Functions, not this app. They hold the identity that may spend Vertex
 * budget, and a web host holds the public Firebase config and nothing more —
 * so the browser calls them across an origin, with a Firebase ID token.
 *
 * They are onRequest rather than callable because they STREAM: the words
 * arrive, then her voice, in newline-delimited JSON, so playback starts before
 * the sentence has finished being synthesised. A callable would wait for the
 * whole thing and hand it over in one piece.
 *
 * The base is an env var so a fork, a second project or a local emulator can
 * point somewhere else without touching code. The default is this project's
 * own deployment, which is what every real user will hit.
 */

const BASE = (
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  "https://us-east4-talk-therapy-509209.cloudfunctions.net"
).replace(/\/+$/, "");

export const COMPANION = {
  turn: `${BASE}/companionTurn`,
  greet: `${BASE}/companionGreet`,
  speak: `${BASE}/companionSpeak`,
  present: `${BASE}/companionPresent`,
  summarize: `${BASE}/companionSummarize`,
} as const;
