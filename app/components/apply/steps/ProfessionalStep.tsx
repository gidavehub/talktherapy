"use client";

import { Input } from "../../ui/Input";
import { ChoiceCards, ToggleChips } from "../fields";
import {
  SERVICES,
  SERVICE_BLURBS,
  SERVICE_LABELS,
  SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  type Service,
  type Specialization,
} from "@/lib/matching";
import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  APPLICATION_FORMATS,
  APPLICATION_FORMAT_LABELS,
  APPLICATION_LANGUAGES,
  LOCALE_LABELS,
  type AgeGroup,
  type ApplicationFormat,
  type ProfessionalSection,
} from "@/lib/providerApplication";
import type { Locale } from "@/lib/models";
import type { StepProps } from "./types";

const FORMAT_BLURBS: Record<ApplicationFormat, string> = {
  video: "Face to face, on screen, inside TALK.",
  voice: "Just voices — easier on a weak connection, and for people who would rather not be seen.",
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + ".";

export default function ProfessionalStep({ value, onChange, problems }: StepProps<"professional">) {
  const set = <K extends keyof ProfessionalSection>(key: K, next: ProfessionalSection[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-8">
      <ChoiceCards<Service>
        legend="The support you offer"
        hint="Choose every kind you are trained for. People ask TALK for help of a kind, and this is what they are matched on."
        options={SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s], description: sentence(SERVICE_BLURBS[s]) }))}
        value={value.services}
        onChange={(next) => set("services", next)}
        multiple
        error={problems.services}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Input
          label="Years of experience"
          hint="Since you qualified, in whole years."
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          value={value.yearsExperience ?? ""}
          onChange={(e) => set("yearsExperience", e.target.value === "" ? null : Math.round(Number(e.target.value)))}
          error={problems.yearsExperience}
          required
        />
        <Input
          label="Where you work now"
          hint="A hospital, a clinic, an organisation — or in private practice."
          value={value.workplace}
          onChange={(e) => set("workplace", e.target.value)}
          error={problems.workplace}
        />
        <Input
          label="Professional body"
          hint="If you are registered with one. Leave blank if not."
          value={value.registrationBody}
          onChange={(e) => set("registrationBody", e.target.value)}
          error={problems.registrationBody}
        />
        <Input
          label="Registration number"
          hint="We check it with the body you named."
          value={value.registrationNumber}
          onChange={(e) => set("registrationNumber", e.target.value)}
          error={problems.registrationNumber}
        />
      </div>

      <ToggleChips<Specialization>
        legend="What you work with"
        hint="Up to eight — the things you genuinely know best. These decide who TALK sends to you."
        options={SPECIALIZATIONS.map((s) => ({ value: s, label: SPECIALIZATION_LABELS[s] }))}
        value={value.specializations}
        onChange={(next) => set("specializations", next)}
        max={8}
        error={problems.specializations}
      />

      <ToggleChips<AgeGroup>
        legend="Who you work with"
        hint="Anyone under 18 is flagged to you before you meet them."
        options={AGE_GROUPS.map((g) => ({ value: g, label: AGE_GROUP_LABELS[g] }))}
        value={value.ageGroups}
        onChange={(next) => set("ageGroups", next)}
        error={problems.ageGroups}
      />

      <ChoiceCards<ApplicationFormat>
        legend="How you meet people"
        options={APPLICATION_FORMATS.map((f) => ({
          value: f,
          label: APPLICATION_FORMAT_LABELS[f],
          description: FORMAT_BLURBS[f],
        }))}
        value={value.formats}
        onChange={(next) => set("formats", next)}
        multiple
        error={problems.formats}
      />

      <div className="space-y-4">
        <ToggleChips<Locale>
          legend="Languages you work in"
          hint="The most important part of matching. Someone who asks for Wolof sees the providers who speak it first."
          options={APPLICATION_LANGUAGES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
          value={value.languages}
          onChange={(next) => set("languages", next)}
          error={problems.languages}
        />
        <Input
          label="Any other languages"
          hint="Jola, Serahule, Serer, Arabic… So our team knows, and can tell people who ask."
          value={value.otherLanguages}
          onChange={(e) => set("otherLanguages", e.target.value)}
          error={problems.otherLanguages}
        />
      </div>
    </div>
  );
}
