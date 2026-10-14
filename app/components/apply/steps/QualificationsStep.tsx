"use client";

import { AnimatePresence, motion } from "motion/react";
import { Input } from "../../ui/Input";
import { Dropdown } from "../../ui/Dropdown";
import Button from "../../ui/Button";
import { IconTrash } from "../../ui/icons";
import { SPRING_SOFT } from "../../motion/primitives";
import { newId } from "@/lib/providerApplication-client";
import type { Qualification } from "@/lib/providerApplication";
import type { StepProps } from "./types";

const MAX = 8;

export default function QualificationsStep({ value, onChange, problems, now }: StepProps<"qualifications">) {
  const thisYear = new Date(now).getUTCFullYear();
  const years = Array.from({ length: thisYear - 1950 + 1 }, (_, i) => String(thisYear - i));

  const update = (index: number, patch: Partial<Qualification>) =>
    onChange(value.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const add = () =>
    onChange([...value, { id: newId("q"), title: "", institution: "", year: null, country: "The Gambia" }]);
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index), { immediate: true });

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {value.map((q, i) => (
          <motion.div
            key={q.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={SPRING_SOFT}
            className="rounded-[22px] border border-[var(--dark)]/10 bg-[var(--background)] p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--sage)]">Qualification {i + 1}</p>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove qualification ${i + 1}`}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--sand)] hover:text-[var(--danger)]"
              >
                <IconTrash size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Qualification"
                placeholder="For example, BSc Psychology"
                value={q.title}
                onChange={(e) => update(i, { title: e.target.value })}
                error={problems[`${i}.title`]}
                required
              />
              <Input
                label="Where you studied"
                placeholder="For example, University of The Gambia"
                value={q.institution}
                onChange={(e) => update(i, { institution: e.target.value })}
                error={problems[`${i}.institution`]}
                required
              />
              <Dropdown
                label="Year finished"
                placeholder="Choose a year"
                searchable
                searchPlaceholder="Type a year"
                value={q.year ? String(q.year) : null}
                onChange={(year) => update(i, { year: Number(year) })}
                options={years.map((y) => ({ value: y, label: y }))}
                error={problems[`${i}.year`]}
                required
              />
              <Input
                label="Country"
                value={q.country}
                onChange={(e) => update(i, { country: e.target.value })}
                error={problems[`${i}.country`]}
                required
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {value.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[var(--dark)]/20 px-6 py-10 text-center">
          <p className="font-display text-[20px]">No qualifications yet.</p>
          <p className="mx-auto mt-2 max-w-[360px] text-[13.5px] leading-relaxed text-[var(--muted)]">
            Add each degree, diploma or certificate that qualifies you for this work. You will upload the certificates on the
            Documents step.
          </p>
        </div>
      ) : null}

      {problems.list ? (
        <p role="alert" className="text-[13px] text-[var(--accent)]">
          {problems.list}
        </p>
      ) : null}

      {value.length < MAX ? (
        <Button variant="secondary" onClick={add}>
          {value.length === 0 ? "Add a qualification" : "Add another"}
        </Button>
      ) : (
        <p className="text-[12.5px] text-[var(--muted)]">That is the most one application can hold.</p>
      )}
    </div>
  );
}
