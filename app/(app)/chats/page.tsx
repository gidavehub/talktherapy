import type { Metadata } from "next";
import { IconChat } from "@/components/ui/icons";

/**
 * Messages with no conversation open.
 *
 * The list itself is in the layout (ChatsSplit), beside this. On a phone this
 * pane is not shown at all — the list is the screen; on a computer it fills
 * the space where a conversation opens.
 */
export const metadata: Metadata = {
  title: "Messages",
};

export default function ChatsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[var(--background)] px-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--dark)] text-white">
        <IconChat />
      </span>
      <h1 className="font-display mt-5 text-[24px] font-medium">Your conversations</h1>
      <p className="mt-2 max-w-[380px] text-[14px] leading-relaxed text-[var(--muted)]">
        Pick a conversation to open it. Write, or send a voice note — and tap the speaker on any message to hear it
        read aloud in your language.
      </p>
    </div>
  );
}
