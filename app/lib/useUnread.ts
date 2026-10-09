"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { unreadFor, watchChats } from "./chat";

/**
 * How many messages are waiting, across every conversation.
 *
 * Read from the chat documents' denormalised `unread` map — the same field the
 * chat list badges already use — so this costs no message reads at all, only
 * the chat-list listener. Fifty is the same bound the list itself uses.
 *
 * This is the number that makes Messages feel like a messaging app rather
 * than a page you have to remember to check.
 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    return watchChats(uid, (chats) => {
      setCount(chats.reduce((sum, chat) => sum + unreadFor(chat, uid), 0));
    });
  }, [uid]);

  return uid ? count : 0;
}
