"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Alert, Avatar, Badge } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { updateUserProfile } from "@/lib/auth";
import { LOCALE_LABELS, type Locale } from "@/lib/models";

const LOCALE_OPTIONS = (Object.keys(LOCALE_LABELS) as Locale[]).map((value) => ({
  value,
  label: LOCALE_LABELS[value],
}));

export default function ProfileSettingsPage() {
  const { user, profile } = useAuth();
  const toast = useToast();

  // Drafts start null and fall back to the live profile, so the form needs no
  // effect to seed itself. An untouched field tracks the profile document
  // (including a change made in another tab); a touched one holds the edit.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [localeDraft, setLocaleDraft] = useState<Locale | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = nameDraft ?? profile?.displayName ?? "";
  const locale = localeDraft ?? profile?.locale ?? "en";

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateUserProfile(user.uid, {
        displayName: displayName.trim() || null,
        locale,
      });
      // Drop the drafts so the fields resume tracking the saved profile.
      setNameDraft(null);
      setLocaleDraft(null);
      toast.success("Profile updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    profile != null &&
    (displayName.trim() !== (profile.displayName ?? "") || locale !== profile.locale);

  return (
    <div className="max-w-[560px] space-y-6">
      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="flex items-center gap-4">
          <Avatar
            src={profile?.photoURL ?? user?.photoURL}
            name={displayName || user?.email}
            size={56}
          />
          <div className="min-w-0">
            <p className="text-[15px] font-medium truncate">
              {displayName || "Your name"}
            </p>
            <p className="text-[13px] text-[var(--muted)] truncate">{user?.email}</p>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setNameDraft(e.target.value)}
            maxLength={80}
            hint="Shown to a counsellor when you book a session."
          />

          <Select
            label="Preferred language"
            value={locale}
            onChange={(e) => setLocaleDraft(e.target.value as Locale)}
            options={LOCALE_OPTIONS}
            hint="Used to suggest counsellors who work in your language."
          />
        </div>

        {error ? (
          <Alert tone="warning" className="mt-5">
            {error}
          </Alert>
        ) : null}

        <div className="mt-8">
          <Button onClick={save} loading={saving} disabled={!dirty || saving} withArrow={false}>
            Save changes
          </Button>
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Account
        </p>
        <dl className="mt-5 space-y-4 text-[14px]">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted)]">Email</dt>
            <dd className="truncate">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted)]">Role</dt>
            <dd className="capitalize">{profile?.role?.replace("_", " ") ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted)]">Member since</dt>
            <dd>
              {profile
                ? new Date(profile.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
          {profile?.role === "counsellor" ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--muted)]">Verification</dt>
              <dd>
                <Badge tone={profile.verified ? "positive" : "warning"}>
                  {profile.verified ? "Verified" : "Pending"}
                </Badge>
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}
