/**
 * Sessions with a human: the times a provider offers, and the bookings made
 * against them.
 *
 * Reads are live Firestore listeners, like everything else in the app. Writes
 * are split by who is allowed to make them:
 *
 *   - A provider writes their OWN slots straight from the browser. They own
 *     that calendar and firestore.rules says so.
 *   - A booking goes through `POST /api/bookings/*`, because taking a time has
 *     to flip the slot in the same breath, and a patient cannot write a
 *     provider's slots. See app/lib/server/bookings.ts.
 */

import {
  collection,
  deleteDoc,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { firebaseAuth, firebaseConfigured, firestore } from "./firebase";
import { COLLECTIONS, type AvailabilitySlot, type Booking } from "./models";

/** How long one session lasts. One length for now; providers vary later. */
export const SESSION_MINUTES = 45;

// -------------------------------------------------------------------- paths

function slotsRef(providerId: string) {
  return collection(firestore(), COLLECTIONS.availability, providerId, COLLECTIONS.slots);
}

// ------------------------------------------------------------- deserialisers

function toSlot(id: string, data: DocumentData): AvailabilitySlot {
  return {
    id,
    providerId: typeof data.providerId === "string" ? data.providerId : "",
    startsAt: typeof data.startsAt === "number" ? data.startsAt : 0,
    endsAt: typeof data.endsAt === "number" ? data.endsAt : 0,
    status: data.status === "booked" || data.status === "blocked" ? data.status : "open",
    bookingId: typeof data.bookingId === "string" ? data.bookingId : null,
  };
}

function toBooking(id: string, data: DocumentData): Booking {
  const startsAt = typeof data.startsAt === "number" ? data.startsAt : 0;
  return {
    id,
    patientId: typeof data.patientId === "string" ? data.patientId : "",
    providerId: typeof data.providerId === "string" ? data.providerId : "",
    participants: Array.isArray(data.participants)
      ? data.participants.filter((p): p is string => typeof p === "string")
      : [],
    slotId: typeof data.slotId === "string" ? data.slotId : "",
    startsAt,
    endsAt: typeof data.endsAt === "number" ? data.endsAt : startsAt,
    status: data.status ?? "pending",
    paymentStatus: data.paymentStatus ?? "unpaid",
    amountMinor: typeof data.amountMinor === "number" ? data.amountMinor : 0,
    currency: "GMD",
    transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
    patientNote: typeof data.patientNote === "string" ? data.patientNote : "",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
  };
}

// ------------------------------------------------------------------ watching

/**
 * Times a provider is still offering.
 *
 * Only `open` ones, and only ahead of now — a past slot nobody took is
 * clutter, and showing it invites a booking that the server would refuse.
 * The provider's own calendar uses `watchAllSlots` instead, because they need
 * to see what is booked.
 */
export function watchOpenSlots(
  providerId: string,
  cb: (slots: AvailabilitySlot[]) => void,
  max = 60,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(
      slotsRef(providerId),
      where("status", "==", "open"),
      where("startsAt", ">", Date.now()),
      orderBy("startsAt", "asc"),
      fsLimit(max),
    ),
    (snap) => cb(snap.docs.map((d) => toSlot(d.id, d.data()))),
    () => cb([]),
  );
}

/** A provider's own calendar, booked times included. */
export function watchAllSlots(
  providerId: string,
  cb: (slots: AvailabilitySlot[]) => void,
  max = 200,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(
      slotsRef(providerId),
      // Yesterday, not now: a provider glancing at today should still see the
      // morning they have just finished.
      where("startsAt", ">", Date.now() - 24 * 60 * 60_000),
      orderBy("startsAt", "asc"),
      fsLimit(max),
    ),
    (snap) => cb(snap.docs.map((d) => toSlot(d.id, d.data()))),
    () => cb([]),
  );
}

/**
 * Everyone's sessions, both sides of them.
 *
 * One query serves patient and provider because `participants` holds both
 * uids — the same denormalisation the chat list uses, and the reason the
 * security rule needs no document reads.
 *
 * Needs the (participants array-contains, startsAt asc) composite index.
 */
