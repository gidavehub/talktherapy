import { allow, requireUser } from "@/lib/server/requireUser";
import { cancelBooking } from "@/lib/server/bookings";
import { json } from "../../payments/respond";

/**
 * Give a session back.
 *
 * Server-side for the same reason booking is: the time has to go back onto
 * the provider's calendar, and a patient cannot write a provider's slots.
 *
 * Either side may cancel, and neither has to explain. Somebody who cannot
 * face a session today should not have to ask permission to say so, and a
 * provider who is ill must not be stuck with an appointment they cannot keep.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in first." });

  if (!allow(user.uid, "bookings-cancel", 20, 10 * 60_000)) {
    return json(429, { error: "Too many attempts. Give it a minute." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!bookingId) return json(400, { error: "Missing booking." });

  try {
    const result = await cancelBooking(user.uid, bookingId);
    // 404 for "not yours" as well as "not there", so this cannot be used to
    // find out whether two other people have a session together.
    if (!result.ok) return json(result.reason === "No such session." ? 404 : 409, { error: result.reason });
    return json(200, { cancelled: true });
  } catch (error) {
    console.error("bookings/cancel failed", error);
    return json(503, { error: "Could not cancel that session. Please try again." });
  }
}
