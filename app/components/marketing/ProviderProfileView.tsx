"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP, SPRING_SOFT } from "../motion/primitives";
import { Badge, EmptyState, Spinner, CheckItem } from "../ui/Feedback";
import Button from "../ui/Button";
import { IconCalendar, IconChat, IconPeople } from "../ui/icons";
import { useAuth } from "../AuthProvider";
import ProviderAvatar from "../providers/ProviderAvatar";
import GuardianConsentModal from "../therapy/GuardianConsentModal";
import { openChat } from "../../lib/chat";
import { useGuardianGate } from "../../lib/useGuardianGate";
import { formatDalasi } from "../../lib/money";
import { LOCALE_LABELS, type ProviderProfile } from "../../lib/models";
import {
  SPECIALIZATION_LABELS,
  getProvider,
  type Specialization,
} from "../../lib/providers";
import { FORMAT_LABELS, SERVICE_LABELS, isMinor } from "../../lib/matching";

/**
 * Public provider profile.
 *
 * Client-fetched because provider documents are read through the Firebase
 * Web SDK, which only runs in the browser. A not-found and an
 * access-refused both land in the same "unavailable" state — deliberately,
 * since confirming that an unverified provider exists would leak something
 * the rules are meant to hide.
 */
export default function ProviderProfileView({ providerId }: { providerId: string }) {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, profile: account, role } = useAuth();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const guardian = useGuardianGate();

  /**
   * Open the conversation with this provider, creating it if it is their first.
   *
   * The chat id is derived from the two uids, so this is idempotent — tapping
   * twice, or coming back next week, lands in the same thread rather than
   * starting a second one.
   *
   * Patients only. A provider viewing a colleague's public profile has no
   * business opening a patient-facing thread from here, and the shape of a
   * provider-to-provider conversation is not a decision to make by accident.
   */
  const openThread = useCallback(async () => {
    if (!user || opening) return;
    setOpening(true);
    setMessageError(null);
    try {
      // Both names are written onto the chat as it is created. This is the
      // only moment anyone can read both — the provider's from the public
      // directory, the patient's from their own user document — and without
      // it the provider opens a thread that cannot name who is in it.
      //
      // The name Talk was given in the conversation wins over the one on the
      // account: it is what this person asked to be called.
      const mine = account?.intake?.preferredName || account?.displayName;
      const chatId = await openChat(user.uid, providerId, {
        ...(mine ? { [user.uid]: mine } : {}),
        ...(profile?.displayName ? { [providerId]: profile.displayName } : {}),
      }, isMinor(account?.intake ?? null));
      router.push(`/chats/${chatId}`);
    } catch {
      setOpening(false);
      setMessageError("Could not open the conversation. Please try again.");
    }
  }, [account, opening, profile, providerId, router, user]);

  // Under 18: the guardian form first, then the thread (see useGuardianGate).
  const { guard } = guardian;
  const startChat = useCallback(async () => {
    guard(() => void openThread());
  }, [guard, openThread]);

  const canMessage = Boolean(user) && role === "patient";

  useEffect(() => {
    let cancelled = false;
    getProvider(providerId)
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
  }, [providerId]);

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
        description="The provider may no longer be listed, or the link may be incorrect. You can browse everyone currently available in the directory."
        action={<Button href="/providers">Back to directory</Button>}
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
          <ProviderAvatar photoPath={profile.photoPath} name={profile.displayName} size={80} />
          <div className="min-w-0 pt-1">
            <h1 className="text-[28px] md:text-[36px] leading-tight tracking-tight font-medium">
              {profile.displayName}
            </h1>
            <p className="mt-2 text-[14px] md:text-[15px] text-[var(--muted)] leading-relaxed">
              {profile.headline}
            </p>
            {profile.services.length || profile.location ? (
              <p className="mt-1 text-[13px] text-[var(--foreground)]">
                {[profile.services.map((s) => SERVICE_LABELS[s]).join(", ") || null, profile.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {/* A sample is never presented as a verified professional. */}
              {profile.sample ? (
                <Badge tone="warning">Sample profile — not a real provider</Badge>
              ) : (
                <Badge tone="positive">Credentials verified</Badge>
              )}
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
            <dt className="text-[var(--muted)]">Meets by</dt>
            <dd className="text-right">
              {profile.formats.length ? profile.formats.map((f) => FORMAT_LABELS[f]).join(", ") : "Video"}
            </dd>
          </div>
        </dl>

        {/* Message first, book second. Somebody deciding whether to trust a
            stranger with the worst week of their life usually wants to say
            hello before they commit to an hour — and a provider who answers
            warmly is the thing that makes the booking happen. */}
        <div className="mt-8 space-y-2.5">
          {canMessage ? (
            <motion.button
              type="button"
              onClick={() => void startChat()}
              disabled={opening}
              whileHover={opening ? undefined : { scale: 1.03 }}
              whileTap={opening ? undefined : { scale: 0.97 }}
              transition={SPRING_SNAP}
              className="w-full h-12 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white text-[12px] uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-2.5 shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)] transition-colors disabled:opacity-70"
            >
              {opening ? (
                <>
                  <Spinner size={14} />
                  Opening
                </>
              ) : (
                <>
                  <IconChat size={15} />
                  Message
                </>
              )}
            </motion.button>
          ) : null}

          {canMessage ? (
            <Link
              href={`/book/${providerId}`}
              className="w-full h-12 rounded-full border border-[var(--border)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-2.5 hover:bg-black/[.03] transition-colors"
            >
              <IconCalendar size={15} />
              Book a session
            </Link>
          ) : null}

          {messageError ? (
            <p className="text-[12px] text-[var(--accent)] leading-snug">{messageError}</p>
          ) : null}

          {/* Not signed in: say what the button would do rather than hiding
              that messaging exists at all. */}
          {!user ? (
            <p className="text-[12px] text-[var(--muted)] leading-relaxed">
              <Link
                href={`/sign-in?next=${encodeURIComponent("/providers/" + providerId)}`}
                className="underline underline-offset-4 text-[var(--foreground)]"
              >
                Sign in
              </Link>{" "}
              to message {profile.displayName.split(" ")[0] || "this provider"} or
              book a session.
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-[12px] text-[var(--muted)] leading-relaxed">
          <Link href="/plans" className="underline underline-offset-4">
            How pricing works
          </Link>
        </p>
      </motion.aside>

      {/*
        On a phone the rail above sits below the whole bio, areas of focus and
        qualifications list — so the one thing somebody came here to do was a
        long scroll down an unfamiliar page. The same two actions, pinned
        where a thumb already is. The spacer keeps the bar from covering the
        end of the page.
      */}
      {canMessage ? (
        <>
          <div aria-hidden className="h-24 lg:hidden" />
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            transition={{ ...SPRING_SOFT, delay: 0.3 }}
            className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 backdrop-blur-md px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto flex max-w-[560px] gap-2">
              <button
                type="button"
                onClick={() => void startChat()}
                disabled={opening}
                className="flex-1 h-12 rounded-full bg-[var(--accent)] text-white text-[12px] uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-2 shadow-[var(--shadow-accent)] disabled:opacity-70"
              >
                <IconChat size={15} />
                {opening ? "Opening" : "Message"}
              </button>
              <Link
                href={`/book/${providerId}`}
                className="flex-1 h-12 rounded-full border border-[var(--border)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-2"
              >
                <IconCalendar size={15} />
                Book
              </Link>
            </div>
          </motion.div>
        </>
      ) : null}

      <GuardianConsentModal {...guardian.modal} />
    </div>
  );
}
