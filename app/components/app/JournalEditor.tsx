"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import Button from "../ui/Button";
import { Input, Textarea } from "../ui/Input";
import { Alert, Pill, Spinner } from "../ui/Feedback";
import { useAuth } from "../AuthProvider";
import {
  JOURNAL_PROMPTS,
  createJournalEntry,
  getJournalEntry,
  updateJournalEntry,
} from "../../lib/wellbeing";

/**
 * Journal editor, shared by the new-entry and edit routes.
 *
 * Autosaves an existing entry on a debounce rather than requiring a Save
 * press. People write in this while upset and close the tab without thinking;
 * losing what they wrote because they did not press a button would be a
 * genuinely bad experience for the thing this app is for.
 *
 * A *new* entry is not autosaved — it is created on first explicit save, so
 * opening the editor and changing your mind leaves nothing behind.
 */

const AUTOSAVE_MS = 1200;

export default function JournalEditor({ entryId }: { entryId?: string }) {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(entryId));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the autosave effect from firing on the initial load of an existing
  // entry, which would otherwise write the document straight back unchanged.
  const dirty = useRef(false);

  useEffect(() => {
    if (!user || !entryId) return;
    let cancelled = false;

    getJournalEntry(user.uid, entryId)
      .then((entry) => {
        if (cancelled) return;
        if (!entry) {
          setNotFound(true);
        } else {
          setTitle(entry.title);
          setBody(entry.body);
          setPromptId(entry.promptId ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, entryId]);

  useEffect(() => {
    if (!user || !entryId || !dirty.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaving(true);
      updateJournalEntry(user.uid, entryId, { title, body })
        .then(() => setSavedAt(Date.now()))
        .catch(() => setError("Could not save. Your text is still here — try again."))
        .finally(() => setSaving(false));
    }, AUTOSAVE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title, body, user, entryId]);

  function edit(fn: () => void) {
    dirty.current = true;
    setError(null);
    fn();
  }

  async function saveNew() {
    if (!user) return;
    if (!title.trim() && !body.trim()) {
      setError("Write something first — even a sentence.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await createJournalEntry(user.uid, {
        title: title.trim() || "Untitled entry",
        body,
        promptId,
      });
      router.replace(`/journal/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that entry.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-[var(--muted)] py-16">
        <Spinner />
        <span className="text-[13px]">Loading entry…</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <Alert tone="warning" title="Entry not found">
        This entry may have been deleted.{" "}
        <button
          type="button"
          onClick={() => router.push("/journal")}
          className="underline underline-offset-4"
        >
          Back to your journal
        </button>
      </Alert>
    );
  }

  const activePrompt = JOURNAL_PROMPTS.find((p) => p.id === promptId);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className="max-w-[720px]"
    >
      {!entryId ? (
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
            Need a starting point?
          </p>
          <div className="flex flex-wrap gap-2">
            {JOURNAL_PROMPTS.map((prompt) => (
              <Pill
                key={prompt.id}
                active={promptId === prompt.id}
                onClick={() =>
                  edit(() => setPromptId(promptId === prompt.id ? null : prompt.id))
                }
              >
                {prompt.text.length > 42
                  ? `${prompt.text.slice(0, 40)}…`
                  : prompt.text}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}

      {activePrompt ? (
        <p className="mb-6 text-[15px] md:text-[17px] leading-relaxed text-[var(--foreground)] border-l-2 border-[var(--accent)] pl-4">
          {activePrompt.text}
        </p>
      ) : null}

      <Input
        label="Title"
        hideLabel
        value={title}
        onChange={(e) => edit(() => setTitle(e.target.value))}
        placeholder="Give it a title, or don't"
        maxLength={140}
        className="mb-4"
      />

      <Textarea
        label="Entry"
        hideLabel
        rows={16}
        value={body}
        onChange={(e) => edit(() => setBody(e.target.value))}
        placeholder="Write whatever is here. Nobody else can read this."
        maxLength={20000}
      />

      {error ? (
        <Alert tone="warning" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        {entryId ? (
          <>
            <Button href="/journal" variant="secondary" withArrow={false}>
              Done
            </Button>
            <span className="text-[12px] text-[var(--muted)]" aria-live="polite">
              {saving
                ? "Saving…"
                : savedAt
                  ? `Saved ${new Date(savedAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Changes save automatically"}
            </span>
          </>
        ) : (
          <>
            <Button onClick={saveNew} loading={saving} disabled={saving} withArrow={false}>
              Save entry
            </Button>
            <Button href="/journal" variant="ghost" withArrow={false}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
