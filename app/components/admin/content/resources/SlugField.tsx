"use client";

import { useId } from "react";
import Button from "@/components/ui/Button";
import { SLUG_MAX, slugify } from "@/lib/content/resources";
import FieldShell, { Counter } from "../fields/FieldShell";
import { useForm } from "../fields/context";

/**
 * An article's web address: /resources/ shown in front, the rest typed —
 * small letters and dashes, as the address bar will show it. Spaces become
 * dashes as they are typed, and capitals small letters.
 */
export default function SlugField({
  value,
  title,
  live,
  onChange,
}: {
  value: string;
  /** The article's title, to make the address from. */
  title: string;
  /** Published at this address: changing it moves the article. */
  live: boolean;
  onChange: (next: string) => void;
}) {
  const { problem, touch } = useForm();
  const id = useId();
  const issue = problem("slug");
  const suggested = slugify(title);
  const help = live
    ? "Changing it moves the article: links people have saved to the old address stop working."
    : "Made from the title until you change it.";

  return (
    <FieldShell
      label="Web address"
      htmlFor={id}
      help={help}
      helpId={`${id}-help`}
      problem={issue}
      problemId={`${id}-problem`}
      aside={<Counter value={value} max={SLUG_MAX} id={`${id}-count`} />}
    >
      <div
        className={`flex h-12 min-w-0 items-center rounded-2xl border bg-[var(--background)] transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent)]/10 ${
          issue ? "border-[var(--danger)]" : "border-[var(--dark)]/15"
        }`}
      >
        <span aria-hidden className="flex h-full shrink-0 items-center border-r border-[var(--dark)]/10 pl-4 pr-2 text-[13.5px] text-[var(--muted)]">
          /resources/
        </span>
        <input
          id={id}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          aria-invalid={issue ? true : undefined}
          aria-describedby={`${issue ? `${id}-problem` : `${id}-help`} ${id}-count`}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          onBlur={() => touch("slug")}
          className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent px-3 text-[14px] outline-none"
        />
      </div>
      {suggested && suggested !== value ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => {
            onChange(suggested);
            touch("slug");
          }}
        >
          Make it from the title
        </Button>
      ) : null}
    </FieldShell>
  );
}
