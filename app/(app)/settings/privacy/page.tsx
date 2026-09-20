"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { recordConsent } from "@/lib/wellbeing";
import type { Consents } from "@/lib/models";

/**
 * Consent controls.
 *
 * Each toggle writes immediately and appends to the immutable consent ledger —
 * there is no Save button, because a consent screen where you can change a
 * toggle and walk away without it taking effect is worse than useless.
 *
 * The two required consents are shown but locked: withdrawing them means
 * closing the account, which lives on the Your Data tab. Presenting them as
 * freely toggleable would be dishonest.
 */

type OptionalKey = Extract<keyof Consents, "personalInsights" | "marketing">;

const OPTIONAL: { key: OptionalKey; label: string; description: string }[] = [
  {
    key: "personalInsights",
    label: "Personal insights",
    description:
      "Show general patterns based on my own mood check-ins and activity. No clinical interpretation, and nothing is shared with anyone.",
  },
  {
    key: "marketing",
    label: "Product updates by email",
    description:
      "Occasional email about new features and resources. Never more than monthly, and never about your wellbeing data.",
  },
];

export default function PrivacySettingsPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState<OptionalKey | null>(null);

  async function toggle(key: OptionalKey, granted: boolean) {
    if (!user) return;
    setPending(key);
    try {
      await recordConsent(user.uid, key, granted, "settings/privacy");
      toast.success(granted ? "Turned on" : "Turned off");
    } catch {
      toast.error("Could not save that change");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="max-w-[640px] space-y-6">
      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Optional
        </p>
        <h2 className="mt-3 text-[20px] leading-tight font-medium">
          Things you can turn off
        </h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
          These take effect immediately. Turning one off does not affect
          anything else.
        </p>

        <div className="mt-8 space-y-6">
          {OPTIONAL.map((option) => (
            <div
              key={option.key}
              className={pending === option.key ? "opacity-60 pointer-events-none" : ""}
            >
              <Checkbox
                checked={Boolean(profile?.consents?.[option.key])}
                onChange={(next) => toggle(option.key, next)}
                label={option.label}
                description={option.description}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Required
        </p>
        <h2 className="mt-3 text-[20px] leading-tight font-medium">
          What you agreed to
        </h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
          Talk cannot operate without these. To withdraw them, close your
          account on the{" "}
          <Link href="/settings/data" className="underline underline-offset-4">
            Your data
          </Link>{" "}
          tab.
        </p>

        <ul className="mt-8 space-y-5">
          <li className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 h-5 w-5 rounded-full bg-[var(--success)] text-white flex items-center justify-center shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <div>
              <p className="text-[14px] leading-snug">
                How my information is handled
              </p>
              <p className="mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                Journal and mood entries are private to me. Encrypted in transit
                and at rest, though not end-to-end.{" "}
                <Link href="/privacy" className="underline underline-offset-4">
                  Read the policy
                </Link>
                .
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 h-5 w-5 rounded-full bg-[var(--success)] text-white flex items-center justify-center shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <div>
              <p className="text-[14px] leading-snug">
                The AI companion is not a therapist
              </p>
              <p className="mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                It does not diagnose, prescribe, or replace a professional, and
                cannot respond to an emergency.
              </p>
            </div>
          </li>
        </ul>

        {profile?.consents?.acceptedTermsAt ? (
          <p className="mt-8 pt-6 border-t border-[var(--border)] text-[12px] text-[var(--muted)]">
            Agreed on{" "}
            {new Date(profile.consents.acceptedTermsAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        ) : null}
      </Card>

      <Alert tone="info">
        Nobody at Talk can read your journal or mood entries — not counsellors,
        not administrators. That is enforced by the database access rules, not
        by policy.
      </Alert>
    </div>
  );
}
