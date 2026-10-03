"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Avatar, Badge } from "../ui/Feedback";
import { formatDalasi } from "../../lib/money";
import { LOCALE_LABELS, type ProviderProfile } from "../../lib/models";
import { SERVICE_LABELS, SPECIALIZATION_LABELS, type Specialization } from "../../lib/matching";

/**
 * One provider, as a card. Shared by the public directory, the "for you"
 * list and the dashboard, so a provider looks the same everywhere.
 *
 * With `reasons`, the card leads with why this person was suggested — "Speaks
 * Wolof · Grief & loss · Video" says more to someone choosing than a bio does.
 */
/**
 * Everything on the card as one spoken sentence, for someone who cannot read
 * it. Kept in the same order the card shows it, so hearing it and seeing it
 * match.
 */
export function providerSummary(profile: ProviderProfile, reasons?: string[]): string {
  const parts = [profile.displayName];
  if (profile.services.length) parts.push(`offers ${profile.services.map((s) => SERVICE_LABELS[s]).join(" and ")}`);
  if (profile.location) parts.push(`based in ${profile.location}`);
  if (profile.languages.length) parts.push(`speaks ${profile.languages.map((l) => LOCALE_LABELS[l]).join(" and ")}`);
  if (profile.yearsExperience > 0) parts.push(`${profile.yearsExperience} years of experience`);
  parts.push(`${formatDalasi(profile.sessionRateMinor)} a session`);
  if (reasons?.length) parts.push(`suggested because: ${reasons.join(", ")}`);
  return `${parts.join(". ")}.`;
}

export default function ProviderCard({
  profile,
  index = 0,
  reasons,
  best = false,
  compact = false,
  onRead,
  speaking = false,
}: {
  profile: ProviderProfile;
  index?: number;
  reasons?: string[];
  /** The top suggestion. */
  best?: boolean;
  /** Dashboard size: drops the fee/language footer. */
  compact?: boolean;
  /** Read this provider aloud. Omitted where speech is not available. */
  onRead?: (id: string, text: string) => void;
  speaking?: boolean;
}) {
  // What they offer, then where they are — the two things someone scanning a
  // list actually chooses on.
  const kind = [profile.services.map((s) => SERVICE_LABELS[s]).join(", ") || null, profile.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING_SOFT, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -4 }}
      className="relative rounded-[28px] bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)] p-6 flex flex-col"
    >
      <Link
        href={`/providers/${profile.uid}`}
        className="absolute inset-0 rounded-[28px]"
        aria-label={`${profile.displayName} — view profile`}
      />

      <div className="flex items-start gap-4">
        <Avatar name={profile.displayName} size={compact ? 48 : 56} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-medium leading-tight truncate">{profile.displayName}</h3>
          {kind ? <p className="mt-1 text-[12px] text-[var(--muted)] truncate">{kind}</p> : null}
        </div>
        {best ? <Badge tone="accent">Best fit</Badge> : null}
        {onRead ? (
          <button
            type="button"
            // Above the card-wide link, or the tap opens the profile instead.
            className="relative z-10 -mr-1 -mt-1 h-9 w-9 shrink-0 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-black/5 transition-colors"
            aria-label={speaking ? `Stop reading ${profile.displayName} aloud` : `Read ${profile.displayName} aloud`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRead(profile.uid, providerSummary(profile, reasons));
            }}
          >
            {speaking ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M17 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ) : null}
      </div>

      {reasons && reasons.length ? (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {reasons.slice(0, 4).map((r) => (
            <span
              key={r}
              className="inline-flex h-7 items-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] px-3 text-[11px] font-medium"
            >
              {r}
            </span>
          ))}
        </div>
      ) : profile.specializations.length ? (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {profile.specializations.slice(0, 3).map((s) => (
            <Badge key={s} tone="neutral">
              {SPECIALIZATION_LABELS[s as Specialization] ?? s}
            </Badge>
          ))}
        </div>
      ) : null}

      {!compact ? (
        <dl className="mt-6 grid grid-cols-2 gap-4 text-[12px]">
          <div>
            <dt className="text-[var(--muted)]">Session</dt>
            <dd className="mt-1 text-[15px] font-medium">{formatDalasi(profile.sessionRateMinor)}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Speaks</dt>
            <dd className="mt-1 text-[13px]">{profile.languages.map((l) => LOCALE_LABELS[l]).join(", ")}</dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="pt-5 border-t border-[var(--border)] flex items-center justify-between gap-3">
          {profile.sample ? (
            <Badge tone="warning">Sample profile</Badge>
          ) : (
            <span className="text-[12px] text-[var(--muted)]">
              {compact
                ? formatDalasi(profile.sessionRateMinor)
                : profile.yearsExperience > 0
                  ? `${profile.yearsExperience} yrs experience`
                  : "Verified professional"}
            </span>
          )}
          <span className="text-[12px] uppercase tracking-[0.14em] font-medium underline underline-offset-4">
            View
          </span>
        </div>
      </div>
    </motion.div>
  );
}
