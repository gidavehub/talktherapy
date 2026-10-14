"use client";

import Menu from "@/components/ui/Menu";
import { TOKEN_LIST } from "@/lib/content/tokens";
import { GlyphBraces } from "../icons";

/**
 * "Insert a price or number": the placeholders, each with what it shows
 * today. Prices are never typed in by hand — they would go stale, and the
 * checks refuse them — so this is how a price gets into the words.
 */
export default function TokenMenu({ onInsert, label }: { onInsert: (placeholder: string) => void; label: string }) {
  return (
    <Menu
      align="end"
      label={`Insert a price or number into ${label}`}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Insert a price or number into ${label}`}
          title="Insert a price or number"
          // Drawn small to sit in the label's row; the press area is the full 44px.
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] outline-none transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-[var(--sand)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
        >
          <GlyphBraces size={15} />
        </button>
      )}
      items={TOKEN_LIST.map((token) => ({
        label: token.placeholder,
        description: `${token.label}. Shows ${token.example} today.`,
        onSelect: () => onInsert(token.placeholder),
      }))}
    />
  );
}

/**
 * Put text in at the caret (or over the selection) of an input, and leave the
 * caret after it. Call from an event handler.
 */
export function insertAtCaret(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  text: string,
  onChange: (next: string) => void,
) {
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? value.length;
  onChange(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    if (!element) return;
    element.focus();
    element.setSelectionRange(start + text.length, start + text.length);
  });
}
