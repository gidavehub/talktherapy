"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { CharCount, Slider, ToggleChips } from "@/components/apply/fields";
import {
  SERVICE_LABELS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  TOWNS_BY_AREA,
  AREA_LABELS,
  townLabel,
  type Specialization,
} from "@/lib/matching";
import { HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR, LOCALE_LABELS, type Locale, type ProviderProfile } from "@/lib/models";
import { getOwnProviderProfile, saveProviderProfile, uploadProviderPhoto } from "@/lib/providers";
import ProviderAvatar from "@/components/providers/ProviderAvatar";
import { formatDalasi, formatDalasiRange, providerPayoutMinor } from "@/lib/money";
import { BIO_MAX, HEADLINE_MAX } from "@/lib/providerApplication";
import { SESSION_MINUTES } from "@/lib/booking";

/**
 * A provider's own listing, once they are approved — the thing that decides
 * whether anybody can find them.
 *
 * Every field here is matched against what someone told TALK they needed, so
 * the form says what each one is FOR rather than just naming it. A provider
 * who leaves languages blank is not making a tidy profile; they are making
 * themselves invisible to everyone who asked to be spoken to in Wolof.
 *
 * What was checked when they were approved — the kinds of support they offer
 * and the qualifications behind it — is shown here but not editable:
 * firestore.rules keeps it as review left it. Changing it is a conversation
 * with staff, not a form field.
 */

const LANGUAGE_OPTIONS: Locale[] = ["en", "wo", "mnk", "ff"];

const TOWN_OPTIONS = [
  { value: "", label: "Not saying" },
  ...TOWNS_BY_AREA.flatMap(({ area, towns }) =>
    towns.map((town) => ({ value: town, label: `${townLabel(town)} — ${AREA_LABELS[area]}` })),
  ),
];

