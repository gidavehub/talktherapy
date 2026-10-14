"use client";

import { useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Timeline, { type TimelineItem } from "@/components/ui/Timeline";
import { Alert, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import type { ContentResult, PublishedState } from "@/lib/content/client";
import { SECTIONS, type ContentVersion, type SectionId } from "@/lib/content/schema";
import { changedFields, summarise } from "./changes";
import { when } from "./format";
import { nameFor, useStaffNames } from "./useStaffNames";

/**
 * Every change to a section, newest first: who made it, when, why (the note
 * they left), and what it touched. Each can be undone by putting back what
 * the section showed before it — which is itself a change, recorded here
 * like any other, so nothing is ever lost by putting something back.
 */
export default function VersionHistory<S extends SectionId>({
  open,
  onClose,
  sectionId,
  versions,
  error,
  live,
  hasDraft,
  onRevert,
}: {
  open: boolean;
  onClose: () => void;
  sectionId: S;
  /** Newest first (watchVersions). Null while they load. */
  versions: ContentVersion[] | null;
  error: string | null;
  live: PublishedState<S> | null | undefined;
  /** A draft is waiting: putting a version back throws it away, and the dialog says so. */
  hasDraft: boolean;
  onRevert: (version: ContentVersion) => Promise<ContentResult<{ rev: number; refreshed: boolean }>>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [restoring, setRestoring] = useState<ContentVersion | null>(null);
  const label = SECTIONS[sectionId].label;

  const names = useStaffNames((versions ?? []).map((v) => v.replacedBy));

  const items: TimelineItem[] = useMemo(() => {
    if (!versions) return [];
    return versions.map((version, i) => {
      // What this change made the section show: the next newer version's
      // "before", or for the newest change, what is live now.
      const after = i === 0 ? (live?.data ?? null) : versions[i - 1].data;
      const changes = changedFields(sectionId, version.data, after);
      const restoresOriginal = version.data === null;
      return {
        id: version.id,
        at: version.replacedAt,
        title: version.action === "revert" ? "An earlier version put back" : "Published",
        tone: version.action === "revert" ? "warning" : "accent",
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
            <Button size="sm" variant="ghost" onClick={() => setRestoring(version)}>
              {restoresOriginal ? "Put back the original words" : "Put back how it was before"}
            </Button>
          </div>
        ),
      };
    });
  }, [versions, live, sectionId, names, user?.uid]);

  return (
    <>
      <Drawer open={open} onClose={onClose} eyebrow={label} title="History" width="560px">
        <div className="space-y-6">
          <div className="rounded-[20px] bg-[var(--surface-2)] px-4 py-3 text-[13px] leading-relaxed">
            {live === undefined ? (
              <Skeleton className="h-4 w-48" />
            ) : live ? (
              <>
                <span className="font-medium">Live now:</span> published {when(live.publishedAt)} (UTC).
              </>
            ) : (
              <>
                <span className="font-medium">Live now:</span> the original words, as the site was built. Nothing has
                been published here yet.
              </>
            )}
          </div>

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
        title={restoring?.data === null ? "Put back the original words?" : "Put back how it was before?"}
        body={
          <div className="space-y-2">
            <p>
              The {label} {SECTIONS[sectionId].kind === "page" ? "page" : "section"} goes back to what it showed before
              this change{restoring?.data === null ? ": the words the site was built with" : ""}. It goes live straight
              away.
            </p>
            {hasDraft ? <p className="font-medium text-[var(--foreground)]">The draft you are working on is thrown away.</p> : null}
            <p>This is recorded in the history too, so it can be undone the same way.</p>
          </div>
        }
        confirmLabel="Put it back"
        onClose={() => setRestoring(null)}
        onConfirm={async () => {
          if (!restoring) return;
          const result = await onRevert(restoring);
          setRestoring(null);
          if (result.ok) {
            toast.success(
              "Put back",
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
