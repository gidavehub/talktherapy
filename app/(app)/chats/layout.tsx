import type { Viewport } from "next";
import ChatsSplit from "@/components/chat/ChatsSplit";

/**
 * Messages: the list and the open conversation, side by side on a computer,
 * one at a time on a phone (ChatsSplit).
 *
 * `resizes-content`: when the keyboard opens, Android shrinks the page to the
 * space above it, so the composer — pinned to the bottom of a full-height
 * screen — rises with the keyboard instead of disappearing behind it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <ChatsSplit>{children}</ChatsSplit>;
}
