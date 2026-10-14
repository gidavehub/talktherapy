/**
 * Provider applications: from a provider sending theirs in, to staff deciding
 * it, to a live listing people can book.
 *
 * The applicant fills their application in from the browser (firestore.rules
 * lets them write the step sections of their own draft, and nothing else).
 * Everything that changes what the application MEANS happens here:
 *
 *   submitProviderApplication   draft or changes requested → submitted
 *   reviewProviderApplication   staff: start review, ask for changes, approve,
 *                               reject, suspend, reinstate
 *
 * Approval is the one moment a person becomes findable by someone in
 * distress, so it writes everything that decides that together: the public
 * listing, the verified flag on their account, and the application's own
 * record of who approved it and when.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { db } from "./payments";
import {
  AUDIT_LOGS,
  BUCKET,
  CALLABLE,
  FieldValue,
  NOTIFICATIONS,
  USERS,
  auditEntry,
  notification,
  requireStaff,
  signedIn,
} from "./staff";
import {
  STATUS_LABELS,
  incompleteSteps,
  isEditable,
  qualificationLine,
  slotTimesFrom,
  SLOT_MINUTES,
  STEPS,
  toApplication,
  type ApplicationStatus,
  type HistoryEvent,
  type ProviderApplication,
} from "../../app/lib/providerApplication";
import { areaOf } from "../../app/lib/matching";

const APPLICATIONS = "providerApplications";
const PROFILES = "providerProfiles";
const PAYOUT_ACCOUNTS = "payoutAccounts";
const AVAILABILITY = "availability";
const SLOTS = "slots";

/** How far ahead an approved provider's usual week is turned into bookable times. */
const SEED_DAYS = 14;

/** Where a provider's public photo lives — the path the directory already reads. */
const publicPhotoPath = (uid: string) => `avatars/${uid}/provider.jpg`;

function stepLabel(id: string): string {
  return STEPS.find((s) => s.id === id)?.label ?? id;
}

// ------------------------------------------------------------------ submit

export const submitProviderApplication = onCall(CALLABLE, async (request) => {
  const uid = signedIn(request);

  const user = (await db().collection(USERS).doc(uid).get()).data();
  if (!user || user.role !== "provider") {
    throw new HttpsError("permission-denied", "Only a provider account can send an application.");
  }

  const ref = db().collection(APPLICATIONS).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Start your application first.");
  const first = toApplication(uid, snap.data() ?? {});
  if (!isEditable(first.status)) {
    throw new HttpsError("failed-precondition", "This application has already been sent.");
  }

  // The same checks the screens run, with the same code. A browser that
  // skipped them gets the same answer here.
  const now = Date.now();
  const missing = incompleteSteps(first, now);
  if (missing.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `Some steps still need something: ${missing.map(stepLabel).join(", ")}.`,
      { steps: missing },
    );
  }

  // Every file the application points at must really be there. An upload
  // that failed half-way leaves its line in the draft and nothing in Storage,
  // and a reviewer opening a missing passport learns nothing from it.
  const bucket = getStorage().bucket(BUCKET);
  const files = [
    { name: "your photo", path: first.photo.path as string },
    ...first.documents.map((d) => ({ name: d.name || "a document", path: d.path })),
  ];
  const present = await Promise.all(files.map((f) => bucket.file(f.path).exists().then(([e]) => e)));
  const lost = files.filter((_, i) => !present[i]);
  if (lost.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `This did not finish uploading — please add it again: ${lost.map((f) => f.name).join(", ")}.`,
    );
  }

  if (!(await db().collection(PAYOUT_ACCOUNTS).doc(uid).get()).exists) {
    throw new HttpsError("failed-precondition", "Save the wallet your earnings go to, on the Payouts step.");
  }

  const resubmitted = first.status === "changes_requested";
  await db().runTransaction(async (tx) => {
    // Read again inside the transaction: two taps on Send, or staff acting
    // on it at the same moment, must not both win.
    const current = toApplication(uid, (await tx.get(ref)).data() ?? {});
    if (!isEditable(current.status)) {
      throw new HttpsError("failed-precondition", "This application has already been sent.");
    }
    if (incompleteSteps(current, now).length > 0) {
      throw new HttpsError("failed-precondition", "Your application changed while it was being sent. Check it and send it again.");
    }
    const event: HistoryEvent = { at: now, type: resubmitted ? "resubmitted" : "submitted" };
    tx.update(ref, {
      status: "submitted" satisfies ApplicationStatus,
      submittedAt: now,
      updatedAt: now,
      history: FieldValue.arrayUnion(event),
    });
    tx.set(
      db().collection(NOTIFICATIONS).doc(),
      notification(
        "staff",
        resubmitted ? "Application sent back with changes" : "New provider application",
        `${current.personal.displayName || "A provider"} has ${resubmitted ? "made the changes asked for" : "applied to join"}.`,
        `/admin/providers/${uid}`,
      ),
    );
    tx.set(
      db().collection(NOTIFICATIONS).doc(),
      notification(
        uid,
        "Application received",
        "A member of our team will review it, usually within three working days. We will tell you here as soon as anything changes.",
        "/apply/status",
      ),
    );
    tx.set(
      db().collection(AUDIT_LOGS).doc(),
      auditEntry(uid, resubmitted ? "provider_application.resubmit" : "provider_application.submit", `${APPLICATIONS}/${uid}`),
    );
  });

  return { status: "submitted" as ApplicationStatus };
});

