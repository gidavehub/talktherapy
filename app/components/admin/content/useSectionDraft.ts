"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import {
  discardDraft,
  publishSection,
  revertSection,
  saveDraft,
  watchDraft,
  watchPublished,
  type ContentResult,
  type DraftState,
  type PublishedState,
} from "@/lib/content/client";
import { defaultContent, type ContentOf, type ContentVersion, type SectionId } from "@/lib/content/schema";
import { shapeSection, validateSection, type Issue } from "@/lib/content/validate";
import { sameContent } from "./changes";

/**
 * One section in the editor: what is live, the draft, and the copy on screen.
 *
 * The copy on screen is saved as the draft a moment after each change (no
 * save button to forget), and kept from the draft or, with none, from what
 * is live. Publishing, discarding and putting an old version back all start
 * by cancelling a save that has not gone yet, so nothing stale lands after.
 *
 * Another member of staff may be editing the same section. Their saves are
 * taken in while this screen has nothing of its own waiting to save; when it
 * does, the last to save wins — and the screen says somebody else is here.
 */

/** How long after the last change the draft is saved. */
const AUTOSAVE_MS = 800;
/** After a failed save, when to try again. */
const RETRY_MS = 5000;

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export type PublishOutcome = ContentResult<{ rev: number; publishedAt: number; refreshed: boolean }>;

