"use client";

import { useId, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Tooltip from "@/components/ui/Tooltip";
import { Input } from "@/components/ui/Input";
import RichText from "@/lib/content/richText";
import { checkHref } from "@/lib/content/links";
import type { RichTextField } from "@/lib/content/schema";
import { fillTokens } from "@/lib/content/tokens";
import FieldShell, { CONTROL, CONTROL_INVALID, Counter } from "./FieldShell";
import TokenMenu, { insertAtCaret } from "./TokenMenu";
import { useForm } from "./context";
import { GlyphBold, GlyphBullets, GlyphHeading, GlyphItalic, GlyphLink, GlyphNumbers } from "../icons";

/**
 * Formatted text: the little markdown of @/lib/content/markdown, written in a
 * plain box with a toolbar that types it for you, and a preview drawn by the
 * same renderer the site uses — so what it shows is what the page will show.
 */

type Edit = { value: string; start: number; end: number };

/** Put `mark` either side of the selection, or take it away if it is already there. */
function toggleWrap(value: string, start: number, end: number, mark: string, empty: string): Edit {
  const before = value.slice(0, start);
  const chosen = value.slice(start, end);
  const after = value.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      value: before.slice(0, -mark.length) + chosen + after.slice(mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  const words = chosen || empty;
  return {
    value: `${before}${mark}${words}${mark}${after}`,
    start: start + mark.length,
    end: start + mark.length + words.length,
  };
}

/** Start each line of the selection with `prefix` — or, if every line already does, take it off. */
function toggleLines(value: string, start: number, end: number, prefix: (i: number) => string, test: RegExp): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const all = lines.every((line) => test.test(line));
  const next = lines.map((line, i) => (all ? line.replace(test, "") : prefix(i) + line.replace(test, ""))).join("\n");
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length };
}

type Tool = "heading" | "bold" | "italic" | "link" | "bullets" | "numbers";

const TOOLS: { id: Tool; label: string; keys?: string; icon: React.ReactNode }[] = [
  { id: "heading", label: "Heading", icon: <GlyphHeading size={17} /> },
  { id: "bold", label: "Bold", keys: "Ctrl+B", icon: <GlyphBold size={17} /> },
  { id: "italic", label: "Italics", keys: "Ctrl+I", icon: <GlyphItalic size={17} /> },
  { id: "link", label: "Link", keys: "Ctrl+K", icon: <GlyphLink size={17} /> },
  { id: "bullets", label: "Bulleted list", icon: <GlyphBullets size={17} /> },
  { id: "numbers", label: "Numbered list", icon: <GlyphNumbers size={17} /> },
];

const BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20";