// ------------------------------------------------------------------ review

const ACTIONS = ["start_review", "request_changes", "approve", "reject", "suspend", "reinstate"] as const;
type Action = (typeof ACTIONS)[number];

/** Which states each decision can be made from. */
const FROM: Record<Action, ApplicationStatus[]> = {
  start_review: ["submitted"],
  request_changes: ["submitted", "in_review"],
  approve: ["submitted", "in_review"],
  reject: ["submitted", "in_review", "changes_requested"],
  suspend: ["approved"],
  reinstate: ["suspended"],
};

const TO: Record<Action, ApplicationStatus> = {
  start_review: "in_review",
  request_changes: "changes_requested",
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  reinstate: "approved",
};

const EVENT: Record<Action, HistoryEvent["type"]> = {
  start_review: "review_started",
  request_changes: "changes_requested",
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  reinstate: "reinstated",
};

/** Decisions that must say why — the applicant reads it. */
const NEEDS_MESSAGE: Action[] = ["request_changes", "reject", "suspend"];

/** What the applicant is told, by decision. */
function applicantNotice(action: Action, message: string): { title: string; body: string } {
  switch (action) {
    case "start_review":
      return { title: "Your application is being reviewed", body: "A member of our team has started checking it." };
    case "request_changes":
      return { title: "A few changes, please", body: message };
    case "approve":
      return {
        title: "You are approved",
        body: "Welcome to TALK. Your profile is live, and the hours you gave us are open for booking.",
      };
    case "reject":
      return { title: "About your application", body: message };
    case "suspend":
      return { title: "Your profile has been paused", body: message };
    case "reinstate":
      return { title: "Your profile is live again", body: "People can find and book you again." };
  }
}

/** The public listing, from an approved application. Public fields only. */
function listingFrom(app: ProviderApplication, existing: FirebaseFirestore.DocumentData | undefined, now: number) {
  const town = app.personal.town.trim();
  // A town matching knows is stored lower-case, which is how areaOf finds it.
  const location = areaOf(town) ? town.toLowerCase() : null;
  return {
    uid: app.uid,
    displayName: app.personal.displayName.trim(),
    headline: app.practice.headline.trim(),
    bio: app.practice.bio.trim(),
    approach: app.practice.approach.trim(),
    firstSession: app.practice.firstSession.trim(),
    services: app.professional.services,
    languages: app.professional.languages,
    specializations: app.professional.specializations,
    ageGroups: app.professional.ageGroups,
    qualifications: app.qualifications.map(qualificationLine),
    yearsExperience: app.professional.yearsExperience ?? 0,
    sessionRateMinor: app.fee.sessionRateMinor ?? 0,
    gender: app.personal.gender === "woman" || app.personal.gender === "man" ? app.personal.gender : null,
    formats: app.professional.formats,
    location,
    photoPath: publicPhotoPath(app.uid),
    status: "verified",
    timezone: "Africa/Banjul",
    sample: false,
    ratingAvg: typeof existing?.ratingAvg === "number" ? existing.ratingAvg : 0,
    ratingCount: typeof existing?.ratingCount === "number" ? existing.ratingCount : 0,
    createdAt: typeof existing?.createdAt === "number" ? existing.createdAt : now,
    updatedAt: now,
  };
}

/**
 * Turn the applicant's usual week into real, bookable times for the next two
 * weeks. Times already there are left alone — one may already be booked, and
 * re-offering it would mark it open underneath the person who booked it.
 */
async function seedSlots(app: ProviderApplication, now: number): Promise<number> {
  const times = slotTimesFrom(app.availability.ranges, now, SEED_DAYS, now + 60 * 60_000);
  if (times.length === 0) return 0;
  const col = db().collection(AVAILABILITY).doc(app.uid).collection(SLOTS);
  const existing = new Set((await col.select().get()).docs.map((d) => d.id));
  const fresh = times.filter((t) => !existing.has(String(t)));
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = db().batch();
    for (const startsAt of fresh.slice(i, i + 400)) {
      batch.set(col.doc(String(startsAt)), {
        providerId: app.uid,
        startsAt,
        endsAt: startsAt + SLOT_MINUTES * 60_000,
        status: "open",
        bookingId: null,
      });
    }
    await batch.commit();
  }
  return fresh.length;
}

