"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import type { ContentResult } from "@/lib/content/client";
import {
  discardResourceDraft,
  publishResource,
  revertResource,
  saveResourceDraft,
  unpublishResource,
  watchResource,
  watchResourceDraft,
  type ResourceDraftState,
  type ResourceLive,
} from "@/lib/content/resources-client";
import {
  blankResource,
  seedById,
  seedContent,
  shapeResource,
  validateResource,
  type ResourceContent,
  type ResourceVersion,
} from "@/lib/content/resources";
import type { Issue } from "@/lib/content/validate";
import { sameContent } from "../changes";
import type { SaveState } from "../useSectionDraft";

/**
 * One article in the editor: what the site shows, the draft, and the copy
 * on screen — the resource centre's counterpart of ../useSectionDraft, and
 * built the same way.
 *
 * The copy on screen is saved as the draft a moment after each change, and
 * starts from the draft or, with none, from what is live — a starter
 * article's words from code count as live until it is taken down. Every
 * action that changes the site starts by calling off a save that has not gone
 * yet, so nothing stale lands after it.
 *
 * Unlike a page, an article can be off the site: a new one not yet
 * published, or one taken down. Its draft is then all there is of it, and
 * throwing the draft away deletes it (`discard` answers "deleted").
 */

const AUTOSAVE_MS = 800;
const RETRY_MS = 5000;

type Changed = ContentResult<{ rev: number; refreshed: boolean }>;

/** What the site shows for an article, as words — or null while it shows nothing. */
export function liveContent(id: string, live: ResourceLive | null): ResourceContent | null {
  if (live?.status === "published") return live.data;
  const seed = seedById(id);
  if (seed && (live === null || live.status === "original")) return seedContent(seed);
  return null;
}

/** Where the copy starts with no draft: what is live, a taken-down starter's words, or a blank page. */
function startingPoint(id: string, live: ResourceLive | null): ResourceContent {
  const seed = seedById(id);
  return liveContent(id, live) ?? (seed ? seedContent(seed) : blankResource());
}

