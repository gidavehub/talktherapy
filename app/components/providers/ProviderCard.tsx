"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Badge, Skeleton } from "../ui/Feedback";
import ProviderAvatar from "./ProviderAvatar";
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
  onOpen,
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
  /**
   * What tapping the card does.
   *
   * Signed-in surfaces pass this and it opens the CONVERSATION with the
   * provider — the point of the whole product is the hand-off to a person, and
   * a profile page between the two is a page nobody asked for. The public
   * directory omits it, because a visitor who is not signed in has nobody to
   * open a conversation as, and falls back to the profile.
   */
  onOpen?: (profile: ProviderProfile) => void;
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
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(profile)}
          className="absolute inset-0 rounded-[28px]"
          aria-label={`Message ${profile.displayName}`}
        />
      ) : (
        <Link
          href={`/providers/${profile.uid}`}
          className="absolute inset-0 rounded-[28px]"
          aria-label={`${profile.displayName} — view profile`}
        />
      )}

      <div className="flex items-start gap-4">
        <ProviderAvatar photoPath={profile.photoPath} name={profile.displayName} size={compact ? 48 : 56} />
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

      {!compact && profile.qualifications.length ? (
        <p className="mt-4 text-[12px] text-[var(--muted)] truncate">
          {profile.qualifications[0]}
          {profile.qualifications.length > 1 ? ` +${profile.qualifications.length - 1}` : ""}
        </p>
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
              {/*
                A rating only when somebody has actually given one. Showing
                "0.0 ★" for every new provider would be a worse lie than
                showing nothing, and it is the number people trust most.
              */}
              {profile.ratingCount > 0
                ? `${profile.ratingAvg.toFixed(1)} ★ · ${profile.ratingCount} rating${profile.ratingCount === 1 ? "" : "s"}`
                : compact
                  ? formatDalasi(profile.sessionRateMinor)
                  : profile.yearsExperience > 0
                    ? `${profile.yearsExperience} yrs experience`
                    : "Verified professional"}
            </span>
          )}
          <span className="text-[12px] uppercase tracking-[0.14em] font-medium underline underline-offset-4">
            {onOpen ? "Message" : "View"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * A provider card that has not arrived yet.
 *
 * The same outline as the real card — face, name, a line of what they offer,
 * the footer rule — so the grid holds its shape while it loads and nothing
 * jumps when the providers land. `compact` matches the dashboard size.
 */
export function ProviderCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden className="rounded-[28px] bg-white shadow-[var(--shadow-raised)] p-6 flex flex-col">
      <div className="flex items-start gap-4">
        <Skeleton rounded="rounded-full" className={compact ? "h-12 w-12 shrink-0" : "h-14 w-14 shrink-0"} />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-5 flex gap-1.5">
        <Skeleton rounded="rounded-full" className="h-7 w-20" />
        <Skeleton rounded="rounded-full" className="h-7 w-24" />
      </div>
      <div className="mt-auto pt-5">
        <div className="pt-5 border-t border-[var(--border)] flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}
