"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Input } from "../../ui/Input";
import { SPRING_SOFT } from "../../motion/primitives";
import { AGREEMENTS, checkAgreements, type AgreementId } from "@/lib/providerApplication";
import type { StepProps } from "./types";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function AgreementsStep({ value, onChange, problems, draft, now }: StepProps<"agreements">) {
  const [open, setOpen] = useState<AgreementId | null>(null);
  const legalName = draft.personal.legalName;

  /** Keeps the signature's date honest: stamped when it becomes valid, cleared when it stops being. */
  function commit(next: typeof value) {
    const valid = Object.keys(checkAgreements({ ...next, signedAt: 1 }, legalName)).length === 0;
    // `now` is the page's clock (to the minute), which is all a signature's date needs.
    onChange({ ...next, signedAt: valid ? (value.signedAt ?? now) : null });
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {AGREEMENTS.map((agreement) => {
          const accepted = value.accepted[agreement.id] === true;
          const expanded = open === agreement.id;
          return (
            <li
              key={agreement.id}
              className={`rounded-[22px] border transition-colors ${
                accepted ? "border-[var(--sage)]/50 bg-[var(--sage-pale)]/50" : problems[agreement.id] ? "border-[var(--accent)]" : "border-[var(--dark)]/10 bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                {/* A 44-pixel target around a 28-pixel circle: easy to hit,
                    and the ring shows where keyboard focus is. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={accepted}
                  aria-label={`I agree: ${agreement.title}`}
                  onClick={() => commit({ ...value, accepted: { ...value.accepted, [agreement.id]: !accepted } })}
                  className="group -m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none"
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] transition-colors group-focus-visible:ring-4 group-focus-visible:ring-[var(--accent)]/15 ${
                      accepted ? "border-[var(--sage)] bg-[var(--sage)] text-white" : "border-[var(--dark)]/30 bg-[var(--surface)]"
                    }`}
                  >
                    {accepted ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" aria-hidden>
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : null}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[19px] font-medium leading-snug">{agreement.title}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{agreement.summary}</p>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : agreement.id)}
                    className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--accent-deep)] underline-offset-4 hover:underline"
                  >
                    {expanded ? "Hide the detail" : "Read it in full"}
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING_SOFT}
                        className="overflow-hidden"
                      >
                        {agreement.body.map((line) => (
                          <li key={line} className="mt-3 flex gap-3 text-[13.5px] leading-relaxed">
                            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                            {line}
                          </li>
                        ))}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                  {problems[agreement.id] ? (
                    <p className="mt-2 text-[12.5px] text-[var(--accent)]">{problems[agreement.id]}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-[24px] bg-[var(--background)] p-6">
        <Input
          label="Sign with your full name"
          hint={legalName ? `Type it exactly as on the first step: ${legalName}.` : "Fill in your legal name on the first step first."}
          value={value.signature}
          autoComplete="name"
          onChange={(e) => commit({ ...value, signature: e.target.value })}
          error={problems.signature}
        />
        {value.signedAt ? (
          <p className="mt-5 border-t border-dashed border-[var(--dark)]/20 pt-4 font-display text-[22px] italic text-[var(--sage-deep)]">
            Signed, {value.signature.trim()} <span className="text-[14px] not-italic text-[var(--muted)]">· {formatDate(value.signedAt)}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
