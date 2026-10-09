"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { Input } from "../ui/Input";
import { IconCheck } from "../ui/icons";
import { useChatPeer } from "./useChatPeer";
import ProviderAvatar from "../providers/ProviderAvatar";
import { createGroupChat, nameOf, otherParticipant } from "../../lib/chat";
import type { Chat } from "../../lib/models";

/**
 * A provider starts a group session with several of the people they already
 * work with.
 *
 * Provider-led on purpose — the decided first shape. Only the people this
 * provider already has a conversation with can be added: a provider cannot
 * gather strangers, and a client is never added to a group by somebody they
 * have not spoken to. firestore.rules enforces the provider half of that; this
 * screen simply never offers anybody else.
 *
 * Everybody in a group sees everybody's messages and the name they gave Talk.
 * That is what a group IS, and the screen says so before it is created, so no
 * provider puts somebody in a room without realising what the others will see.
 */

function Person({
  chat,
  selfUid,
  picked,
  onToggle,
}: {
  chat: Chat;
  selfUid: string;
  picked: boolean;
  onToggle: (uid: string, name: string) => void;
}) {
  const uid = otherParticipant(chat, selfUid);
  const peer = useChatPeer(uid, nameOf(chat, uid) || "Someone you are working with");
  if (!uid) return null;

  return (
    <motion.button
      type="button"
      onClick={() => onToggle(uid, peer.name)}
      whileTap={{ scale: 0.98 }}
      transition={SPRING_SNAP}
      aria-pressed={picked}
      className={`flex w-full items-center gap-3 rounded-[22px] px-3.5 py-3 text-left transition-colors ${
        picked ? "bg-[var(--dark)] text-white" : "bg-[var(--background)] hover:bg-black/[.06]"
      }`}
    >
      <ProviderAvatar photoPath={peer.photoPath} name={peer.name} size={38} />
      <span className="min-w-0 flex-1 truncate text-[14px]">{peer.name}</span>
      <span
        className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center border transition-colors ${
          picked ? "border-white bg-white text-[var(--dark)]" : "border-[var(--border)]"
        }`}
      >
        {picked ? <IconCheck size={13} /> : null}
      </span>
    </motion.button>
  );
}

export default function GroupComposer({
  open,
  onClose,
  chats,
  selfUid,
  selfName,
}: {
  open: boolean;
  onClose: () => void;
  /** The provider's conversations; the two-person ones are who they can add. */
  chats: Chat[];
  selfUid: string;
  selfName: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => chats.filter((c) => c.participants.length === 2), [chats]);
  const count = Object.keys(picked).length;

  function toggle(uid: string, name: string) {
    setPicked((current) => {
      const next = { ...current };
      if (next[uid]) delete next[uid];
      else next[uid] = name;
      return next;
    });
  }

  async function create() {
    if (count < 2) return;
    setCreating(true);
    setError(null);
    try {
      const chatId = await createGroupChat(
        [selfUid, ...Object.keys(picked)],
        selfUid,
        { ...picked, ...(selfName ? { [selfUid]: selfName } : {}) },
        title,
      );
      onClose();
      router.push(`/chats/${chatId}`);
    } catch {
      setError("The group could not be created. Check your connection and try again.");
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a group session">
      <div className="space-y-5">
        <Input
          label="What is the group called?"
          hint="Everyone in it will see this — for example, Thursday grief group."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />

        <div>
          <p className="text-[13px] font-medium">Who is in it</p>
          <p className="mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
            The people you already have a conversation with. Pick at least two.
          </p>

          {people.length === 0 ? (
            <Alert tone="info" title="Nobody to add yet">
              A group is made from the people you already work with. Once
              clients have written to you, they appear here.
            </Alert>
          ) : (
            <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto">
              {people.map((chat) => {
                const uid = otherParticipant(chat, selfUid);
                return (
                  <Person
                    key={chat.id}
                    chat={chat}
                    selfUid={selfUid}
                    picked={Boolean(uid && picked[uid])}
                    onToggle={toggle}
                  />
                );
              })}
            </div>
          )}
        </div>

        {count >= 2 ? (
          <p className="text-[12px] text-[var(--muted)] leading-relaxed">
            Everyone in a group sees everyone&apos;s messages and the name they
            go by. Make sure each of them has agreed to be in a group before you
            add them.
          </p>
        ) : null}

        {error ? (
          <Alert tone="warning" title="Not created">
            {error}
          </Alert>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={() => void create()} disabled={count < 2 || creating}>
            {creating ? "Creating…" : count < 2 ? "Pick at least two people" : `Start with ${count} people`}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