export function useSectionDraft<S extends SectionId>(id: S) {
  const [live, setLive] = useState<PublishedState<S> | null | undefined>(undefined);
  const [draft, setDraft] = useState<DraftState<S> | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [local, setLocal] = useState<ContentOf<S> | null>(null);
  const [baseRev, setBaseRev] = useState(0);
  const [save, setSave] = useState<{ state: SaveState; at: number | null }>({ state: "idle", at: null });
  /** Goes up whenever the saved draft or the live content changes: the preview reloads on it. */
  const [previewVersion, setPreviewVersion] = useState(0);
  /** Somebody else saved this draft while it was open here. */
  const [othersEdit, setOthersEdit] = useState<{ by: string; at: number } | null>(null);

  // What the handlers and timers need, as of now rather than as of the last render.
  const latest = useRef<ContentOf<S> | null>(null);
  const pending = useRef<ContentOf<S> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef<PublishedState<S> | null>(null);
  const hasDraft = useRef(false);
  const baseRevRef = useRef(0);
  const dirty = useRef(false);
  /** The save on its way to Firestore, if any. */
  const inflight = useRef<Promise<unknown> | null>(null);

  const adopt = useCallback((data: ContentOf<S>, rev: number) => {
    latest.current = data;
    baseRevRef.current = rev;
    setLocal(data);
    setBaseRev(rev);
  }, []);

  useEffect(() => {
    // Both halves before the screen starts, so it never starts from what is
    // live and then jumps to a draft a moment later.
    let liveNow: PublishedState<S> | null | undefined;
    let draftNow: DraftState<S> | null | undefined;
    let started = false;
    const start = () => {
      if (started || liveNow === undefined || draftNow === undefined) return;
      started = true;
      adopt(draftNow?.data ?? liveNow?.data ?? defaultContent(id), draftNow?.baseRev ?? liveNow?.rev ?? 0);
    };

    const stopLive = watchPublished(
      id,
      (published) => {
        liveNow = published;
        liveRef.current = published;
        setLive(published);
        if (started) {
          // Somebody published while this was only being looked at: show what is live now.
          if (!dirty.current && !hasDraft.current) adopt(published?.data ?? defaultContent(id), published?.rev ?? 0);
          setPreviewVersion((v) => v + 1);
        }
        start();
      },
      () => setLoadError("What is live could not be loaded. Your staff access may need a moment — reload the page."),
    );
    const stopDraft = watchDraft(
      id,
      (saved) => {
        const before = draftNow;
        draftNow = saved;
        hasDraft.current = saved !== null;
        setDraft(saved);
        const me = firebaseAuth().currentUser?.uid;
        if (started && saved && saved.updatedBy !== me) {
          setOthersEdit({ by: saved.updatedBy, at: saved.updatedAt });
          if (!dirty.current) {
            adopt(saved.data, saved.baseRev);
            setPreviewVersion((v) => v + 1);
          }
        } else if (started && !saved && before && before.updatedBy !== me && !dirty.current) {
          // Their draft was thrown away (or published) elsewhere: back to what is live.
          adopt(liveNow?.data ?? defaultContent(id), liveNow?.rev ?? 0);
          setOthersEdit(null);
          setPreviewVersion((v) => v + 1);
        }
        start();
      },
      () => setLoadError("The draft could not be loaded. Your staff access may need a moment — reload the page."),
    );
    const waiting = timer;
    const unsaved = pending;
    const base = baseRevRef;
    return () => {
      stopLive();
      stopDraft();
      if (waiting.current) clearTimeout(waiting.current);
      // Leaving with a change not yet saved (the browser's Back button, say):
      // it is sent on its way regardless.
      if (unsaved.current) void saveDraft(id, unsaved.current, base.current).catch(() => undefined);
    };
  }, [id, adopt]);

  /** Save what is waiting now. False if it did not go through (it is tried again shortly). */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const data = pending.current;
    if (!data) return true;
    pending.current = null;
    setSave((s) => ({ ...s, state: "saving" }));
    try {
      // Back to exactly what is live: there is no draft to keep.
      const write = sameContent(data, liveRef.current?.data ?? defaultContent(id))
        ? hasDraft.current
          ? discardDraft(id)
          : Promise.resolve()
        : saveDraft(id, data, baseRevRef.current);
      const settled = write.catch(() => undefined);
      inflight.current = settled;
      void settled.then(() => {
        if (inflight.current === settled) inflight.current = null;
      });
      await write;
      if (!pending.current) {
        // Clean only if what went is what is on screen: newer words whose
        // save a publish called off are still unsaved, should that publish fail.
        if (latest.current === data) dirty.current = false;
        setSave({ state: "saved", at: Date.now() });
      }
      setPreviewVersion((v) => v + 1);
      return true;
    } catch {
      // Kept for the next try (below), unless newer words have arrived since.
      pending.current = pending.current ?? data;
      setSave((s) => ({ ...s, state: "error" }));
      return false;
    }
  }, [id]);

  // A save that failed is tried again, until it goes or something newer replaces it.
  useEffect(() => {
    if (save.state !== "error") return;
    const retry = setTimeout(() => void flush(), RETRY_MS);
    return () => clearTimeout(retry);
  }, [save.state, flush]);

  /** Change the copy on screen; it is saved as the draft a moment later. */
  const change = useCallback(
    (update: (prev: ContentOf<S>) => ContentOf<S>) => {
      const prev = latest.current;
      if (!prev) return;
      const next = update(prev);
      latest.current = next;
      pending.current = next;
      dirty.current = true;
      setLocal(next);
      setSave((s) => ({ ...s, state: "pending" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  /**
   * Stop a save that has not gone yet, and wait for one already on its way:
   * what follows replaces it. A save that landed after a publish would bring
   * back the draft the publish had just cleared.
   */
  const cancelSave = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    await inflight.current;
  }, []);

  /** Whatever happens, a change that did not go live must still be saved as the draft. */
  const keepUnsaved = useCallback(() => {
    if (!dirty.current || !latest.current) return;
    pending.current = latest.current;
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  /**
   * Publish the copy on screen. `anyway` publishes over somebody else's
   * publish since this draft began, which is otherwise refused ("aborted").
   */
  const publish = useCallback(
    async (note: string, anyway = false): Promise<PublishOutcome> => {
      const data = latest.current;
      if (!data) return { ok: false, error: "Still loading.", issues: [], code: null };
      const result = validateSection(id, data);
      if (!result.ok) {
        return { ok: false, error: "Some fields need fixing first.", issues: result.errors, code: "invalid-argument" };
      }
      await cancelSave();
      const expectedRev = anyway ? (liveRef.current?.rev ?? 0) : baseRevRef.current;
      const out = await publishSection(id, result.value, { note: note.trim() || undefined, expectedRev });
      if (out.ok) {
        dirty.current = false;
        adopt(result.value, out.rev);
        setSave({ state: "idle", at: null });
        setOthersEdit(null);
        setPreviewVersion((v) => v + 1);
      } else {
        keepUnsaved();
      }
      return out;
    },
    [id, adopt, cancelSave, keepUnsaved],
  );

  /** Throw the draft away and go back to what is live. */
  const discard = useCallback(async (): Promise<boolean> => {
    await cancelSave();
    try {
      await discardDraft(id);
    } catch {
      keepUnsaved();
      return false;
    }
    dirty.current = false;
    adopt(liveRef.current?.data ?? defaultContent(id), liveRef.current?.rev ?? 0);
    setSave({ state: "idle", at: null });
    setOthersEdit(null);
    setPreviewVersion((v) => v + 1);
    return true;
  }, [id, adopt, cancelSave, keepUnsaved]);

  /** Put back what the section showed before a change. Clears the draft, as a publish does. */
  const revert = useCallback(
    async (version: ContentVersion): Promise<ContentResult<{ rev: number; refreshed: boolean }>> => {
      await cancelSave();
      const out = await revertSection(id, version.id);
      if (out.ok) {
        dirty.current = false;
        adopt(shapeSection(id, version.data ?? undefined), out.rev);
        setSave({ state: "idle", at: null });
        setOthersEdit(null);
        setPreviewVersion((v) => v + 1);
      } else {
        keepUnsaved();
      }
      return out;
    },
    [id, adopt, cancelSave, keepUnsaved],
  );

  const validation = useMemo(() => (local ? validateSection(id, local) : null), [id, local]);
  const errors: Issue[] = validation?.errors ?? [];
  const warnings: Issue[] = validation?.warnings ?? [];

  const liveData = live?.data ?? null;
  /** The copy on screen differs from what is live: there is something to publish. */
  const changed = useMemo(
    () => (local ? !sameContent(local, liveData ?? defaultContent(id)) : false),
    [id, local, liveData],
  );

  return {
    ready: local !== null,
    loadError,
    live,
    draft,
    local,
    baseRev,
    save,
    unsaved: save.state === "pending" || save.state === "saving" || save.state === "error",
    changed,
    errors,
    warnings,
    previewVersion,
    othersEdit,
    change,
    flush,
    publish,
    discard,
    revert,
  };
}

export type SectionDraft<S extends SectionId> = ReturnType<typeof useSectionDraft<S>>;
