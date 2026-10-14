"use client";

import { useEffect, useState } from "react";
import Drawer from "../ui/Drawer";
import DescriptionList from "../ui/DescriptionList";
import MinorFlag from "../ui/MinorFlag";
import { watchHandoff, type Handoff } from "@/lib/handoff";
import { AGE_LABELS, SERVICE_LABELS, SPECIALIZATION_LABELS } from "@/lib/matching";

/**
 * For a provider: the short summary of what this person told TALK before
 * they chose you (lib/handoff.ts). It is what TALK's consent told them you
 * would see — no more. If they stopped sharing it, it says so and shows
 * nothing.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  english: "English",
  wolof: "Wolof",
  mandinka: "Mandinka",
  pulaar: "Pulaar",
  other: "Another language",
};

function when(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Body({ handoff, name }: { handoff: Handoff | null; name: string }) {
  if (!handoff || (!handoff.revokedAt && !handoff.concernSummary && handoff.concerns.length === 0 && !handoff.ageRange)) {
    return (
      <p className="text-[14px] leading-relaxed text-[var(--muted)]">
        {name} has not shared a summary from TALK with you. Some people choose a provider before they talk to TALK, and
        some prefer to tell you themselves.
      </p>
    );
  }
  if (handoff.revokedAt) {
    return (
      <div className="space-y-4">
        {handoff.minor ? <MinorFlag size="row" /> : null}
        <p className="text-[14px] leading-relaxed text-[var(--muted)]">
          {name} has chosen to stop sharing their summary from TALK. Ask them what they would like you to know.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {handoff.minor ? (
        <div className="rounded-2xl bg-[var(--warning-soft)] p-4">
          <MinorFlag size="row" />
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--warning)]">
            Under 18. Follow your safeguarding duties, and make sure a guardian&apos;s consent is in place before treatment.
          </p>
        </div>
      ) : null}
      {handoff.concernSummary ? (
        <div className="rounded-[22px] bg-[var(--sage-pale)] p-5">
          <p className="text-[10.5px] uppercase tracking-[0.28em] text-[var(--sage-deep)]">In their words, to TALK</p>
          <p className="font-display mt-2 text-[19px] leading-snug">&ldquo;{handoff.concernSummary}&rdquo;</p>
        </div>
      ) : null}
      <DescriptionList
        items={[
          { label: "Likes to be called", value: handoff.preferredName ?? "" },
          { label: "Language", value: handoff.language ? LANGUAGE_NAMES[handoff.language] ?? handoff.language : "" },
          { label: "Age", value: handoff.ageRange ? AGE_LABELS[handoff.ageRange] : "" },
          { label: "What it is about", value: handoff.concerns.map((c) => SPECIALIZATION_LABELS[c] ?? c).join(", ") },
          { label: "Help they asked for", value: handoff.servicesWanted.map((s) => SERVICE_LABELS[s] ?? s).join(", ") },
        ]}
      />
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">
        Shared{handoff.sharedAt ? ` on ${when(handoff.sharedAt)}` : ""} because they chose you. It is a starting point,
        not their story — let them tell it. They can stop sharing it at any time.
      </p>
    </div>
  );
}

export default function HandoffSheet({
  pairId,
  name,
  open,
  onClose,
}: {
  pairId: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const [handoff, setHandoff] = useState<{ pairId: string; value: Handoff | null } | null>(null);
  useEffect(() => watchHandoff(pairId, (value) => setHandoff({ pairId, value })), [pairId]);
  const current = handoff?.pairId === pairId ? handoff.value : null;

  return (
    <Drawer open={open} onClose={onClose} title={`What ${name} told TALK`} eyebrow="Before they chose you">
      <Body handoff={current} name={name} />
    </Drawer>
  );
}
