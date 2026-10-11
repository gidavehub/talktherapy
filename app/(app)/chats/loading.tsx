import { Skeleton } from "@/components/ui/Feedback";

/**
 * A conversation opening: its own shape — the top bar, a few bubbles either
 * side, the composer — in the pane where it will be, while the list beside
 * it stays put (this sits inside the Messages layout).
 */
export default function ConversationLoading() {
  return (
    <div role="status" aria-label="Opening the conversation" aria-busy="true" className="flex min-h-0 flex-1 flex-col bg-[var(--background)]">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <Skeleton rounded="rounded-full" className="h-10 w-10 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <div className="flex-1 space-y-2.5 px-3 py-4 md:px-[5%]">
        {[
          ["justify-start", "w-[58%]"],
          ["justify-end", "w-[44%]"],
          ["justify-start", "w-[66%]"],
          ["justify-end", "w-[38%]"],
        ].map(([side, width], i) => (
          <div key={i} className={`flex ${side}`}>
            <Skeleton rounded="rounded-[22px]" className={`h-11 ${width}`} />
          </div>
        ))}
      </div>
      <div className="h-16 shrink-0 border-t border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
