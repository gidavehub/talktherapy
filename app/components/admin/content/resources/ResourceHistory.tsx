"use client";

import { useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Timeline, { type TimelineItem } from "@/components/ui/Timeline";
import { Alert, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import type { ContentResult } from "@/lib/content/client";
import { seedById, seedContent, type ResourceContent, type ResourceVersion } from "@/lib/content/resources";
import { summarise } from "../changes";
import { nameFor, useStaffNames } from "../useStaffNames";
import { resourceChanges } from "./changes";

/**
 * Every change to an article, newest first: who made it, when, why, and
 * what it touched. Each can be undone by putting back what the article
 * showed before it — words, a starter article's own words, or nothing at
 * all — which is itself a change, recorded here like any other.
 */

const TITLES: Record<ResourceVersion["action"], string> = {
  publish: "Published",
  unpublish: "Taken off the site",
  revert: "An earlier version put back",
};

export default function ResourceHistory({
  open,
  onClose,
  id,
  versions,
  error,
  showing,
  hasDraft,
  onRevert,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  /** Newest first. Null while they load. */
  versions: ResourceVersion[] | null;
  error: string | null;
  /** What the site shows now, or null while it shows nothing. */
  showing: ResourceContent | null;
  hasDraft: boolean;
  onRevert: (version: ResourceVersion) => Promise<ContentResult<{ rev: number; refreshed: boolean }>>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [restoring, setRestoring] = useState<ResourceVersion | null>(null);
  const names = useStaffNames((versions ?? []).map((v) => v.replacedBy));
  const seed = seedById(id);

  const items: TimelineItem[] = useMemo(() => {
    if (!versions) return [];
    // What a version stood for: its words, the starter's own, or nothing.
    const wordsOf = (v: ResourceVersion) => (v.live ? (v.data ?? (seed ? seedContent(seed) : null)) : null);
    return versions.map((version, i) => {
      const after = i === 0 ? showing : wordsOf(versions[i - 1]);
      const changes = resourceChanges(wordsOf(version), after);
      // Taking it off the site again is only possible while it is on.
      const canRestore = version.live || showing !== null;
      return {
        id: version.id,
        at: version.replacedAt,
        title: TITLES[version.action],
        tone: version.action === "unpublish" ? "neutral" : version.action === "revert" ? "warning" : "accent",
        actor: nameFor(version.replacedBy, names, user?.uid),
        body: (
          <div className="space-y-2.5">
            {version.note ? (
              <p className="rounded-xl bg-[var(--sand)] px-3 py-2 text-[13px] italic text-[var(--foreground)]">
                “{version.note}”
              </p>
            ) : null}
            <p>
              <span className="font-medium text-[var(--foreground)]">Changed: </span>
              {summarise(changes, 4)}
            </p>
            {canRestore ? (
              <Button size="sm" variant="ghost" onClick={() => setRestoring(version)}>
                {!version.live
                  ? "Take it off the site, as before"
                  : version.data === null
                    ? "Put back the original words"
                    : "Put back how it was before"}
              </Button>
            ) : null}
          </div>
        ),
      };
    });
  }, [versions, showing, seed, names, user?.uid]);

  const restoringOff = restoring !== null && !restoring.live;

  return (
    <>
      <Drawer open={open} onClose={onClose} eyebrow="Article" title="History" width="560px">
        <div className="space-y-6">
          <p className="rounded-[20px] bg-[var(--surface-2)] px-4 py-3 text-[13px] leading-relaxed">
            <span className="font-medium">Live now: </span>
            {showing ? `“${showing.title}”, at /resources/${showing.slug}.` : "nothing — this article is not on the site."}
          </p>

          {error ? (
            <Alert tone="warning" title="History not loaded">
              {error}
            </Alert>
          ) : versions === null ? (
            <SkeletonList count={3} label="Loading the history" className="space-y-5">
              <Skeleton className="h-20 w-full" />
            </SkeletonList>
          ) : (
            <Timeline items={items} emptyText="No changes yet. Each publish will be listed here, and can be undone." />
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={restoring !== null}
        title={
          restoringOff
            ? "Take it off the site again?"
            : restoring?.data === null
              ? "Put back the original words?"
              : "Put back how it was before?"
        }
        body={
          <div className="space-y-2">
            <p>
              {restoringOff
                ? "The article comes off the site, as it was before this change. Its words stay here as a draft."
                : `The article goes back to what it showed before this change${
                    restoring?.data === null ? ": the words it shipped with" : ""
                  }. It goes live straight away.`}
            </p>
            {hasDraft && !restoringOff ? (
              <p className="font-medium text-[var(--foreground)]">The draft you are working on is thrown away.</p>
            ) : null}
            <p>This is recorded in the history too, so it can be undone the same way.</p>
          </div>
        }
        confirmLabel={restoringOff ? "Take it off" : "Put it back"}
        danger={restoringOff}
        onClose={() => setRestoring(null)}
        onConfirm={async () => {
          if (!restoring) return;
          const result = await onRevert(restoring);
          setRestoring(null);
          if (result.ok) {
            toast.success(
              restoringOff ? "Taken off the site" : "Put back",
              result.refreshed ? "The public site shows it now." : "The public site will show it within five minutes.",
            );
            onClose();
          } else {
            toast.error("Not put back", result.error);
          }
        }}
      />
    </>
  );
}
