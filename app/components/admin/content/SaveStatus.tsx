"use client";

import { Spinner } from "@/components/ui/Feedback";
import { useNow } from "@/lib/useNow";
import { ago } from "./format";
import type { SaveState } from "./useSectionDraft";

/**
 * Where the draft stands, in a few words: being saved, saved, or not saved
 * (and being tried again). Announced politely, so a screen reader hears
 * "Saved" without being interrupted mid-word.
 */
export default function SaveStatus({
  state,
  savedAt,
  draft,
  changed,
  announce = true,
  className = "",
}: {
  state: SaveState;
  /** When this screen last saved. */
  savedAt: number | null;
  /** The stored draft, whoever saved it. */
  draft: { updatedAt: number; by: string } | null;
  /** The words on screen differ from what is live. */
  changed: boolean;
  /** Off for a second copy on the same screen, so it is not announced twice. */
  announce?: boolean;
  className?: string;
}) {
  const now = useNow(30_000);

  let tone = "text-[var(--muted)]";
  let content: React.ReactNode;
  if (state === "pending") {
    content = "Changes not saved yet";
  } else if (state === "saving") {
    content = (
      <>
        <Spinner size={12} />
        Saving…
      </>
    );
  } else if (state === "error") {
    tone = "text-[var(--danger)] font-medium";
    content = "Not saved — check your connection. Trying again…";
  } else if (state === "saved" && savedAt) {
    tone = "text-[var(--success)]";
    content = changed ? `Draft saved ${ago(savedAt, now)}` : "Same as what is live";
  } else if (draft && changed) {
    content = `Draft saved ${ago(draft.updatedAt, now)} by ${draft.by}`;
  } else {
    content = changed ? "Not published yet" : "No changes from what is live";
  }

  return (
    <span
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      className={`inline-flex items-center gap-1.5 text-[12.5px] leading-snug ${tone} ${className}`}
    >
      {content}
    </span>
  );
}
