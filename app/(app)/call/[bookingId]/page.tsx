import type { Metadata } from "next";
import CallRoom from "@/components/call/CallRoom";

export const metadata: Metadata = {
  title: "Session",
};

/**
 * The video session for one booking.
 *
 * Next 16: `params` is a Promise. The booking id is also the signalling room
 * id, which is what lets firestore.rules check the room's participants
 * against the booking's — see the `calls` block there.
 *
 * Nothing is gated here. `bookings/{id}` is readable only by the two people
 * in it, so a pasted id shows "no such session" rather than somebody else's
 * appointment, and the call room itself refuses anyone the booking does not
 * name.
 */
export default async function CallPage(props: PageProps<"/call/[bookingId]">) {
  const { bookingId } = await props.params;

  return (
    <div className="max-w-[760px] space-y-5">
      <CallRoom bookingId={bookingId} />
    </div>
  );
}
