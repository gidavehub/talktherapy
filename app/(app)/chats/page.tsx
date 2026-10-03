import type { Metadata } from "next";
import ChatList from "@/components/chat/ChatList";

/**
 * Every conversation this person has.
 *
 * Inside the `(app)` group, so AppGate has already established that someone is
 * signed in and onboarded, and AppShell is already around it. This page only
 * needs its own heading — the same pattern the dashboard uses.
 */
export const metadata: Metadata = {
  title: "Messages",
};

export default function ChatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Messages
        </p>
        <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
          Your conversations
        </h1>
        <p className="mt-3 text-[14px] text-[var(--muted)] leading-relaxed max-w-[520px]">
          Write, or send a voice note. Tap the speaker on any message to hear it
          read aloud in your language.
        </p>
      </div>

      <ChatList />
    </div>
  );
}
