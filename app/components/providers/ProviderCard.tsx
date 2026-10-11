"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Badge, Skeleton } from "../ui/Feedback";
import { ArchFrame, archTone } from "../ui/Arch";
import { useProviderPhoto } from "./ProviderAvatar";
import { formatDalasi } from "../../lib/money";
import { LOCALE_LABELS, type ProviderProfile } from "../../lib/models";
import { FORMAT_LABELS, SERVICE_LABELS, SPECIALIZATION_LABELS, type Specialization } from "../../lib/matching";

/**
 * One provider, as a card — the redesign's: the person in an arch, their
 * name and what they do, a word about them, what they help with, what they
 * speak and how they meet, and the two buttons. Shared by the public
 * directory, the "for you" list and the dashboard, so a provider looks the
 * same everywhere.
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

/**
 * Stand-in faces for the sample profiles only — never for a real provider.
 * Chosen from the faces of their gender by a well-mixed hash of their id;
 * the salt is the one that gives each of the ten samples its own face.
 */
const WOMEN = ["provider-2", "provider-4", "provider-5", "mind-woman", "hero-woman-sage", "hero-woman-terracotta"];
const MEN = ["provider-1", "provider-3", "provider-6", "mind-man", "hero-man"];
const FACE_SALT = 129;

function mixHash(text: string): number {
  let h = (2166136261 ^ FACE_SALT) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function sampleFace(profile: ProviderProfile): string {
  const pool = profile.gender === "woman" ? WOMEN : profile.gender === "man" ? MEN : [...WOMEN, ...MEN];
  return `/people/${pool[mixHash(profile.uid) % pool.length]}.webp`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** The provider in their arch: their photo, a sample face, or their initials. */
export function ProviderArch({
  profile,
  index = 0,
  className = "",
}: {
  profile: ProviderProfile;
  index?: number;
  className?: string;
}) {
  const photo = useProviderPhoto(profile.photoPath);
  const src = photo ?? (profile.sample ? sampleFace(profile) : null);
  return (
    <ArchFrame tone={archTone(index)} className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={
            photo
              ? "absolute inset-0 h-full w-full object-cover object-top"
              : // A sample face is a cut-out: standing at the bottom of the arch.
                "absolute bottom-0 left-1/2 h-auto w-[122%] max-w-none -translate-x-1/2"
          }
        />
      ) : (
        <span className="font-display absolute inset-0 flex items-end justify-center pb-[22%] text-[28px] font-medium text-white/90">
          {initials(profile.displayName)}
        </span>
      )}
    </ArchFrame>
  );
}

const LABEL = "text-[10.5px] uppercase tracking-[0.28em] text-[var(--sage)] font-medium";

