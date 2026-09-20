"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "@/components/motion/primitives";
import { useAuth } from "@/components/AuthProvider";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { EmptyState, Spinner } from "@/components/ui/Feedback";
import { IconJournal } from "@/components/ui/icons";
import { deleteJournalEntry, watchJournalEntries } from "@/lib/wellbeing";
import type { JournalEntry } from "@/lib/models";

/** First line of prose, for the card preview. */
function excerpt(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchJournalEntries(user.uid, setEntries);
  }, [user]);

  async function confirmDelete() {
    if (!user || !pendingDelete) return;
    setDeleting(true);
    try {
      await deleteJournalEntry(user.uid, pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const list = entries ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Journal
          </p>
          <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
            Private by design.
          </h1>
          <p className="mt-3 text-[14px] text-[var(--muted)] max-w-[520px] leading-relaxed">
            Only you can read these. Not counsellors, not administrators — the
            access rules make it impossible rather than merely disallowed.
          </p>
        </div>
      </div>

      <div>
        <Button href="/journal/new">Write an entry</Button>
      </div>

      {entries === null ? (
        <div className="flex items-center gap-3 text-[var(--muted)] py-8">
          <Spinner />
          <span className="text-[13px]">Loading your journal…</span>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<IconJournal />}
          title="Nothing written yet"
          description="Writing things down externalises them — it moves a thought from something you are inside of to something you can look at. There are prompts if you do not know where to start."
          action={<Button href="/journal/new">Write your first entry</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((entry, i) => (
            <motion.li
              key={entry.id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...SPRING_SOFT, delay: Math.min(i, 8) * 0.04 }}
              whileHover={{ y: -3 }}
              className="relative rounded-[28px] bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)] p-6 flex flex-col"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>

              <h2 className="mt-3 text-[18px] leading-snug tracking-tight font-medium">
                <Link
                  href={`/journal/${entry.id}`}
                  className="hover:text-[var(--accent)] transition-colors"
                >
                  <span className="absolute inset-0" aria-hidden />
                  {entry.title || "Untitled entry"}
                </Link>
              </h2>

              {entry.body ? (
                <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)] flex-1">
                  {excerpt(entry.body)}
                </p>
              ) : null}

              <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[12px] text-[var(--muted)]">
                  {entry.body.trim() ? `${entry.body.trim().split(/\s+/).length} words` : "Empty"}
                </span>
                {/* Sits above the stretched link so it stays clickable. */}
                <button
                  type="button"
                  onClick={() => setPendingDelete(entry)}
                  aria-label={`Delete ${entry.title || "untitled entry"}`}
                  className="relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--danger)] hover:bg-black/5 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this entry?"
        description="This cannot be undone. The entry is removed permanently."
        footer={
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="danger"
              withArrow={false}
              onClick={confirmDelete}
              loading={deleting}
              disabled={deleting}
            >
              Delete permanently
            </Button>
            <Button variant="ghost" withArrow={false} onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[var(--muted)] leading-relaxed">
          {pendingDelete?.title || "Untitled entry"}
        </p>
      </Modal>
    </div>
  );
}
