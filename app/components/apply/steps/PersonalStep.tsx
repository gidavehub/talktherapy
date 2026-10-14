"use client";

import { useState } from "react";
import { Input } from "../../ui/Input";
import { Dropdown } from "../../ui/Dropdown";
import { BirthDate, ChoiceCards, PhoneField } from "../fields";
import { AREAS, AREA_LABELS, TOWNS_BY_AREA, townLabel, type Area } from "@/lib/matching";
import {
  APPLICANT_GENDERS,
  APPLICANT_GENDER_LABELS,
  gambianPhone,
  type ApplicantGender,
  type PersonalSection,
} from "@/lib/providerApplication";
import type { StepProps } from "./types";

const OTHER = "__other";

export default function PersonalStep({ value, onChange, problems, now }: StepProps<"personal">) {
  const set = <K extends keyof PersonalSection>(key: K, next: PersonalSection[K]) => onChange({ ...value, [key]: next });

  const towns = TOWNS_BY_AREA.find((t) => t.area === value.area)?.towns ?? [];
  const knownTown = towns.includes(value.town.toLowerCase());
  // "Somewhere else" chosen, with nothing typed yet, still shows the box.
  const [typing, setTyping] = useState(false);
  const freeText = value.area === "outside" || typing || (value.town !== "" && !knownTown);

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Input
          label="Your full legal name"
          hint="As it is on your ID. Only staff see this."
          autoComplete="name"
          value={value.legalName}
          onChange={(e) => set("legalName", e.target.value)}
          error={problems.legalName}
          required
        />
        <Input
          label="The name people see"
          hint="How you will appear on TALK — for example, Awa Ceesay."
          value={value.displayName}
          onChange={(e) => set("displayName", e.target.value)}
          error={problems.displayName}
          required
        />
      </div>

      <ChoiceCards<ApplicantGender>
        legend="You are"
        hint="Many people ask to see a woman, or a man. This is how TALK can offer them that."
        options={APPLICANT_GENDERS.map((g) => ({ value: g, label: APPLICANT_GENDER_LABELS[g] }))}
        value={value.gender ? [value.gender] : []}
        onChange={(next) => set("gender", next[0] ?? null)}
        columns={3}
        error={problems.gender}
      />

      <BirthDate value={value.dateOfBirth} onChange={(next) => set("dateOfBirth", next)} error={problems.dateOfBirth} now={now} />

      <PhoneField
        label="Mobile number"
        hint="So we can reach you about your application. Never shown to anyone you support."
        value={value.phone}
        onChange={(typed) => set("phone", gambianPhone(typed) ?? typed)}
        error={problems.phone}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Dropdown<Area>
          label="Where you are based"
          placeholder="Choose a region"
          value={value.area}
          onChange={(area) => {
            setTyping(false);
            onChange({ ...value, area, town: "" });
          }}
          options={AREAS.map((a) => ({ value: a, label: AREA_LABELS[a] }))}
          error={problems.area}
          required
        />
        {value.area && !freeText ? (
          <Dropdown<string>
            label="Town"
            placeholder="Choose a town"
            searchable
            searchPlaceholder="Type to find your town"
            value={knownTown ? value.town.toLowerCase() : null}
            onChange={(town) => {
              if (town === OTHER) {
                setTyping(true);
                set("town", "");
              } else set("town", town);
            }}
            options={[
              ...towns.map((t) => ({ value: t, label: townLabel(t) })),
              { value: OTHER, label: "Somewhere else", description: "Type the name of your town" },
            ]}
            error={problems.town}
            required
          />
        ) : value.area ? (
          <Input
            label="Town"
            hint={value.area === "outside" ? "Where you live now." : "The town or area you are in."}
            value={value.town}
            onChange={(e) => set("town", e.target.value)}
            error={problems.town}
            required
          />
        ) : null}
      </div>
    </div>
  );
}
