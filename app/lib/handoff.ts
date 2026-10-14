/**
 * The hand-off from the browser's side: the short summary of what somebody
 * told TALK, which the provider they choose can read
 * (functions/src/handoff.ts decides when it may be shared and writes it).
 *
 *  - The provider reads it in the conversation, under "What they told TALK".
 *  - The person sees who they have shared it with in their privacy settings,
 *    and can stop sharing, or share again.
 */

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, firebaseFunctions, firestore } from "./firebase";
import type { AgeRange, Service, Specialization } from "./matching";
import type { Language } from "./ai/protocol";

const HANDOFFS = "handoffs";

export type Handoff = {
  id: string;
  patientId: string;
  providerId: string;
  preferredName: string | null;
  language: Language | null;
  ageRange: AgeRange | null;
  minor: boolean;
  concernSummary: string | null;
  concerns: Specialization[];
  servicesWanted: Service[];
  sharedAt: number | null;
  updatedAt: number;
  /** Set when the person stopped sharing. The summary is empty then. */
  revokedAt: number | null;
};

function toHandoff(id: string, data: Record<string, unknown>): Handoff {
  const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id,
    patientId: String(data.patientId ?? ""),
    providerId: String(data.providerId ?? ""),
    preferredName: text(data.preferredName),
    language: text(data.language) as Language | null,
    ageRange: text(data.ageRange) as AgeRange | null,
    minor: data.minor === true,
    concernSummary: text(data.concernSummary),
    concerns: list<Specialization>(data.concerns),
    servicesWanted: list<Service>(data.servicesWanted),
    sharedAt: num(data.sharedAt),
    updatedAt: num(data.updatedAt) ?? 0,
    revokedAt: num(data.revokedAt),
  };
}

/** The summary for one conversation (its id is the pair's), live. Null when none was shared. */
export function watchHandoff(pairId: string, onChange: (handoff: Handoff | null) => void): () => void {
  if (!firebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(firestore(), HANDOFFS, pairId),
    (snap) => onChange(snap.exists() ? toHandoff(snap.id, snap.data()) : null),
    // Refused means there is nothing this person may see: none was shared.
    () => onChange(null),
  );
}

/** Everything this person has shared, with whom. */
export function watchMyHandoffs(patientId: string, onChange: (handoffs: Handoff[]) => void): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), HANDOFFS), where("patientId", "==", patientId)),
    (snap) => onChange(snap.docs.map((d) => toHandoff(d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt)),
    () => onChange([]),
  );
}

type Action = "share" | "stop" | "resume";

/** Whether the call went through, and whether a summary is now shared. */
async function call(providerId: string, action: Action): Promise<{ ok: boolean; shared: boolean }> {
  try {
    const result = await httpsCallable<{ providerId: string; action: Action }, { shared: boolean }>(
      firebaseFunctions(),
      "intakeHandoff",
    )({ providerId, action });
    return { ok: true, shared: result.data.shared === true };
  } catch {
    return { ok: false, shared: false };
  }
}

/**
 * The person has just chosen this provider (opened a conversation). Best
 * effort and silent: the function shares only what it may, and a failure
 * here must never stand between somebody and their provider.
 */
export function shareWithProvider(providerId: string): void {
  void call(providerId, "share");
}

/** Take it back from one provider. True when it is no longer shared. */
export async function stopSharing(providerId: string): Promise<boolean> {
  return (await call(providerId, "stop")).ok;
}

/** Share it again after stopping. True when it is shared. */
export async function shareAgain(providerId: string): Promise<boolean> {
  return (await call(providerId, "resume")).shared;
}