export const reviewProviderApplication = onCall(CALLABLE, async (request) => {
  const staffUid = await requireStaff(request);
  const uid = String(request.data?.uid ?? "").trim();
  const action = String(request.data?.action ?? "") as Action;
  const message = String(request.data?.message ?? "").trim().slice(0, 1500);

  if (!uid) throw new HttpsError("invalid-argument", "Which application?");
  if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown decision.");
  if (NEEDS_MESSAGE.includes(action) && message.length < 10) {
    throw new HttpsError("invalid-argument", "Say what the applicant needs to know — a sentence at least.");
  }
  if (uid === staffUid && (action === "approve" || action === "reinstate")) {
    throw new HttpsError("permission-denied", "Nobody approves their own application.");
  }

  const ref = db().collection(APPLICATIONS).doc(uid);
  const before = await ref.get();
  if (!before.exists) throw new HttpsError("not-found", "No application for that account.");
  const app = toApplication(uid, before.data() ?? {});
  if (!FROM[action].includes(app.status)) {
    throw new HttpsError(
      "failed-precondition",
      `This application is ${STATUS_LABELS[app.status].toLowerCase()}, so that decision cannot be made now.`,
    );
  }

  const now = Date.now();
  const bucket = getStorage().bucket(BUCKET);

  // Approval needs the photo where the directory reads it BEFORE the listing
  // that points at it is written, or the first person to see the new profile
  // sees a broken image.
  if (action === "approve") {
    if (incompleteSteps(app, now).length > 0) {
      throw new HttpsError("failed-precondition", "This application is incomplete. Ask for changes instead.");
    }
    if (!app.photo.path) throw new HttpsError("failed-precondition", "There is no photo to publish.");
    await bucket.file(app.photo.path).copy(bucket.file(publicPhotoPath(uid)));
  }

  await db().runTransaction(async (tx) => {
    const current = toApplication(uid, (await tx.get(ref)).data() ?? {});
    if (current.status !== app.status) {
      throw new HttpsError("aborted", "Somebody else has just changed this application. Reload it.");
    }
    const profileRef = db().collection(PROFILES).doc(uid);
    const profile = (await tx.get(profileRef)).data();
    const userRef = db().collection(USERS).doc(uid);

    const event: HistoryEvent = {
      at: now,
      type: EVENT[action],
      by: staffUid,
      ...(NEEDS_MESSAGE.includes(action) ? { message } : {}),
    };
    tx.update(ref, {
      status: TO[action],
      updatedAt: now,
      history: FieldValue.arrayUnion(event),
      ...(action === "start_review" ? { reviewerId: staffUid } : {}),
      ...(action === "start_review" ? {} : { decidedAt: now, decidedBy: staffUid }),
      // The message the applicant sees on their status page. Cleared when the
      // decision does not carry one, so an old request for changes is not
      // still shown under "approved".
      message: NEEDS_MESSAGE.includes(action) ? message : null,
    });

    if (action === "approve") {
      tx.set(profileRef, listingFrom(current, profile, now));
      tx.update(userRef, { verified: true, updatedAt: now });
    } else if (action === "reinstate") {
      if (profile) tx.update(profileRef, { status: "verified", updatedAt: now });
      tx.update(userRef, { verified: true, updatedAt: now });
    } else if (action === "suspend" || action === "reject") {
      // Out of the directory and back to the application screens, together.
      if (profile) tx.update(profileRef, { status: action === "suspend" ? "suspended" : "rejected", updatedAt: now });
      tx.update(userRef, { verified: false, updatedAt: now });
    }

    const notice = applicantNotice(action, message);
    tx.set(
      db().collection(NOTIFICATIONS).doc(),
      notification(uid, notice.title, notice.body, action === "approve" || action === "reinstate" ? "/chats" : "/apply/status"),
    );
    tx.set(
      db().collection(AUDIT_LOGS).doc(),
      auditEntry(staffUid, `provider_application.${action}`, `${APPLICATIONS}/${uid}`, {
        from: app.status,
        to: TO[action],
        ...(message ? { message } : {}),
      }),
    );
  });

  // Bookable times come after the listing is live. A failure here leaves an
  // approved provider with an empty calendar, which they can fill themselves
  // on Hours — so it is reported, not allowed to undo the approval.
  let slots = 0;
  if (action === "approve") {
    try {
      slots = await seedSlots(app, now);
    } catch (error) {
      console.error(`reviewProviderApplication: could not open hours for ${uid}`, error);
    }
  }

  return { status: TO[action], slots };
});