export function watchMyBookings(
  uid: string,
  cb: (bookings: Booking[]) => void,
  max = 50,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(
      collection(firestore(), COLLECTIONS.bookings),
      where("participants", "array-contains", uid),
      orderBy("startsAt", "asc"),
      fsLimit(max),
    ),
    (snap) => cb(snap.docs.map((d) => toBooking(d.id, d.data()))),
    () => cb([]),
  );
}

/**
 * One session, live.
 *
 * The call screen needs the participants and the time, and needs to notice if
 * the other side cancels while it is open. Rules refuse this to anyone who is
 * not in it, so a pasted booking id yields nothing rather than somebody
 * else's appointment.
 */
export function watchBooking(
  bookingId: string,
  cb: (booking: Booking | null) => void,
): () => void {
  if (!firebaseConfigured()) {
    cb(null);
    return () => {};
  }

  return onSnapshot(
    doc(firestore(), COLLECTIONS.bookings, bookingId),
    (snap) => cb(snap.exists() ? toBooking(snap.id, snap.data()) : null),
    () => cb(null),
  );
}

// ------------------------------------------------- a provider's own calendar

/**
 * Offer a time.
 *
 * The id is derived from the start, so adding the same time twice is the same
 * document rather than two slots a minute apart that both look bookable. It
 * also means a provider can safely re-run "every Tuesday" without thinking
 * about what they already offered.
 */
export async function addSlot(providerId: string, startsAt: number): Promise<void> {
  const id = String(startsAt);
  await setDoc(
    doc(slotsRef(providerId), id),
    {
      providerId,
      startsAt,
      endsAt: startsAt + SESSION_MINUTES * 60_000,
      status: "open",
      bookingId: null,
    },
    // Merge, so re-offering a time that is already booked does not quietly
    // mark it open again underneath the person who booked it.
    { merge: true },
  );
}

/**
 * Stop offering a time.
 *
 * Only ever used on an open slot — the UI does not offer it for a booked one,
 * because the way to undo a booking is to cancel it, which tells the other
 * person. Deleting the slot under them would just make the session vanish.
 */
export async function removeSlot(providerId: string, slotId: string): Promise<void> {
  await deleteDoc(doc(slotsRef(providerId), slotId));
}

// ------------------------------------------------------------------- booking

async function authHeader(): Promise<Record<string, string>> {
  const token = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: json.error ?? "Something went wrong." };
}

export function bookSlot(providerId: string, slotId: string, note: string) {
  return post("/api/bookings/create", { providerId, slotId, note });
}

export function cancelBooking(bookingId: string) {
  return post("/api/bookings/cancel", { bookingId });
}

/**
 * Start paying for a session.
 *
 * Returns the hosted checkout link to send the browser to. The price is NOT
 * sent — the server reads it from the booking, which got it from the
 * provider's profile when the booking was made.
 */
export async function startSessionPayment(
  bookingId: string,
): Promise<{ ok: true; paymentLink: string } | { ok: false; error: string }> {
  const res = await fetch("/api/payments/modem/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ purpose: "session_fee", bookingId }),
  });

  const json = (await res.json().catch(() => ({}))) as { paymentLink?: string; error?: string };
  if (!res.ok || !json.paymentLink) {
    return { ok: false, error: json.error ?? "Could not start the payment." };
  }
  return { ok: true, paymentLink: json.paymentLink };
}

// ------------------------------------------------------------------ labels

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "Tuesday 7 October" — the heading a day's slots sit under. */
export function dayLabel(timestamp: number): string {
  return DAY.format(new Date(timestamp));
}

/** "14:30" */
export function timeLabel(timestamp: number): string {
  return TIME.format(new Date(timestamp));
}

/**
 * The whole thing in one sentence, for reading aloud and for a screen reader.
 *
 * Written as somebody would say it rather than as a timestamp, because for a
 * person who cannot read the screen this IS the slot.
 */
export function spokenSlot(startsAt: number, endsAt: number): string {
  return `${dayLabel(startsAt)}, ${timeLabel(startsAt)} to ${timeLabel(endsAt)}`;
}

/** Group slots under their day, in order, for rendering. */
export function byDay(slots: AvailabilitySlot[]): Array<{ day: string; slots: AvailabilitySlot[] }> {
  const days: Array<{ day: string; slots: AvailabilitySlot[] }> = [];
  for (const slot of slots) {
    const day = dayLabel(slot.startsAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.slots.push(slot);
    else days.push({ day, slots: [slot] });
  }
  return days;
}
