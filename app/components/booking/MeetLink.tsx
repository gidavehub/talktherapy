"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { isMeetUrl, setMeetLink } from "../../lib/booking";

/**
 * The Google Meet fallback on a session.
 *
 * The session itself happens inside Talk. This is for anyone who would rather
 * meet on Google Meet — the provider attaches a link, and both sides see it
 * beside the in-app join. Google cannot be embedded (it refuses to be framed,
 * and its API only makes links that open in a new tab), so this is honestly a
 * link out, labelled as one.
 *
 *   - the provider sees an "Add Google Meet link" control, or the link with
 *     a way to change or remove it;
 *   - the patient sees the link if there is one, and nothing if not.
 *
 * Only a meet.google.com address is accepted, here for a helpful message and
 * in firestore.rules where it counts.
 */
export default function MeetLink({
  bookingId,
  meetUrl,
  canEdit,
}: {
  bookingId: string;
  meetUrl: string | null;
  /** The provider on this session. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setError(null);
    if (next && !isMeetUrl(next)) {
      setError("That is not a Google Meet link. It should start with https://meet.google.com/");
      return;
    }
    setSaving(true);
    try {
      await setMeetLink(bookingId, next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the link.");
    } finally {
      setSaving(false);
    }
  }

  if (!meetUrl && !canEdit) return null;

  if (editing) {
    return (
      <div className="w-full space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
            aria-label="Google Meet link"
            autoFocus
            className="min-w-0 flex-1 rounded-full bg-[var(--background)] px-4 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
          <button
            type="button"
            onClick={() => void save(draft.trim() || null)}
            disabled={saving}
            className="rounded-full bg-[var(--dark)] px-4 py-2 text-[12.5px] text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(meetUrl ?? "");
              setError(null);
            }}
            className="rounded-full px-3 py-2 text-[12.5px] text-[var(--muted)] hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
        <AnimatePresence>
          {error ? (
            <motion.p
              initial={{ y: -4, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SNAP}
              className="text-[12px] text-[var(--danger)]"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  if (!meetUrl) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full px-4 py-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
      >
        Add Google Meet link
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={meetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--background)] px-4 py-2 text-[12.5px] hover:bg-black/[.06] transition-colors"
      >
        Open in Google Meet
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Change the Google Meet link"
          className="rounded-full px-2.5 py-2 text-[12px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5"
        >
          Change
        </button>
      ) : null}
    </span>
  );
}