const GENDER_OPTIONS = [
  { value: "", label: "Rather not say" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
];

const FEE_STEP = 50_00;

/** What the person reading this needs to know about where their listing stands. */
function StatusNote({ profile }: { profile: ProviderProfile | null }) {
  if (!profile) {
    return (
      <Alert tone="info" title="Your profile is made when you are approved">
        Once your application is approved, your listing appears here for you to keep up to date.
      </Alert>
    );
  }
  if (profile.status === "verified") {
    return (
      <Alert tone="success" title="Your profile is live">
        People looking for support can find you, and TALK can suggest you to someone whose needs match what you offer.
      </Alert>
    );
  }
  if (profile.status === "suspended") {
    return (
      <Alert tone="warning" title="Your profile is not being shown">
        It has been taken out of the directory. Write to us before changing anything here.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Waiting to be checked">
      Your profile goes live when your application is approved.
    </Alert>
  );
}

export default function ProviderProfileForm() {
  const { user, profile: account } = useAuth();
  const toast = useToast();

  const [existing, setExisting] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState<Locale[]>([]);
  const [focus, setFocus] = useState<Specialization[]>([]);
  const [years, setYears] = useState("");
  const [rateMinor, setRateMinor] = useState<number>(HUMAN_RATE_MIN_MINOR);
  const [gender, setGender] = useState("");
  const [town, setTown] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    getOwnProviderProfile(uid)
      .then((found) => {
        if (cancelled) return;
        setExisting(found);
        if (found) {
          setDisplayName(found.displayName);
          setHeadline(found.headline);
          setBio(found.bio);
          setLanguages(found.languages);
          setFocus(found.specializations as Specialization[]);
          setYears(String(found.yearsExperience || ""));
          setRateMinor(
            Math.min(HUMAN_RATE_MAX_MINOR, Math.max(HUMAN_RATE_MIN_MINOR, found.sessionRateMinor || HUMAN_RATE_MIN_MINOR)),
          );
          setGender(found.gender ?? "");
          setTown(found.location ?? "");
          setPhotoPath(found.photoPath);
        } else {
          setDisplayName(account?.displayName ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your profile. Reload and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, account?.displayName]);

  const save = useCallback(async () => {
    if (!uid) return;

    // Checked here rather than with `required` so the message can say why it
    // matters, and so the whole form is validated at once instead of stopping
    // at the first empty box.
    const missing: string[] = [];
    if (!displayName.trim()) missing.push("your name");
    if (!headline.trim()) missing.push("a line about what you offer");
    if (languages.length === 0) missing.push("the languages you work in");
    if (rateMinor < HUMAN_RATE_MIN_MINOR || rateMinor > HUMAN_RATE_MAX_MINOR)
      missing.push(`a fee between ${formatDalasiRange(HUMAN_RATE_MIN_MINOR, HUMAN_RATE_MAX_MINOR)}`);

    if (missing.length > 0) {
      setError(`Still needed: ${missing.join(", ")}.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveProviderProfile(uid, {
        displayName,
        headline,
        bio,
        languages,
        specializations: focus,
        yearsExperience: Math.max(0, Math.round(Number(years) || 0)),
        sessionRateMinor: rateMinor,
        gender: gender === "woman" || gender === "man" ? gender : null,
        location: town || null,
        photoPath,
      });

      setExisting(await getOwnProviderProfile(uid));
      toast.success("Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }, [uid, displayName, headline, bio, languages, focus, years, rateMinor, gender, town, photoPath, toast]);

  /**
   * Their photo.
   *
   * Uploaded immediately rather than held until Save, so they see the result
   * straight away and a failed upload is reported on its own instead of taking
   * the whole form down with it. It is still only recorded on the profile when
   * they save.
   */
  const choosePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file || !uid) return;
      setUploading(true);
      setError(null);
      try {
        setPhotoPath(await uploadProviderPhoto(uid, file));
      } catch {
        setError("That photo did not upload. Check your connection and try again.");
      } finally {
        setUploading(false);
      }
    },
    [uid],
  );

  // The gate lets any signed-in person reach this URL; only a provider has a
  // listing. Said plainly rather than redirected, so a patient who followed a
  // stale link is not bounced somewhere mysterious.
  if (account && account.role !== "provider") {
    return (
      <Alert tone="info" title="This page is for providers">
        Your account is set up as someone looking for support. Providers apply to join TALK at talktherapy.gm/apply,
        with an account of their own.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-[var(--muted)]">
        <Spinner />
      </div>
    );
  }

  if (!existing) {
    return (
      <div className="max-w-[640px]">
        <StatusNote profile={null} />
      </div>
    );
  }

  return (
    <div className="max-w-[680px] space-y-6">
      <StatusNote profile={existing} />

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-5">
          {/*
            A face is the first thing anyone decides on, and until now every
            provider in the product was a pair of initials.
          */}
          <div className="flex items-center gap-4">
            <ProviderAvatar photoPath={photoPath} name={displayName} size={72} />
            <div className="min-w-0">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-full bg-[var(--background)] px-4 text-[12.5px] transition-colors hover:bg-[var(--dark)]/[.06]">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    void choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {uploading ? "Uploading…" : photoPath ? "Change photo" : "Add a photo"}
              </label>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
                Face to the camera, eyes open, plain background.
              </p>
            </div>
          </div>

          <Input
            label="Your name"
            hint="As you want it to appear to someone looking for help."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div>
            <Input
              label="One line about what you offer"
              hint="The first thing anyone reads. Plain words beat credentials here."
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={HEADLINE_MAX + 20}
            />
            <CharCount value={headline} max={HEADLINE_MAX} />
          </div>
          <div>
            <Textarea
              label="About you"
              hint="A short paragraph. What it is like to talk to you matters more than where you studied."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={6}
            />
            <CharCount value={bio} max={BIO_MAX} />
          </div>
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-7">
          <div>
            <p className="block text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]">What you offer</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Checked when you were approved. To change it, write to us through support.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {existing.services.map((s) => (
                <span key={s} className="rounded-full bg-[var(--sage-pale)] px-3.5 py-1.5 text-[12.5px] text-[var(--sage-deep)]">
                  {SERVICE_LABELS[s]}
                </span>
              ))}
            </div>
          </div>
          <ToggleChips<Locale>
            legend="Languages you work in"
            hint="The heaviest part of matching. Someone who asks for Wolof sees the providers who speak it first."
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
            value={languages}
            onChange={setLanguages}
          />
          <ToggleChips<Specialization>
            legend="What you work with"
            hint="Pick what you genuinely have experience in — these decide who is sent to you."
            options={SPECIALIZATIONS.map((s) => ({ value: s, label: SPECIALIZATION_LABELS[s] }))}
            value={focus}
            onChange={setFocus}
            max={8}
          />
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Dropdown
              label="Where you are"
              hint="Puts you in front of people near you. Sessions still happen online."
              searchable
              searchPlaceholder="Type to find your town"
              options={TOWN_OPTIONS}
              value={town}
              onChange={setTown}
            />
            <Dropdown
              label="Your gender"
              hint="Many people ask for a woman or a man."
              options={GENDER_OPTIONS}
              value={gender}
              onChange={setGender}
            />
          </div>
          <Input
            label="Years of experience"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
          <div>
            <p className="block text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]">Fee per session</p>
            <p className="font-display mt-2 text-[40px] font-medium leading-none">{formatDalasi(rateMinor)}</p>
            <Slider
              label="Fee per session"
              value={rateMinor}
              min={HUMAN_RATE_MIN_MINOR}
              max={HUMAN_RATE_MAX_MINOR}
              step={FEE_STEP}
              onChange={setRateMinor}
              format={(v) => formatDalasi(v)}
            />
            <p className="text-[12.5px] text-[var(--muted)]">
              You receive {formatDalasi(providerPayoutMinor(rateMinor))} of each session. A first conversation with TALK is
              paid for separately.
            </p>
          </div>
          <div>
            <p className="block text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]">Qualifications</p>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">Checked when you were approved.</p>
            <ul className="mt-3 space-y-1.5 text-[14px]">
              {existing.qualifications.map((q) => (
                <li key={q} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {error ? (
        <Alert tone="warning" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} loading={saving}>
          Save changes
        </Button>
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          Sessions are {SESSION_MINUTES} minutes, by video or voice call, inside TALK.
        </p>
      </div>
    </div>
  );
}
