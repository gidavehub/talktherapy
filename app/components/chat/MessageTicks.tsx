"use client";

import { IconCheck, IconCheckDouble, IconClock } from "../ui/icons";
import { isReadByAll } from "../../lib/chat";
import type { ChatMessage } from "../../lib/models";

/**
 * Sent / read state on your own messages.
 *
 * Three states, and only three, because three is all Firestore can honestly
 * tell us:
 *
 *  - clock        — the write is queued locally, the server has not seen it.
 *  - one tick     — stored on the server.
 *  - two ticks    — every other participant has opened the thread since.
 *
 * WhatsApp's middle state ("delivered to their device") has no equivalent
 * here. There is no per-device receipt in Firestore, and inventing one by
 * treating "stored" as "delivered" would tell someone their provider has their
 * message when all we know is that we have it. In a mental-health product that
 * is the wrong lie to tell, so the state does not exist.
 */
export default function MessageTicks({
  message,
  onDark,
}: {
  message: ChatMessage;
  onDark: boolean;
}) {
  const read = isReadByAll(message);

  const label = message.pending
    ? "Sending"
    : read
      ? "Read"
      : "Sent";

  return (
    <span
      // The tick is the only confirmation a sender gets, and it is a 12px
      // glyph. The label is what a screen reader announces instead.
      aria-label={label}
      role="img"
      className={
        read
          ? onDark
            ? "text-[var(--accent-soft)]"
            : "text-[var(--accent)]"
          : onDark
            ? "text-white/55"
            : "text-[var(--muted)]"
      }
    >
      {message.pending ? (
        <IconClock size={13} />
      ) : read ? (
        <IconCheckDouble size={14} />
      ) : (
        <IconCheck size={13} />
      )}
    </span>
  );
}
