"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Avatar, Badge, EmptyState, Spinner, CheckItem } from "../ui/Feedback";
import Button from "../ui/Button";
import { IconPeople } from "../ui/icons";
import { formatDalasi } from "../../lib/money";
import { LOCALE_LABELS, type CounsellorProfile } from "../../lib/models";
import {
  SPECIALIZATION_LABELS,
  getCounsellor,
  type Specialization,
} from "../../lib/counsellors";

/**
 * Public counsellor profile.
 *
 * Client-fetched because counsellor documents are read through the Firebase
 * Web SDK, which only runs in the browser. A not-found and an
 * access-refused both land in the same "unavailable" state — deliberately,
 * since confirming that an unverified counsellor exists would leak something
 * the rules are meant to hide.
 */
export default function CounsellorProfileView({ counsellorId }: { counsellorId: string }) {
  const [profile, setProfile] = useState<CounsellorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCounsellor(counsellorId)
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [counsellorId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-[var(--muted)] py-24 justify-center">
        <Spinner />
        <span className="text-[13px]">Loading profile…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={<IconPeople />}
        title="This profile is not available"
        description="The counsellor may no longer be listed, or the link may be incorrect. You can browse everyone currently available in the directory."
        action={<Button href="/therapists">Back to directory</Button>}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10 lg:gap-16 items-start">
      <div>
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="flex items-start gap-5"
        >
          <Avatar name={profile.displayName} size={80} />
          <div className="min-w-0 pt-1">
            <h1 className="text-[28px] md:text-[36px] leading-tight tracking-tight font-medium">
              {profile.displayName}
            </h1>
            <p className="mt-2 text-[14px] md:text-[15px] text-[var(--muted)] leading-relaxed">
              {profile.headline}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="positive">Credentials verified</Badge>
              {profile.yearsExperience > 0 ? (
                <Badge tone="neutral">{profile.yearsExperience} yrs experience</Badge>
              ) : null}
            </div>
          </div>
        </motion.div>

        {profile.bio ? (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_SOFT, delay: 0.08 }}
            className="mt-12"
          >
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
              About
            </h2>
            <p className="mt-4 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)] whitespace-pre-line max-w-[640px]">
              {profile.bio}
            </p>
          </motion.div>
        ) : null}

        {profile.specializations.length ? (
          <div className="mt-12">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
              Areas of focus
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.specializations.map((s) => (
                <Badge key={s} tone="neutral">
                  {SPECIALIZATION_LABELS[s as Specialization] ?? s}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {profile.qualifications.length ? (
          <div className="mt-12">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
              Qualifications
            </h2>
            <ul className="mt-4 space-y-3">
              {profile.qualifications.map((q) => (
                <CheckItem key={q}>{q}</CheckItem>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Booking rail */}
      <motion.aside
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.12 }}
        className="lg:sticky lg:top-28 rounded-[28px] bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)] p-6 md:p-8"
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Session fee
        </p>
        <p className="mt-3 text-[38px] leading-none font-medium tracking-tight">
          {formatDalasi(profile.sessionRateMinor)}
        </p>
        <p className="mt-2 text-[12px] text-[var(--muted)]">per session</p>

        <dl className="mt-7 space-y-4 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Languages</dt>
            <dd className="text-right">
              {profile.languages.map((l) => LOCALE_LABELS[l]).join(", ")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Format</dt>
            <dd className="text-right">Private video session</dd>
          </div>
        </dl>

        <div className="mt-8">
          <Button href={`/book/${profile.uid}`} fullWidth withArrow={false}>
            Book a session
          </Button>
        </div>

        <p className="mt-5 text-[12px] text-[var(--muted)] leading-relaxed">
          You will not be charged until you confirm a time.{" "}
          <Link href="/plans" className="underline underline-offset-4">
            See how pricing works
          </Link>
          .
        </p>
      </motion.aside>
    </div>
  );
}
