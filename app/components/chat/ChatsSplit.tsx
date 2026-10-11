"use client";

import { usePathname } from "next/navigation";
import ChatList from "./ChatList";

/**
 * Messages, laid out the way WhatsApp is — the layout everyone already knows.
 *
 * Phone: one pane at a time. The list, under the app's top bar; or one
 * conversation, filling the screen, with its own header as the top bar and
 * its composer as the bottom bar (AppShell draws neither of its bars there).
 *
 * Computer: both at once — every conversation on the left, the open one on
 * the right, beside the app's own rail. With none open, the right pane says
 * so (app/(app)/chats/page.tsx).
 */
export default function ChatsSplit({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const open = pathname.startsWith("/chats/") ? decodeURIComponent(pathname.slice("/chats/".length)) : null;

  return (
    <div className="md:flex md:h-dvh">
      <aside
        className={`${open ? "hidden md:flex" : "flex"} min-h-[calc(100dvh-4rem)] flex-col bg-[var(--surface)] pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:min-h-0 md:w-[340px] md:shrink-0 md:border-r md:border-[var(--border)] md:pb-0 lg:w-[380px]`}
      >
        <ChatList openId={open} />
      </aside>
      <section className={`${open ? "flex" : "hidden md:flex"} h-dvh min-w-0 flex-1 flex-col`}>{children}</section>
    </div>
  );
}