export default function ProviderCard({
  profile,
  index = 0,
  reasons,
  best = false,
  compact = false,
  onRead,
  speaking = false,
  onOpen,
  tile = false,
}: {
  /** Always the compact tile, at every width (the dashboard's row of three). */
  tile?: boolean;
  profile: ProviderProfile;
  index?: number;
  reasons?: string[];
  /** The top suggestion. */
  best?: boolean;
  /** Dashboard size: drops the bio and the speaks/sessions row. */
  compact?: boolean;
  /** Read this provider aloud. Omitted where speech is not available. */
  onRead?: (id: string, text: string) => void;
  speaking?: boolean;
  /**
   * What the main button does.
   *
   * Signed-in surfaces pass this and it opens the CONVERSATION with the
   * provider — the point of the whole product is the hand-off to a person.
   * The public directory omits it: a visitor who is not signed in has nobody
   * to open a conversation as, and books instead.
   */
  onOpen?: (profile: ProviderProfile) => void;
}) {
  // Their role, short: "Therapy — working through…" reads as "Therapy".
  const role =
    profile.headline.split(/\s[—–-]\s/)[0] || profile.services.map((s) => SERVICE_LABELS[s]).join(", ") || "Provider";
  const specialties = profile.specializations.map((s) => SPECIALIZATION_LABELS[s as Specialization] ?? s);
  const shown = specialties.slice(0, 2);
  const more = specialties.length - shown.length;
  const sessions = profile.formats.length ? profile.formats.map((f) => FORMAT_LABELS[f]).join(" or ") : "Video";

  const speaker = onRead ? (
    <button
      type="button"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--sand)]"
      aria-label={speaking ? `Stop reading ${profile.displayName} aloud` : `Read ${profile.displayName} aloud`}
      onClick={() => onRead(profile.uid, providerSummary(profile, reasons))}
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
  ) : null;

  const action = onOpen ? (
    <button
      type="button"
      onClick={() => onOpen(profile)}
      className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] font-medium text-white transition-colors hover:bg-[var(--accent-deep)]"
    >
      Message
    </button>
  ) : (
    <Link
      href={`/book/${profile.uid}`}
      className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] font-medium text-white transition-colors hover:bg-[var(--accent-deep)]"
    >
      Book session
    </Link>
  );

  // One detail for the tile: why they were suggested, or what they help with.
  const highlight = reasons?.[0] ?? shown[0] ?? null;

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING_SOFT, delay: Math.min(index, 8) * 0.05 }}
      whileHover={{ y: -4 }}
      className="h-full"
    >
      {/* Phone and tablet: a tile, two or three to a row, so several people
          fit on one screen. */}
      <div className={`relative flex h-full flex-col rounded-[22px] bg-[var(--surface)] p-3 pb-3.5 text-center shadow-[var(--shadow-card)] ${tile ? "" : "lg:hidden"}`}>
        <Link href={`/providers/${profile.uid}`} aria-label={`${profile.displayName} — view profile`} className="block">
          <ProviderArch profile={profile} index={index} className="mx-auto h-[118px] w-[96px]" />
          <h3 className="font-display mt-3 line-clamp-1 text-[16.5px] font-medium leading-tight">{profile.displayName}</h3>
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">{role}</p>
        <p className="mt-1.5 text-[12px] font-medium text-[var(--accent)]">From {formatDalasi(profile.sessionRateMinor)}</p>
        {best || highlight ? (
          <div className="mt-2 flex justify-center">
            <span
              className={`inline-flex h-6 max-w-full items-center truncate rounded-full px-2.5 text-[11px] ${
                best ? "bg-[var(--accent)] text-white" : reasons?.length ? "bg-[var(--accent)]/12 text-[var(--accent-deep)]" : "bg-[var(--sand)]"
              }`}
            >
              <span className="truncate">{best ? "Best fit" : highlight}</span>
            </span>
          </div>
        ) : null}
        <div className="mt-auto pt-3 [&>*]:h-9 [&>*]:w-full [&>*]:text-[13px]">{action}</div>
        {speaker ? <div className="absolute right-2 top-2 [&>button]:h-8 [&>button]:w-8">{speaker}</div> : null}
      </div>

      {/* Computer: the full card. */}
      <div className={`relative hidden h-full flex-col rounded-[28px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6 ${tile ? "" : "lg:flex"}`}>
      <div className="flex items-start gap-4">
        <ProviderArch
          profile={profile}
          index={index}
          className={compact ? "h-[96px] w-[76px] shrink-0" : "h-[128px] w-[100px] shrink-0"}
        />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start gap-2">
            <h3 className="font-display min-w-0 flex-1 text-[21px] font-medium leading-tight md:text-[22px]">
              <Link href={`/providers/${profile.uid}`} className="hover:text-[var(--accent)]">
                {profile.displayName}
              </Link>
            </h3>
            {speaker ? <div className="-mr-1 -mt-1">{speaker}</div> : null}
          </div>
          <p className="mt-1 truncate text-[13px] text-[var(--muted)]">{role}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {best ? <Badge tone="accent">Best fit</Badge> : null}
            {profile.sample ? <Badge tone="neutral">Sample profile</Badge> : <Badge tone="positive">Verified</Badge>}
          </div>
          <p className="mt-2.5 text-[13.5px] font-medium text-[var(--accent)]">
            From {formatDalasi(profile.sessionRateMinor)} per session
          </p>
        </div>
      </div>

      {!compact && profile.bio ? (
        <p className="mt-5 line-clamp-3 text-[13.5px] leading-relaxed text-[var(--foreground)]/85">{profile.bio}</p>
      ) : null}

      {reasons && reasons.length ? (
        <div className="mt-5">
          <p className={LABEL}>Why we suggest them</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasons.slice(0, 4).map((r) => (
              <span key={r} className="inline-flex h-7 items-center rounded-full bg-[var(--accent)]/12 px-3 text-[12px] font-medium text-[var(--accent-deep)]">
                {r}
              </span>
            ))}
          </div>
        </div>
      ) : shown.length ? (
        <div className="mt-5">
          <p className={LABEL}>Specialties</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((s) => (
              <span key={s} className="inline-flex h-7 items-center rounded-full bg-[var(--sand)] px-3 text-[12px]">
                {s}
              </span>
            ))}
            {more > 0 ? (
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--sand)] px-3 text-[12px]">+{more} more</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!compact ? (
        <dl className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <dt className={LABEL}>Speaks</dt>
            <dd className="mt-1.5 text-[14px]">{profile.languages.map((l) => LOCALE_LABELS[l]).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className={LABEL}>Sessions</dt>
            <dd className="mt-1.5 text-[14px]">{sessions}</dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
        <Link
          href={`/providers/${profile.uid}`}
          className="inline-flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--dark)] text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
        >
          View profile
        </Link>
        <div className="[&>*]:h-11 [&>*]:w-full [&>*]:text-[14px]">{action}</div>
      </div>
      </div>
    </motion.div>
  );
}

/**
 * A provider card that has not arrived yet — the same outline as the real
 * one, so the grid holds its shape while it loads.
 */
export function ProviderCardSkeleton({ compact = false, tile = false }: { compact?: boolean; tile?: boolean }) {
  return (
    <>
    <div aria-hidden className={`flex flex-col items-center rounded-[22px] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] ${tile ? "" : "lg:hidden"}`}>
      <Skeleton rounded="arch" className="h-[118px] w-[96px]" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton rounded="rounded-full" className="mt-4 h-9 w-full" />
    </div>
    <div aria-hidden className={`hidden flex-col rounded-[28px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] ${tile ? "" : "lg:flex"}`}>
      <div className="flex items-start gap-4">
        <Skeleton rounded="arch" className={compact ? "h-[96px] w-[76px] shrink-0" : "h-[128px] w-[100px] shrink-0"} />
        <div className="min-w-0 flex-1 space-y-2.5 pt-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton rounded="rounded-full" className="h-7 w-24" />
        </div>
      </div>
      <div className="mt-5 flex gap-1.5">
        <Skeleton rounded="rounded-full" className="h-7 w-20" />
        <Skeleton rounded="rounded-full" className="h-7 w-24" />
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
        <Skeleton rounded="rounded-full" className="h-11" />
        <Skeleton rounded="rounded-full" className="h-11" />
      </div>
    </div>
    </>
  );
}
