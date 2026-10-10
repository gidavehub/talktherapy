/**
 * Booking a session, and giving one back.
 *
 * Both happen HERE, on the server, in a Firestore transaction — never from the
 * client. Two reasons, and the first one alone settles it:
 *
 *  1. A slot and a booking have to change together. The client cannot write a
 *     provider's slots at all (firestore.rules lets only the provider do that,
 *     which is right), so a client-side booking would create the booking and
 *     leave the slot looking free. Two patients would then be told they have
 *     the same half-hour with the same person, and one of them finds out when
 *     nobody joins.
 *  2. The fee comes from the provider's own profile, read here. A client that
 *     could name the price would be a client that books a D3,000 session for
 *     a dalasi.
 *
 * Admin SDK, so these writes bypass firestore.rules entirely. That is why the
 * rules refuse client creates outright: there is exactly one way a booking can
 * come into existence, and it is this file.
 *
 * It lives in Cloud Functions rather than the web app because it writes with
 * admin rights. A web host holds the public Firebase config and nothing more.
 */

import { db } from "./payments";

/** Mirrors COLLECTIONS in the app's models.ts. */
const COLLECTIONS = {
  availability: "availability",
  slots: "slots",
  bookings: "bookings",
  providerProfiles: "providerProfiles",
  users: "users",
} as const;

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export type BookOutcome =
  | { ok: true; bookingId: string; startsAt: number; endsAt: number }
  | { ok: false; reason: string };

/** Plain enough to show a person who is trying to see somebody. */
const TAKEN = "Somebody else has just taken that time. Please pick another.";
const GONE = "That time is no longer being offered.";
const PAST = "That time has already passed.";
const GUARDIAN =
  "Because you are under 18, a parent or guardian needs to fill in a short form with you first.";

function slotRef(providerId: string, slotId: string) {
  return db()
    .collection(COLLECTIONS.availability)
    .doc(providerId)
    .collection(COLLECTIONS.slots)
    .doc(slotId);
}

/** Under 18 by the patient's own intake — the same test as isMinor. */
function minorFrom(user: FirebaseFirestore.DocumentData | undefined): boolean {
  const intake = user?.intake;
  return intake?.minor === true || intake?.ageRange === "under-18";
}

export async function bookSlot(input: {
  patientId: string;
  providerId: string;
  slotId: string;
  note: string;
}): Promise<BookOutcome> {
  const store = db();
  const slot = slotRef(input.providerId, input.slotId);
  const provider = store.collection(COLLECTIONS.providerProfiles).doc(input.providerId);
  const booking = store.collection(COLLECTIONS.bookings).doc();
  const patient = store.collection(COLLECTIONS.users).doc(input.patientId);

  return store.runTransaction(async (tx) => {
    const [slotSnap, providerSnap, patientSnap] = await Promise.all([
      tx.get(slot),
      tx.get(provider),
      tx.get(patient),
    ]);

    if (!slotSnap.exists) return { ok: false as const, reason: GONE };

    const data = slotSnap.data() ?? {};
    // Read inside the transaction, so another booking committing between the
    // read and the write makes this one retry and see `booked`.
    if (data.status !== "open") return { ok: false as const, reason: TAKEN };
    if (typeof data.startsAt !== "number" || data.startsAt < Date.now()) {
      return { ok: false as const, reason: PAST };
    }

    if (!providerSnap.exists || (providerSnap.data() ?? {}).status !== "verified") {
      // A provider taken out of the directory mid-booking. Refusing is kinder
      // than taking the booking and cancelling it afterwards.
      return { ok: false as const, reason: GONE };
    }

    // The same gate the page applies before it ever calls this — repeated here
    // so a stale tab cannot book around it. It gates the session, never help.
    const patientData = patientSnap.data();
    if (minorFrom(patientData) && patientData?.consents?.guardianConsent !== true) {
      return { ok: false as const, reason: GUARDIAN };
    }

    const fee = (providerSnap.data() ?? {}).sessionRateMinor;
    const now = Date.now();

    tx.set(booking, {
      patientId: input.patientId,
      providerId: input.providerId,
      // Denormalised so one index serves "my sessions" for both sides, and so
      // the security rule is a membership test with no extra reads.
      participants: [input.patientId, input.providerId],
      slotId: input.slotId,
      startsAt: data.startsAt,
      endsAt: typeof data.endsAt === "number" ? data.endsAt : data.startsAt + 30 * 60_000,
      status: "pending" satisfies BookingStatus,
      // Nothing here moves this. Only the payment webhook does.
      paymentStatus: "unpaid",
      amountMinor: typeof fee === "number" ? fee : 0,
      currency: "GMD",
      transactionId: null,
      patientNote: input.note.slice(0, 500),
      // The provider's trustworthy copy of the under-18 flag: read from the
      // patient's record here, never taken from the request.
      patientMinor: minorFrom(patientData),
      createdAt: now,
      updatedAt: now,
    });

    tx.update(slot, { status: "booked", bookingId: booking.id });

    return {
      ok: true as const,
      bookingId: booking.id,
      startsAt: data.startsAt as number,
      endsAt: (typeof data.endsAt === "number" ? data.endsAt : data.startsAt + 30 * 60_000) as number,
    };
  });
}

