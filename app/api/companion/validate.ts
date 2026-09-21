import "server-only";
import {
  LANGUAGES,
  MAX_HISTORY_TURNS,
  MAX_SUMMARY_CHARS,
  MAX_TURN_CHARS,
  type HistoryTurn,
  type Language,
} from "@/lib/ai/protocol";

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

export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
