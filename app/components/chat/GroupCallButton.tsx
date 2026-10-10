"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconVideo } from "../ui/icons";
import { watchGroupCall } from "../../lib/groupCall";

/**
 * The call control in a group's header.
 *
 * When a call is on, everybody in the group sees it — in the accent colour,
 * with how many are in it — because the point of a group session is that
 * people walk into it. When none is on, only the person leading the group
 * sees a way to start one: the others cannot start it, and a control that
 * only explains why it does nothing is clutter.
 */
export default function GroupCallButton({ chatId, leading }: { chatId: string; leading: boolean }) {
  const [inCall, setInCall] = useState<string[]>([]);

  useEffect(() => watchGroupCall(chatId, setInCall), [chatId]);

  if (inCall.length > 0) {
    return (
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SNAP}>
        <Link
          href={`/call/group/${chatId}`}
          aria-label={`A call is on with ${inCall.length} ${inCall.length === 1 ? "person" : "people"} — join it`}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white shadow-[var(--shadow-accent)] hover:bg-[var(--accent-soft)] transition-colors"
        >
          <IconVideo size={15} />
          Join · {inCall.length}
        </Link>
      </motion.div>
    );
  }

  if (!leading) return null;

  return (
    <Link
      href={`/call/group/${chatId}`}
      aria-label="Start a call with the group"
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
    >
      <IconVideo size={14} />
      Call
    </Link>
  );
}
