"use client";

import { useId, useState } from "react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { checkHref } from "@/lib/content/links";
import type { LinkField, LinkValue } from "@/lib/content/schema";
import FieldShell, { CONTROL, CONTROL_INVALID, Counter, LABEL } from "./FieldShell";
import { useForm } from "./context";

/**
 * A button or link: its words, and where it goes — chosen from the site's
 * pages, or typed as an address when it is somewhere else.
 */

const OTHER = "__other";

/** The public pages, by the names staff know them by. */
const PAGES: DropdownOption<string>[] = [
  { value: "/", label: "Home" },
  { value: "/providers", label: "Providers" },
  { value: "/how-it-works", label: "How it works" },
  { value: "/plans", label: "Pricing" },
  { value: "/resources", label: "Resources" },
  { value: "/about", label: "About" },
  { value: "/safety", label: "Safety & ethics" },
  { value: "/technology", label: "Technology" },
  { value: "/community", label: "Community" },
  { value: "/for-providers", label: "For providers" },
  { value: "/apply", label: "Apply as a provider" },
  { value: "/for-institutions", label: "For institutions" },
  { value: "/support", label: "Support" },
  { value: "/support?intent=organisation", label: "Support, for organisations" },
  { value: "/sign-up", label: "Create an account" },
  { value: "/crisis", label: "Emergency contacts" },
  { value: "/privacy", label: "Privacy policy" },
  { value: "/terms", label: "Terms of service" },
  { value: OTHER, label: "Another address…", description: "A section (#…) or another website (https://…)" },
];

const KNOWN = new Set(PAGES.map((p) => p.value));

export default function LinkControl({
  field,
  value,
  onChange,
  fieldKey,
}: {
  field: LinkField;
  value: LinkValue;
  onChange: (next: LinkValue) => void;
  fieldKey: string;
}) {
  const { problem, touch } = useForm();
  const id = useId();
  // Typing an address is a choice that sticks, even while the address
  // typed so far happens to be one of the pages.
  const [typing, setTyping] = useState(() => !KNOWN.has(value.href));
  const issue = problem(fieldKey);
  // The field has one problem at a time, about the words or the address:
  // it is said under the one it is about.
  const hrefIssue = issue && issue === checkHref(value.href.trim()) ? issue : null;
  const labelIssue = issue && !hrefIssue ? issue : null;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="rounded-[22px] border border-[var(--dark)]/10 bg-[var(--background)]/60 p-4">
      <p id={`${id}-label`} className={LABEL}>
        {field.label}
      </p>
      {field.help ? <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{field.help}</p> : null}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <FieldShell
          label="Words"
          htmlFor={`${id}-words`}
          problem={labelIssue}
          problemId={`${id}-words-problem`}
          aside={<Counter value={value.label} max={field.maxLabel} />}
        >
          <input
            id={`${id}-words`}
            type="text"
            value={value.label}
            aria-invalid={labelIssue ? true : undefined}
            aria-describedby={labelIssue ? `${id}-words-problem` : undefined}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            onBlur={() => touch(fieldKey)}
            className={`${CONTROL} h-12 ${labelIssue ? CONTROL_INVALID : ""}`}
          />
        </FieldShell>
        <Dropdown
          label="Goes to"
          options={PAGES}
          value={typing ? OTHER : value.href}
          searchable
          searchPlaceholder="Find a page"
          error={typing ? null : hrefIssue}
          onChange={(next) => {
            if (next === OTHER) {
              setTyping(true);
              onChange({ ...value, href: KNOWN.has(value.href) ? "https://" : value.href });
            } else {
              setTyping(false);
              onChange({ ...value, href: next });
              touch(fieldKey);
            }
          }}
        />
      </div>
      {typing ? (
        <FieldShell
          className="mt-4"
          label="Address"
          htmlFor={`${id}-href`}
          help="A page here starts with /, a section of this page with #, another website with https://."
          helpId={`${id}-href-help`}
          problem={hrefIssue ?? null}
          problemId={`${id}-href-problem`}
        >
          <input
            id={`${id}-href`}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            value={value.href}
            aria-invalid={hrefIssue ? true : undefined}
            aria-describedby={hrefIssue ? `${id}-href-problem` : `${id}-href-help`}
            onChange={(e) => onChange({ ...value, href: e.target.value })}
            onBlur={() => touch(fieldKey)}
            className={`${CONTROL} h-12 font-mono text-[13px] ${hrefIssue ? CONTROL_INVALID : ""}`}
          />
        </FieldShell>
      ) : null}
    </div>
  );
}