export type CancelOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Cancel, and put the time back on the provider's calendar.
 *
 * Either side may do it — a provider who falls ill has to be able to, and a
 * patient who cannot face it today must never have to ask permission.
 *
 * The slot is only reopened when it still points at THIS booking. If the
 * provider has since deleted or reused that time, leaving it alone is right:
 * handing a stranger's slot back to the pool would be worse than losing one.
 */
/**
 * "They did not come." A patient says a paid session did not happen.
 *
 * Within the hold after it ends — the window the hold exists for — and before
 * it has been paid out. It does not refund or punish anybody: it holds the
 * provider's fee for that session (earningState: "disputed") until a person
 * has looked. Saying it again changes nothing.
 */
export async function reportMissedSession(
  uid: string,
  bookingId: string,
  holdMs: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ref = db().collection(COLLECTIONS.bookings).doc(bookingId);
  return db().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data || data.patientId !== uid) return { ok: false as const, reason: "No such session." };
    if (data.disputed === true) return { ok: true as const };
    if (data.paymentStatus !== "paid") return { ok: false as const, reason: "That session was not paid for." };
    const endsAt = typeof data.endsAt === "number" ? data.endsAt : 0;
    if (endsAt > Date.now()) return { ok: false as const, reason: "That session has not finished yet." };
    if (data.payoutId || endsAt + holdMs <= Date.now()) {
      return { ok: false as const, reason: "It is too late to raise this here — please contact support." };
    }
    tx.update(ref, { disputed: true, disputedAt: Date.now(), updatedAt: Date.now() });
    return { ok: true as const };
  });
}

export async function cancelBooking(uid: string, bookingId: string): Promise<CancelOutcome> {
  const store = db();
  const booking = store.collection(COLLECTIONS.bookings).doc(bookingId);

  return store.runTransaction(async (tx) => {
    const snap = await tx.get(booking);
    if (!snap.exists) return { ok: false as const, reason: "No such session." };

    const data = snap.data() ?? {};
    const participants: string[] = Array.isArray(data.participants) ? data.participants : [];
    // Same answer for "not yours" and "does not exist", so this cannot be used
    // to discover whether two other people have a session.
    if (!participants.includes(uid)) return { ok: false as const, reason: "No such session." };

    if (data.status === "cancelled") return { ok: true as const };
    if (data.status === "completed") {
      return { ok: false as const, reason: "That session has already happened." };
    }
    // A paid session that has begun is the provider's work. Cancelling it
    // here would silently take their fee away — and once it has been paid
    // out, would leave money sent for a session the records say never was.
    // If it did not happen, the patient says so (reportMissedSession) and a
    // person decides.
    if (data.payoutId) {
      return { ok: false as const, reason: "That session has already been paid for and paid out." };
    }
    if (data.paymentStatus === "paid" && typeof data.startsAt === "number" && data.startsAt <= Date.now()) {
      return {
        ok: false as const,
        reason: "That session has already started. If it did not happen, you can tell us from your sessions.",
      };
    }

    // Every read first: Firestore refuses a transaction that reads after it
    // has written, so the slot has to be fetched before the booking is
    // touched even though only the booking's contents decided to fetch it.
    const slot =
      typeof data.providerId === "string" && typeof data.slotId === "string"
        ? slotRef(data.providerId, data.slotId)
        : null;
    const slotSnap = slot ? await tx.get(slot) : null;

    tx.update(booking, {
      status: "cancelled" satisfies BookingStatus,
      cancelledBy: uid,
      updatedAt: Date.now(),
    });

    if (slot && slotSnap?.exists && (slotSnap.data() ?? {}).bookingId === bookingId) {
      tx.update(slot, { status: "open", bookingId: null });
    }

    return { ok: true as const };
  });
}