export function useResourceDraft(id: string, takenBy: (slug: string) => string | null) {
  const [live, setLive] = useState<ResourceLive | null | undefined>(undefined);
  const [draft, setDraft] = useState<ResourceDraftState | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [local, setLocal] = useState<ResourceContent | null>(null);
  const [save, setSave] = useState<{ state: SaveState; at: number | null }>({ state: "idle", at: null });
  /** Goes up whenever the saved draft or the live article changes: the preview reloads on it. */
  const [previewVersion, setPreviewVersion] = useState(0);
  const [othersEdit, setOthersEdit] = useState<{ by: string; at: number } | null>(null);

  // What the handlers and timers need, as of now rather than as of the last render.
  const latest = useRef<ResourceContent | null>(null);
  const pending = useRef<ResourceContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef<ResourceLive | null>(null);
  const hasDraft = useRef(false);
  const baseRev = useRef(0);
  const dirty = useRef(false);
  const inflight = useRef<Promise<unknown> | null>(null);

  const adopt = useCallback((data: ResourceContent, rev: number) => {
    latest.current = data;
    baseRev.current = rev;
    setLocal(data);
  }, []);

  useEffect(() => {
    // Both halves before the screen starts, so it never starts from what is
    // live and then jumps to a draft a moment later.
    let liveNow: ResourceLive | null | undefined;
    let draftNow: ResourceDraftState | null | undefined;
    let started = false;
    const start = () => {
      if (started || liveNow === undefined || draftNow === undefined) return;
      started = true;
      adopt(draftNow?.data ?? startingPoint(id, liveNow), draftNow?.baseRev ?? liveNow?.rev ?? 0);
    };

    const stopLive = watchResource(
      id,
      (stored) => {
        liveNow = stored;
        liveRef.current = stored;
        setLive(stored);
        if (started) {
          // Somebody changed it while this was only being looked at: show what is live now.
          if (!dirty.current && !hasDraft.current) adopt(startingPoint(id, stored), stored?.rev ?? 0);
          setPreviewVersion((v) => v + 1);
        }
        start();
      },
      () => setLoadError("The article could not be loaded. Your staff access may need a moment — reload the page."),
    );
    const stopDraft = watchResourceDraft(
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
          adopt(startingPoint(id, liveNow ?? null), liveNow?.rev ?? 0);
          setOthersEdit(null);
          setPreviewVersion((v) => v + 1);
        }
        start();
      },
      () => setLoadError("The draft could not be loaded. Your staff access may need a moment — reload the page."),
    );
    const waiting = timer;
    const unsaved = pending;
    const base = baseRev;
    return () => {
      stopLive();
      stopDraft();
      if (waiting.current) clearTimeout(waiting.current);
      // Leaving with a change not yet saved: it is sent on its way regardless.
      if (unsaved.current) void saveResourceDraft(id, unsaved.current, base.current).catch(() => undefined);
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
      // Nothing to keep: exactly what is live, or — off the site — nothing written at all.
      const showing = liveContent(id, liveRef.current);
      const nothingToKeep = showing ? sameContent(data, showing) : sameContent(data, blankResource());
      const write = nothingToKeep
        ? hasDraft.current
          ? discardResourceDraft(id)
          : Promise.resolve()
        : saveResourceDraft(id, data, baseRev.current);
      const settled = write.catch(() => undefined);
      inflight.current = settled;
      void settled.then(() => {
        if (inflight.current === settled) inflight.current = null;
      });
      await write;
      if (!pending.current) {
        if (latest.current === data) dirty.current = false;
        setSave({ state: "saved", at: Date.now() });
      }
      setPreviewVersion((v) => v + 1);
      return true;
    } catch {
      pending.current = pending.current ?? data;
      setSave((s) => ({ ...s, state: "error" }));
      return false;
    }
  }, [id]);

  useEffect(() => {
    if (save.state !== "error") return;
    const retry = setTimeout(() => void flush(), RETRY_MS);
    return () => clearTimeout(retry);
  }, [save.state, flush]);

  /** Change the copy on screen; it is saved as the draft a moment later. */
  const change = useCallback(
    (update: (prev: ResourceContent) => ResourceContent) => {
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

  /** Stop a save that has not gone yet, and wait for one already on its way: what follows replaces it. */
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

  const validation = useMemo(() => (local ? validateResource(id, local, takenBy) : null), [id, local, takenBy]);

  /** Publish the copy on screen. `anyway` publishes over somebody else's change since this draft began. */
  const publish = useCallback(
    async (note: string, anyway = false): Promise<Changed> => {
      const data = latest.current;
      if (!data) return { ok: false, error: "Still loading.", issues: [], code: null };
      const result = validateResource(id, data, takenBy);
      if (!result.ok) {
        return { ok: false, error: "Some fields need fixing first.", issues: result.errors, code: "invalid-argument" };
      }
      await cancelSave();
      const expectedRev = anyway ? (liveRef.current?.rev ?? 0) : baseRev.current;
      const out = await publishResource(id, result.value, { note: note.trim() || undefined, expectedRev });
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
    [id, takenBy, adopt, cancelSave, keepUnsaved],
  );

  /**
   * Take the article off the site. Words not yet saved are saved first, so
   * the draft the function keeps is the newest.
   */
  const unpublish = useCallback(
    async (note: string): Promise<Changed> => {
      if (!(await flush())) {
        return { ok: false, error: "Your last changes could not be saved. Check your connection and try again.", issues: [], code: null };
      }
      const out = await unpublishResource(id, { note: note.trim() || undefined, expectedRev: liveRef.current?.rev ?? 0 });
      if (out.ok) {
        // The draft is now the draft of the newer rev; the function moved it on too.
        baseRev.current = out.rev;
        setPreviewVersion((v) => v + 1);
      }
      return out;
    },
    [id, flush],
  );

  /**
   * Throw the draft away. Back to what is live — or, for an article that is
   * not on the site, "deleted": a new one is gone, and a starter article
   * starts again from its words in code.
   */
  const discard = useCallback(async (): Promise<"discarded" | "deleted" | "failed"> => {
    await cancelSave();
    try {
      await discardResourceDraft(id);
    } catch {
      keepUnsaved();
      return "failed";
    }
    dirty.current = false;
    setSave({ state: "idle", at: null });
    setOthersEdit(null);
    setPreviewVersion((v) => v + 1);
    const showing = liveContent(id, liveRef.current);
    const seed = seedById(id);
    adopt(showing ?? (seed ? seedContent(seed) : blankResource()), liveRef.current?.rev ?? 0);
    return showing || seed ? "discarded" : "deleted";
  }, [id, adopt, cancelSave, keepUnsaved]);

  /** Put back what the article showed before a change. */
  const revert = useCallback(
    async (version: ResourceVersion): Promise<Changed> => {
      await cancelSave();
      const out = await revertResource(id, version.id);
      if (out.ok) {
        dirty.current = false;
        const seed = seedById(id);
        // Off the site, the draft stays (the function keeps it); on, the words put back.
        const back = version.live ? (version.data ? shapeResource(version.data) : seed ? seedContent(seed) : null) : null;
        if (back) adopt(back, out.rev);
        else baseRev.current = out.rev;
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

  const showing = useMemo(() => (live === undefined ? null : liveContent(id, live)), [id, live]);
  /** The copy on screen differs from what is live — or nothing is live, and there are words to publish. */
  const changed = useMemo(
    () => (local ? (showing ? !sameContent(local, showing) : !sameContent(local, blankResource())) : false),
    [local, showing],
  );
  const errors: Issue[] = validation?.errors ?? [];

  return {
    ready: local !== null && live !== undefined,
    loadError,
    live,
    /** What the site shows now, as words; null while it shows nothing. */
    showing,
    isLive: showing !== null,
    draft,
    local,
    save,
    unsaved: save.state === "pending" || save.state === "saving" || save.state === "error",
    changed,
    errors,
    previewVersion,
    othersEdit,
    change,
    flush,
    publish,
    unpublish,
    discard,
    revert,
  };
}

export type ResourceDraft = ReturnType<typeof useResourceDraft>;
