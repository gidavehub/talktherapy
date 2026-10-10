"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { IconVideo } from "../ui/icons";
import { watchGroupCall } from "../../lib/groupCall";
import type { Chat } from "../../lib/models";

/**
 * The call control in a group's header.
 *
 * When a call is on and open to you, it shows in the accent colour with how
 * many are in it — the point of a group is that people walk into it. When a
 * call is on but not open to you yet (a led group whose leader is not in it)
 * it says so quietly instead of inviting a tap that leads to buttons that do
 * nothing. With no call on, only whoever may start one sees a way to: the
 * leader of a led group, anybody in a peer group.
 */
export default function GroupCallButton({ chat, selfUid }: { chat: Chat; selfUid: string }) {
  const [inCall, setInCall] = useState<string[]>([]);

  useEffect(() => watchGroupCall(chat.id, setInCall), [chat.id]);

  const peerGroup = chat.group === "peer";
  const leader = chat.createdBy;
  const leaderGone = !peerGroup && (!leader || !chat.participants.includes(leader));
  const canStart = peerGroup || (!leaderGone && leader === selfUid);
  const open = canStart || (!leaderGone && leader !== null && inCall.includes(leader));
  const count = inCall.length;

  if (count > 0 && open) {
    return (
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SNAP}>
        <Link
          href={`/call/group/${chat.id}`}
          aria-label={`A call is on with ${count} ${count === 1 ? "person" : "people"} — join it`}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white shadow-[var(--shadow-accent)] hover:bg-[var(--accent-soft)] transition-colors"
        >
          <IconVideo size={15} />
          Join · {count}
        </Link>
      </motion.div>
    );
  }

  if (count > 0) {
    return (
      <Link
        href={`/call/group/${chat.id}`}
        aria-label={`A call is on with ${count} ${count === 1 ? "person" : "people"}; it opens to you when the person leading the group is in it`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
      >
        <IconVideo size={14} />
        On · {count}
      </Link>
    );
  }

  if (!canStart) return null;

  return (
    <Link
      href={`/call/group/${chat.id}`}
      aria-label="Start a call with the group"
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
    >
      <IconVideo size={14} />
      Call
    </Link>
  );
}
