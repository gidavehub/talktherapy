"use client";

import { useEffect, useState } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { getProvider } from "@/lib/providers";
import { shareAgain, stopSharing, watchMyHandoffs, type Handoff } from "@/lib/handoff";

/**
 * Who this person has shared their summary from TALK with, and a way to take
 * it back. When they talked to TALK she said the provider they choose would
 * see a short summary; this is where they can see that happened, and change
 * their mind about it.
 */

function when(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function SharedSummaries({ uid }: { uid: string }) {
  const toast = useToast();
  const [items, setItems] = useState<{ uid: string; list: Handoff[] } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [stopping, setStopping] = useState<Handoff | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => watchMyHandoffs(uid, (list) => setItems({ uid, list })), [uid]);
  const list = items?.uid === uid ? items.list : null;

  // The providers' names, from the public directory.
  const missing = (list ?? []).map((h) => h.providerId).filter((id) => !(id in names));
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    void Promise.all(missingKey.split(",").map(async (id) => [id, (await getProvider(id))?.displayName ?? "A provider"] as const)).then(
      (pairs) => {
        if (!cancelled) setNames((n) => ({ ...n, ...Object.fromEntries(pairs) }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  async function resume(handoff: Handoff) {
    setBusy(handoff.id);
    const shared = await shareAgain(handoff.providerId);
    setBusy(null);
    if (shared) toast.success("Shared again");
    else toast.error("It could not be shared just now. Try again later.");
  }

  async function stop() {
    if (!stopping) return;
    if (await stopSharing(stopping.providerId)) {
      toast.success("You have stopped sharing it");
      setStopping(null);
    } else {
      toast.error("That did not go through. Check your connection and try again.");
    }
  }

  return (
    <Card radius="md" padding="p-6 md:p-8" reveal={false}>
      <p className="eyebrow">Your summary from TALK</p>
      <h2 className="font-display mt-3 text-[20px] leading-tight font-medium">Shared with your providers</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        When you choose a provider, they see a short summary of what you told TALK — the name you like to be called, your
        language, your age range, what brought you and the kind of help you asked for. Never your journal, your mood or
        your conversation&apos;s words.
      </p>

      {list === null ? null : list.length === 0 ? (
        <p className="mt-6 text-[13.5px] text-[var(--muted)]">You have not shared it with anyone yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--border)]">
          {list.map((h) => (
            <li key={h.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{names[h.providerId] ?? "…"}</p>
                <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                  {h.revokedAt
                    ? `You stopped sharing on ${when(h.revokedAt)}`
                    : `Shared${h.sharedAt ? ` since ${when(h.sharedAt)}` : ""}`}
                </p>
              </div>
              {h.revokedAt ? (
                <Button size="sm" variant="secondary" loading={busy === h.id} onClick={() => void resume(h)}>
                  Share it again
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setStopping(h)}>
                  Stop sharing
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={stopping !== null}
        title="Stop sharing your summary?"
        confirmLabel="Stop sharing"
        onClose={() => setStopping(null)}
        onConfirm={stop}
        body={
          <p>
            {stopping ? names[stopping.providerId] ?? "Your provider" : "Your provider"} will no longer see what you told
            TALK. Your messages and sessions with them are not affected. You can share it again at any time.
          </p>
        }
      />
    </Card>
  );
}
