import Link from "next/link";
import JournalEditor from "@/components/app/JournalEditor";

// Next 16: params is a Promise. PageProps is a generated global — no import.
export default async function JournalEntryPage(
  props: PageProps<"/journal/[entryId]">,
) {
  const { entryId } = await props.params;

  return (
    <div>
      <Link
        href="/journal"
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Journal
      </Link>
      <div className="mt-8">
        <JournalEditor entryId={entryId} />
      </div>
    </div>
  );
}
