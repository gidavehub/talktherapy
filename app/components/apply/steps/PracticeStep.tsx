"use client";

import { Input, Textarea } from "../../ui/Input";
import { CharCount } from "../fields";
import {
  APPROACH_MAX,
  APPROACH_MIN,
  BIO_MAX,
  BIO_MIN,
  FIRST_SESSION_MAX,
  HEADLINE_MAX,
  LOCALE_LABELS,
  type PracticeSection,
} from "@/lib/providerApplication";
import { formatDalasi } from "@/lib/money";
import type { StepProps } from "./types";

/** How the words will read on a profile card, as they are typed. */
function ProfilePreview({ draft, practice }: { draft: StepProps<"practice">["draft"]; practice: PracticeSection }) {
  const name = draft.personal.displayName.trim() || "Your name";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <div className="rounded-[26px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <p className="text-[10.5px] uppercase tracking-[0.28em] text-[var(--sage)]">How your profile reads</p>
      <div className="mt-5 flex items-end gap-4">
        <span className="arch flex h-20 w-[68px] shrink-0 items-end justify-center rounded-b-2xl bg-[var(--peach)] pb-3 font-display text-[22px] text-[var(--dark)]">
          {initials}
        </span>
        <div className="min-w-0 pb-1">
          <p className="font-display truncate text-[21px] font-medium leading-tight">{name}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--muted)]">
            {practice.headline.trim() || "Your one line goes here."}
          </p>
        </div>
      </div>
      {draft.professional.languages.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {draft.professional.languages.map((l) => (
            <span key={l} className="rounded-full bg-[var(--sage-pale)] px-3 py-1 text-[11.5px] text-[var(--sage-deep)]">
              {LOCALE_LABELS[l]}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-4 line-clamp-5 whitespace-pre-line text-[13.5px] leading-relaxed">
        {practice.bio.trim() || "Your few lines about you go here — what it is like to talk to you."}
      </p>
      {draft.fee.sessionRateMinor ? (
        <p className="mt-4 text-[13px] text-[var(--muted)]">
          {formatDalasi(draft.fee.sessionRateMinor)} a session
        </p>
      ) : null}
    </div>
  );
}

export default function PracticeStep({ value, onChange, problems, draft }: StepProps<"practice">) {
  const set = <K extends keyof PracticeSection>(key: K, next: PracticeSection[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div>
          <Input
            label="One line about what you offer"
            hint="The first thing anyone reads. Plain words beat credentials here."
            placeholder="For example, Gentle support through grief and loss"
            value={value.headline}
            maxLength={HEADLINE_MAX + 20}
            onChange={(e) => set("headline", e.target.value)}
            error={problems.headline}
            required
          />
          <CharCount value={value.headline} min={10} max={HEADLINE_MAX} />
        </div>
        <div>
          <Textarea
            label="About you"
            hint="A short paragraph. What it is like to talk to you matters more than where you studied."
            rows={6}
            value={value.bio}
            onChange={(e) => set("bio", e.target.value)}
            error={problems.bio}
            required
          />
          <CharCount value={value.bio} min={BIO_MIN} max={BIO_MAX} />
        </div>
        <div>
          <Textarea
            label="How you work"
            hint="Your approach, in everyday words — for example, listening first, practical steps, faith-sensitive."
            rows={4}
            value={value.approach}
            onChange={(e) => set("approach", e.target.value)}
            error={problems.approach}
            required
          />
          <CharCount value={value.approach} min={APPROACH_MIN} max={APPROACH_MAX} />
        </div>
        <div>
          <Textarea
            label="What a first session is like"
            hint="Optional. Many people have never spoken to anyone before — tell them what to expect."
            rows={4}
            value={value.firstSession}
            onChange={(e) => set("firstSession", e.target.value)}
            error={problems.firstSession}
          />
          <CharCount value={value.firstSession} max={FIRST_SESSION_MAX} />
        </div>
      </div>
      <div className="xl:sticky xl:top-6 xl:self-start">
        <ProfilePreview draft={draft} practice={value} />
      </div>
    </div>
  );
}
