"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { useChatPeer } from "./useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import { groupTitle, leaveGroup, nameOf, removeFromGroup } from "../../lib/chat";
import type { Chat } from "../../lib/models";

/**
 * Who is in a group, and the two ways out of one.
 *
 * Anybody may leave, always — nobody is kept in a room. The provider who set
 * the group up can also take somebody out: in a peer group, which meets
 * without them, that is the one thing somebody has to be able to do if a
 * member is harming the others. firestore.rules holds both lines.
 */

function Member({
  chat,
  uid,
  selfUid,
  canRemove,
  onRemoved,
}: {
  chat: Chat;
  uid: string;
  selfUid: string;
  canRemove: boolean;
  onRemoved: (error: string | null) => void;
}) {
  const person = useChatPeer(uid, nameOf(chat, uid) ?? "Someone in the group");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await removeFromGroup(chat.id, uid);
      onRemoved(null);
    } catch {
      onRemoved(`${person.name} could not be taken out. Check your connection and try again.`);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-[18px] bg-[var(--background)] px-3 py-2.5">
      <ProviderAvatar photoPath={person.photoPath} name={person.name} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px]">{uid === selfUid ? "You" : person.name}</p>
        {chat.createdBy === uid ? (
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {chat.group === "peer" ? "Set the group up" : "Leads the group"}
          </p>
        ) : null}
      </div>
      {canRemove ? (
        confirming ? (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" withArrow={false} loading={busy} onClick={() => void remove()}>
              Take out
            </Button>
            <Button size="sm" variant="ghost" withArrow={false} disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Take ${person.name} out of the group`}
            className="rounded-full px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
          >
            Take out
          </button>
        )
      ) : null}
    </li>
  );
}

export default function GroupInfo({
  chat,
  selfUid,
  open,
  onClose,
}: {
  chat: Chat;
  selfUid: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUp = chat.createdBy === selfUid;
  // The one who set it up first, then you, then everybody else.
  const members = [...chat.participants].sort((a, b) => rank(a) - rank(b));
  function rank(uid: string) {
    return uid === chat.createdBy ? 0 : uid === selfUid ? 1 : 2;
  }

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      await leaveGroup(chat.id, selfUid);
      onClose();
      router.replace("/chats");
    } catch {
      setError("You could not leave just now. Check your connection and try again.");
      setLeaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={groupTitle(chat) ?? "Group"}>
      <div className="space-y-5">
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          {chat.group === "peer"
            ? "A peer group. Everybody here can talk and call without the provider who set it up, who stays in it and can read it."
            : "A group session, led by a provider. Its call opens when they start it."}{" "}
          Everybody in the group sees every message and the name each person goes by.
        </p>

        <ul className="space-y-1.5" aria-label="Who is in the group">
          {members.map((uid) => (
            <Member
              key={uid}
              chat={chat}
              uid={uid}
              selfUid={selfUid}
              canRemove={setUp && uid !== selfUid}
              onRemoved={setError}
            />
          ))}
        </ul>

        {error ? (
          <Alert tone="warning" title="Not done">
            {error}
          </Alert>
        ) : null}

        <div className="border-t border-[var(--border)] pt-4">
          {confirmLeave ? (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed">
                Leave {groupTitle(chat) ?? "this group"}? You keep what was said while you were in it, and
                see nothing new.{" "}
                {setUp ? "Nobody else can take people out once you have gone." : "You cannot rejoin by yourself."}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" withArrow={false} loading={leaving} onClick={() => void leave()}>
                  Leave the group
                </Button>
                <Button size="sm" variant="ghost" withArrow={false} disabled={leaving} onClick={() => setConfirmLeave(false)}>
                  Stay
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
            >
              Leave this group
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
