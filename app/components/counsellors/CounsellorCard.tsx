"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Avatar, Badge } from "../ui/Feedback";
import { formatDalasi } from "../../lib/money";
import { LOCALE_LABELS, type CounsellorProfile } from "../../lib/models";
import { PROFESSION_LABELS, SPECIALIZATION_LABELS, type Specialization } from "../../lib/matching";

/**
 * One counsellor, as a card. Shared by the public directory, the "for you"
 * list and the dashboard, so a counsellor looks the same everywhere.
 *
 * With `reasons`, the card leads with why this person was suggested — "Speaks
 * Wolof · Grief & loss · Video" says more to someone choosing than a bio does.
 */
export default function CounsellorCard({
  profile,
  index = 0,
  reasons,
  best = false,
  compact = false,
}: {
  profile: CounsellorProfile;
  index?: number;
  reasons?: string[];
  /** The top suggestion. */
  best?: boolean;
  /** Dashboard size: drops the fee/language footer. */
  compact?: boolean;
}) {
  const kind = [profile.profession ? PROFESSION_LABELS[profile.profession] : null, profile.location]
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
        href={`/therapists/${profile.uid}`}
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
