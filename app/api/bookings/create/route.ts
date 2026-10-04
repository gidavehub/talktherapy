import { allow, requireUser } from "@/lib/server/requireUser";
import { bookSlot } from "@/lib/server/bookings";
import { json } from "../../payments/respond";

/**
 * Take a time with a provider.
 *
 * The client sends who and which slot, and nothing else that matters: the
 * time comes from the slot and the fee from the provider's profile, both read
 * inside the transaction in app/lib/server/bookings.ts. A booking is never
 * created from the browser — see the note there, and the `create: if false`
 * on bookings in firestore.rules.
 *
 * A refused booking is a 409, not a 400: "somebody else just took that time"
 * is a race that the person can resolve by picking again, not a malformed
 * request.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in to book a session." });

  // Booking is cheap for us and consequential for a provider's calendar, so
  // this is loose enough for somebody genuinely choosing between times and
  // tight enough to stop a script filling a week.
  if (!allow(user.uid, "bookings-create", 12, 10 * 60_000)) {
    return json(429, { error: "Too many attempts. Give it a minute." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : "";
  const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
  const note = typeof body.note === "string" ? body.note : "";

  if (!providerId || !slotId) return json(400, { error: "Missing provider or time." });
  if (providerId === user.uid) {
    return json(400, { error: "You cannot book a session with yourself." });
  }

  try {
    const result = await bookSlot({ patientId: user.uid, providerId, slotId, note });
    if (!result.ok) return json(409, { error: result.reason });

    return json(200, {
      bookingId: result.bookingId,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    });
  } catch (error) {
    console.error("bookings/create failed", error);
    return json(503, { error: "Could not book that time. Please try again." });
  }
}
