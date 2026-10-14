/**
 * The hand-off: a short summary of what somebody told TALK, for the provider
 * they choose — so they do not have to start from the beginning again.
 *
 * TALK's spoken consent says exactly this ("the provider you choose will see a
 * short summary of it"), and this is the code that keeps that promise, and no
 * more than it:
 *
 *  - Only to a provider they CHOSE: written when they open a conversation
 *    with that provider or book a session with them, for that provider alone.
 *  - Only if they said yes to the consent (spoken, or the written one).
 *  - Only the summary: what they would like to be called, their language, age
 *    range (and the under-18 flag, which a provider must see first), what
 *    brought them in one sentence, the concerns and the kind of help they
 *    asked for. Never mood, journals, the conversation's words, or anything
 *    else about them.
 *  - Theirs to take back: stopping sharing empties it and keeps it empty —
 *    opening the chat again does not quietly share it again — until they
 *    choose to share it again themselves.
 *
 * handoffs/{pairId}, where pairId is the pair's chat id (the two uids sorted
 * and joined with "__"). Written only here, with the Admin SDK; read by the
 * two people it is about (firestore.rules).
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./payments";
import { CALLABLE, USERS, signedIn } from "./staff";
import { cleanIntake } from "../../app/lib/matching";
import { LANGUAGES } from "../../app/lib/ai/protocol";

export const HANDOFFS = "handoffs";
const PROFILES = "providerProfiles";

export function pairId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export type ShareOutcome =
  | { shared: true }
  | { shared: false; reason: "no-intake" | "no-consent" | "stopped" | "not-a-provider" | "not-a-patient" };

/** The summary, from a user document. Null when there is nothing to hand over. */
function summaryOf(user: FirebaseFirestore.DocumentData | undefined) {
  const intake = user?.intake ? cleanIntake(user.intake, LANGUAGES) : null;
  if (!intake) return null;
  const said =
    intake.concernSummary ||
    intake.concerns.length > 0 ||
    intake.servicesWanted.length > 0 ||
    intake.ageRange ||
    intake.preferredName;
  if (!said) return null;
  return {
    preferredName: intake.preferredName,
    language: intake.language,
    ageRange: intake.ageRange,
    minor: intake.minor === true,
    concernSummary: intake.concernSummary,
    concerns: intake.concerns,
    servicesWanted: intake.servicesWanted,
    intakeCompletedAt: intake.completedAt,
  };
}

/** Whether they agreed to the summary being shared: the spoken consent, or the written one. */
function consented(user: FirebaseFirestore.DocumentData | undefined): boolean {
  const c = user?.consents ?? {};
  return typeof c.spokenConsentAt === "number" || c.dataProcessing === true || typeof c.acceptedTermsAt === "number";
}

/**
 * Share (or refresh) the summary with one provider.
 *
 * `resume` is the person's own "share it again" from their privacy settings;
 * without it, a summary they stopped sharing stays stopped.
 */
export async function shareIntakeWith(
  patientId: string,
  providerId: string,
  via: "chat" | "booking" | "settings",
  resume = false,
): Promise<ShareOutcome> {
  if (!patientId || !providerId || patientId === providerId) return { shared: false, reason: "not-a-provider" };

  const [userSnap, profileSnap, existingSnap] = await Promise.all([
    db().collection(USERS).doc(patientId).get(),
    db().collection(PROFILES).doc(providerId).get(),
    db().collection(HANDOFFS).doc(pairId(patientId, providerId)).get(),
  ]);

  const user = userSnap.data();
  if (!user || user.role !== "patient") return { shared: false, reason: "not-a-patient" };
  const profile = profileSnap.data();
  // A live, real provider. A sample profile has nobody behind it to read it.
  if (!profile || profile.status !== "verified" || profile.sample === true) {
    return { shared: false, reason: "not-a-provider" };
  }
  const existing = existingSnap.data();
  if (existing?.revokedAt && !resume) return { shared: false, reason: "stopped" };
  if (!consented(user)) return { shared: false, reason: "no-consent" };
  const summary = summaryOf(user);
  if (!summary) return { shared: false, reason: "no-intake" };

  const now = Date.now();
  await existingSnap.ref.set({
    patientId,
    providerId,
    participants: [patientId, providerId].sort(),
    ...summary,
    via,
    sharedAt: typeof existing?.sharedAt === "number" && !existing?.revokedAt ? existing.sharedAt : now,
    updatedAt: now,
    revokedAt: null,
  });
  return { shared: true };
}

/** Stop sharing with one provider: the summary is emptied and stays empty. */
export async function stopSharingWith(patientId: string, providerId: string): Promise<void> {
  const ref = db().collection(HANDOFFS).doc(pairId(patientId, providerId));
  const before = (await ref.get()).data();
  const now = Date.now();
  await ref.set({
    patientId,
    providerId,
    participants: [patientId, providerId].sort(),
    preferredName: null,
    language: null,
    ageRange: null,
    // The safeguarding flag is the one thing a provider keeps: the chat
    // itself carries it, set when the conversation was opened, and it must
    // never be switched off by somebody choosing to share less.
    minor: before?.minor === true,
    concernSummary: null,
    concerns: [],
    servicesWanted: [],
    intakeCompletedAt: null,
    via: "settings",
    sharedAt: null,
    updatedAt: now,
    revokedAt: now,
  });
}

/**
 * The person, from the browser: share with a provider they have just chosen
 * (`action: "share"`, called when they open a conversation), take it back
 * (`"stop"`), or share again after stopping (`"resume"`).
 */
export const intakeHandoff = onCall(CALLABLE, async (request) => {
  const uid = signedIn(request);
  const providerId = String(request.data?.providerId ?? "").trim();
  const action = String(request.data?.action ?? "share");
  if (!providerId) throw new HttpsError("invalid-argument", "Which provider?");
  if (action === "stop") {
    await stopSharingWith(uid, providerId);
    return { shared: false, reason: "stopped" };
  }
  if (action === "share" || action === "resume") {
    return shareIntakeWith(uid, providerId, action === "resume" ? "settings" : "chat", action === "resume");
  }
  throw new HttpsError("invalid-argument", "Share, stop or resume.");
});
