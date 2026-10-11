"use client";

import JournalEditor from "@/components/app/JournalEditor";

// Static segment, so it wins over /journal/[entryId] — an entry can never be
// shadowed by this route because "new" is not a valid generated document id.
export default function NewJournalEntryPage() {
  return (
    <div>
      <p className="eyebrow">
        New entry
      </p>
      <h1 className="mt-2 mb-8 font-display text-[30px] md:text-[40px] leading-[1.08] font-medium">
        What is here?
      </h1>
      <JournalEditor />
    </div>
  );
}