export default function RichTextControl({
  field,
  value,
  onChange,
  fieldKey,
}: {
  field: RichTextField;
  value: string;
  onChange: (next: string) => void;
  fieldKey: string;
}) {
  const { problem, touch } = useForm();
  const id = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [linkDraft, setLinkDraft] = useState<{ words: string; href: string; start: number; end: number } | null>(null);
  const [linkTouched, setLinkTouched] = useState(false);
  const issue = problem(fieldKey);
  const described = [issue ? `${id}-problem` : field.help ? `${id}-help` : null, `${id}-count`, `${id}-syntax`]
    .filter(Boolean)
    .join(" ");

  function apply(edit: (value: string, start: number, end: number) => Edit) {
    const area = areaRef.current;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    const next = edit(value, start, end);
    onChange(next.value);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(next.start, next.end);
    });
  }

  /** One of the toolbar's actions, by name. Called from event handlers only: it reads the box's selection. */
  function run(tool: Tool) {
    switch (tool) {
      case "heading":
        return apply((v, s, e) => toggleLines(v, s, e, () => "## ", /^##\s+/));
      case "bold":
        return apply((v, s, e) => toggleWrap(v, s, e, "**", "bold words"));
      case "italic":
        return apply((v, s, e) => toggleWrap(v, s, e, "*", "italic words"));
      case "link":
        return openLink();
      case "bullets":
        return apply((v, s, e) => toggleLines(v, s, e, () => "- ", /^[-*]\s+/));
      case "numbers":
        return apply((v, s, e) => toggleLines(v, s, e, (i) => `${i + 1}. `, /^\d{1,3}[.)]\s+/));
    }
  }

  function openLink() {
    const area = areaRef.current;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    setLinkTouched(false);
    setLinkDraft({ words: value.slice(start, end), href: "", start, end });
  }

  const linkProblem = linkDraft ? (linkDraft.words.trim() ? checkHref(linkDraft.href.trim()) : "Write the link's words.") : null;

  function insertLink() {
    if (!linkDraft) return;
    setLinkTouched(true);
    if (linkProblem) return;
    const text = `[${linkDraft.words.trim()}](${linkDraft.href.trim()})`;
    const { start, end } = linkDraft;
    onChange(value.slice(0, start) + text + value.slice(end));
    setLinkDraft(null);
    requestAnimationFrame(() => {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const tools = TOOLS.filter((tool) => tool.id !== "heading" || field.headings);

  return (
    <FieldShell
      label={field.label}
      htmlFor={id}
      help={field.help}
      helpId={`${id}-help`}
      problem={issue}
      problemId={`${id}-problem`}
      aside={<Counter value={value} max={field.max} id={`${id}-count`} />}
    >
      <div
        className={`overflow-hidden rounded-2xl border bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent)]/10 ${
          issue ? "border-[var(--danger)]" : "border-[var(--dark)]/15"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--dark)]/10 bg-[var(--surface)] px-1.5 py-1">
          {mode === "write" ? (
            <div role="toolbar" aria-label={`Formatting for ${field.label}`} aria-controls={id} className="flex flex-wrap items-center">
              {tools.map((tool) => (
                <Tooltip key={tool.id} content={tool.keys ? `${tool.label} (${tool.keys})` : tool.label}>
                  <button
                    type="button"
                    aria-label={tool.label}
                    // Keeps the selection in the box while the button is pressed.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(tool.id)}
                    className={BUTTON}
                  >
                    {tool.icon}
                  </button>
                </Tooltip>
              ))}
              <TokenMenu
                label={field.label}
                onInsert={(placeholder) => insertAtCaret(areaRef.current, value, placeholder, onChange)}
              />
            </div>
          ) : (
            <p className="px-2 text-[12.5px] text-[var(--muted)]">As the page will show it, prices filled in.</p>
          )}
          <SegmentedControl
            size="sm"
            ariaLabel={`Write or preview ${field.label}`}
            className="ml-auto"
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        {mode === "write" ? (
          <textarea
            ref={areaRef}
            id={id}
            value={value}
            rows={field.headings ? 16 : 6}
            aria-invalid={issue ? true : undefined}
            aria-describedby={described}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => touch(fieldKey)}
            onKeyDown={(e) => {
              if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
              const key = e.key.toLowerCase();
              const tool: Tool | null = key === "b" ? "bold" : key === "i" ? "italic" : key === "k" ? "link" : null;
              if (!tool) return;
              e.preventDefault();
              run(tool);
            }}
            className={`${CONTROL} block min-h-[140px] resize-y rounded-none border-0 py-3 font-mono text-[13px] leading-relaxed focus:ring-0 ${
              issue ? CONTROL_INVALID : ""
            }`}
          />
        ) : (
          <div className="max-h-[520px] min-h-[140px] space-y-4 overflow-y-auto bg-[var(--surface)] px-5 py-4">
            {value.trim() ? (
              <RichText source={fillTokens(value)} headings={field.headings} className="space-y-4" />
            ) : (
              <p className="text-[13px] text-[var(--muted)]">Nothing written yet.</p>
            )}
          </div>
        )}
      </div>
      <p id={`${id}-syntax`} className="mt-2 text-[11.5px] leading-snug text-[var(--muted)]">
        {field.headings ? "## starts a heading. " : ""}**bold**, *italics*, [words](/page), and lines starting “- ” or “1. ” for
        lists. A blank line starts a new paragraph.
      </p>

      <Modal
        open={linkDraft !== null}
        onClose={() => setLinkDraft(null)}
        title="Add a link"
        description="A page on this site starts with /. Another site needs its full https:// address."
        variant="dialog"
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLinkDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={insertLink}>
              Add the link
            </Button>
          </div>
        }
      >
        {linkDraft ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              insertLink();
            }}
          >
            <Input
              label="Words to show"
              value={linkDraft.words}
              onChange={(e) => setLinkDraft({ ...linkDraft, words: e.target.value })}
              error={linkTouched && !linkDraft.words.trim() ? "Write the link's words." : null}
            />
            <Input
              label="Where it goes"
              placeholder="/support or https://…"
              inputMode="url"
              value={linkDraft.href}
              onChange={(e) => setLinkDraft({ ...linkDraft, href: e.target.value })}
              error={linkTouched && linkDraft.words.trim() ? linkProblem : null}
            />
            {/* Enter in either box adds the link. */}
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        ) : null}
      </Modal>
    </FieldShell>
  );
}
