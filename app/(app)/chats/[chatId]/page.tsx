import type { Metadata } from "next";
import ChatThread from "@/components/chat/ChatThread";

export const metadata: Metadata = {
  title: "Conversation",
};

/**
 * One conversation.
 *
 * Next 16: `params` is a Promise and has to be awaited. `PageProps<'/route'>`
 * is a global helper generated from the route tree — no import — so renaming
 * the segment breaks the build here rather than at runtime. Note the path is
 * the URL, without the `(app)` group, since route groups do not appear in it.
 *
 * The chat id is handed to a client component because every read here is a
 * live Firestore listener through the Web SDK, which only runs in the browser.
 * Access is not enforced by this route: `chats/{chatId}` is readable only by
 * the uids in its `participants` array, so pasting somebody else's chat id
 * yields an empty thread rather than their conversation.
 */
export default async function ChatPage(props: PageProps<"/chats/[chatId]">) {
  const { chatId } = await props.params;

  return <ChatThread chatId={chatId} />;
}
