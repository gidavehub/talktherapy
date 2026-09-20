"use client";

import JournalEditor from "@/components/app/JournalEditor";

// Static segment, so it wins over /journal/[entryId] — an entry can never be
// shadowed by this route because "new" is not a valid generated document id.
export default function NewJournalEntryPage() {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
        New entry
      </p>
      <h1 className="mt-2 mb-8 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
        What is here?
      </h1>
      <JournalEditor />
    </div>
  );
}
