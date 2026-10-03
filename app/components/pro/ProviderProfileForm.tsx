"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import {
  SERVICES,
  SERVICE_LABELS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  TOWNS_BY_AREA,
  AREA_LABELS,
  townLabel,
  type Service,
  type Specialization,
} from "@/lib/matching";
import { LOCALE_LABELS, type Locale, type ProviderProfile } from "@/lib/models";
import { getOwnProviderProfile, saveProviderProfile } from "@/lib/providers";
import { toMajor, toMinor } from "@/lib/money";

/**
 * A provider's own listing — the thing that decides whether anybody can find
 * them.
 *
 * Every field here is matched against what someone told Talk they needed, so
 * the form says what each one is FOR rather than just naming it. A provider
 * who leaves languages blank is not making a tidy profile; they are making
 * themselves invisible to everyone who asked to be spoken to in Wolof.
 *
 * `status` is not on this form and cannot be. firestore.rules permits a
 * provider to create their profile only as draft or pending, and permits an
 * update only when the status is unchanged — so nobody lists themselves as
 * verified. What that word means to a patient is that somebody checked.
 */

const LANGUAGE_OPTIONS = (Object.keys(LOCALE_LABELS) as Locale[]).filter(
  // The four Talk actually speaks. The locale list is wider.
  (l) => ["en", "wo", "mnk", "ff"].includes(l),
);

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

/** A row of toggles. Used for everything a provider can pick more than one of. */
function Choices<T extends string>({
  legend,
  hint,
  values,
  labels,
  selected,
  onChange,
}: {
  legend: string;
  hint: string;
  values: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium">{legend}</legend>
      <p className="mt-1 text-[12px] text-[var(--muted)] leading-relaxed">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() =>
                onChange(on ? selected.filter((v) => v !== value) : [...selected, value])
              }
              aria-pressed={on}
              className={`rounded-full px-3.5 py-2 text-[12.5px] transition-colors ${
                on
                  ? "bg-[var(--dark)] text-white"
                  : "bg-white text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {labels[value]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** What the person reading this needs to know about where their listing stands. */
function StatusNote({ profile }: { profile: ProviderProfile | null }) {
  if (!profile) {
    return (
      <Alert tone="info" title="Your profile is not live">
        Nobody can find you until this is filled in and checked. It usually takes
        a day or two once you have saved it.
      </Alert>
    );
  }
  if (profile.status === "verified") {
    return (
      <Alert tone="success" title="Your profile is live">
        People looking for support can find you, and Talk can suggest you to
        someone whose needs match what you offer.
      </Alert>
    );
  }
  if (profile.status === "suspended") {
    return (
      <Alert tone="warning" title="Your profile is not being shown">
        It has been taken out of the directory. Talk to us before changing
        anything here.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Waiting to be checked">
      You can keep editing while we check it. Saving again does not put you back
      at the end of the queue.
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
  const [services, setServices] = useState<Service[]>([]);
  const [languages, setLanguages] = useState<Locale[]>([]);
  const [focus, setFocus] = useState<Specialization[]>([]);
  const [qualifications, setQualifications] = useState("");
  const [years, setYears] = useState("");
  const [rate, setRate] = useState("");
  const [gender, setGender] = useState("");
  const [town, setTown] = useState("");

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
          setServices(found.services);
          setLanguages(found.languages);
          setFocus(found.specializations as Specialization[]);
          setQualifications(found.qualifications.join("\n"));
          setYears(String(found.yearsExperience || ""));
          setRate(String(toMajor(found.sessionRateMinor) || ""));
          setGender(found.gender ?? "");
          setTown(found.location ?? "");
        } else {
          // Their own name is the one thing we already know.
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
    if (services.length === 0) missing.push("at least one service");
    if (languages.length === 0) missing.push("the languages you work in");
    const rateMajor = Number(rate);
    if (!Number.isFinite(rateMajor) || rateMajor <= 0) missing.push("your fee per session");

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
        services,
        languages,
        specializations: focus,
        qualifications: qualifications.split("\n"),
        yearsExperience: Math.max(0, Math.round(Number(years) || 0)),
        sessionRateMinor: toMinor(rateMajor),
        gender: gender === "woman" || gender === "man" ? gender : null,
        location: town || null,
      });

      const saved = await getOwnProviderProfile(uid);
      setExisting(saved);
      toast.success(existing ? "Profile saved" : "Profile sent for checking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }, [
    uid, displayName, headline, bio, services, languages, focus,
    qualifications, years, rate, gender, town, existing, toast,
  ]);

  // The gate lets any signed-in person reach this URL; only a provider has a
  // listing. Said plainly rather than redirected, so a patient who followed a
  // stale link is not bounced somewhere mysterious.
  if (account && account.role !== "provider") {
    return (
      <Alert tone="info" title="This page is for providers">
        Your account is set up as someone looking for support. If you offer
        therapy or counselling and want to be listed, talk to us and we will
        change it over.
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

  return (
    <div className="max-w-[640px] space-y-6">
      <StatusNote profile={existing} />

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-5">
          <Input
            label="Your name"
            hint="As you want it to appear to someone looking for help."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="One line about what you offer"
            hint="The first thing anyone reads. Plain words beat credentials here."
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
          />
          <Textarea
            label="About you"
            hint="A short paragraph. What it is like to talk to you matters more than where you studied."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={6}
          />
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-7">
          <Choices
            legend="What you offer"
            hint="Matched directly against what someone asks Talk for."
            values={SERVICES}
            labels={SERVICE_LABELS}
            selected={services}
            onChange={setServices}
          />
          <Choices
            legend="Languages you work in"
            hint="The heaviest part of matching. Someone who speaks only Wolof will not be shown a provider who does not."
            values={LANGUAGE_OPTIONS}
            labels={LOCALE_LABELS}
            selected={languages}
            onChange={setLanguages}
          />
          <Choices
            legend="What you work with"
            hint="Pick what you genuinely have experience in — these decide who is sent to you."
            values={SPECIALIZATIONS}
            labels={SPECIALIZATION_LABELS}
            selected={focus}
            onChange={setFocus}
          />
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <div className="space-y-5">
          <Select
            label="Where you are"
            hint="Used to put you in front of people near you. Sessions still happen by video."
            options={TOWN_OPTIONS}
            value={town}
            onChange={(e) => setTown(e.target.value)}
          />
          <Select
            label="Your gender"
            hint="Shown because many people ask for a woman or a man, and it is the one preference we honour exactly."
            options={GENDER_OPTIONS}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          />
          <Input
            label="Years of experience"
            type="number"
            min={0}
            max={60}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
          <Input
            label="Fee per session, in Dalasi"
            hint="What one session with you costs. Talk's own D200 consultation is separate from this."
            type="number"
            min={0}
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Textarea
            label="Qualifications"
            hint="One per line. These are shown on your profile and checked before you go live."
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            rows={4}
          />
        </div>
      </Card>

      {error ? (
        <Alert tone="warning" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : existing ? "Save changes" : "Send for checking"}
        </Button>
        <p className="text-[12px] text-[var(--muted)] leading-relaxed">
          Sessions happen by video inside Talk.
        </p>
      </div>
    </div>
  );
}
