"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { Field } from "./Input";
import { contrastRatio, formatRatio, isHex, rating, type ContrastRating } from "../../lib/contrast";

/**
 * A colour field: the swatch and its hex, opening onto the brand palette, a
 * free choice, and how readable the colour is against what it will sit on.
 *
 * The palette comes first because nearly every colour in TALK should be one
 * of its own; the free choice is there for the exceptions. The contrast
 * readouts are the point of the component — a colour that looks fine on one
 * screen can be unreadable on a cheap phone in sunlight, and the ratio is
 * what does not lie.
 */

export type Swatch = { name: string; value: string };

/**
 * A colour to check against. `use: "text"` means this colour is the text and
 * the picked one is the background ("White text" on a terracotta button);
 * otherwise the picked colour is the text, sitting on this one. Contrast is
 * the same either way round — this only changes which way the sample is drawn.
 */
export type ContrastTarget = Swatch & { use?: "text" | "background" };

/**
 * The tokens in app/globals.css, by the names people use for them. Kept as
 * literal hex because a picker has to hand back a real colour, not a
 * variable — check this list when a token there changes.
 */
export const BRAND_SWATCHES: Swatch[] = [
  { name: "Background", value: "#FBF7F1" },
  { name: "Cream", value: "#F4EADD" },
  { name: "Sand", value: "#EFE5D8" },
  { name: "Surface", value: "#FFFDFA" },
  { name: "Surface 2", value: "#F6EEE3" },
  { name: "Ink", value: "#3B2C26" },
  { name: "Muted", value: "#7A6A61" },
  { name: "Brown", value: "#4A3530" },
  { name: "Brown soft", value: "#5B433C" },
  { name: "Stage", value: "#2E221E" },
  { name: "Terracotta", value: "#C8754E" },
  { name: "Terracotta soft", value: "#D68C68" },
  { name: "Terracotta deep", value: "#B3613C" },
  { name: "Peach", value: "#E7A381" },
  { name: "Sage", value: "#6E8763" },
  { name: "Sage deep", value: "#5B7351" },
  { name: "Sage soft", value: "#A9BC9C" },
  { name: "Sage pale", value: "#DDE5D3" },
  { name: "Success", value: "#5B7F52" },
  { name: "Warning", value: "#A86A16" },
  { name: "Danger", value: "#A8352A" },
  { name: "Info", value: "#4D6A86" },
];

/** The surfaces most text in the app sits on, plus white text on top. */
export const BRAND_BACKGROUNDS: ContrastTarget[] = [
  { name: "Cream", value: "#F4EADD" },
  { name: "Surface", value: "#FFFDFA" },
  { name: "White text", value: "#FFFFFF", use: "text" },
];

/** "c8754e", " #C8754E " → "#C8754E". Anything else comes back as typed. */
function normalise(input: string): string {
  const trimmed = input.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return isHex(withHash) ? withHash.toUpperCase() : input;
}

/** "#C87" is on its way to a colour, not wrong. "#C8G" or "#C8754E1" is. */
function unfinished(input: string): boolean {
  return /^#?[0-9a-fA-F]{0,5}$/.test(input.trim());
}

/** The palette grid's width, which the arrow keys need to move up and down. */
const COLUMNS = 6;

const RATING_STYLES: Record<ContrastRating, string> = {
  AAA: "bg-[var(--sage-deep)] text-white",
  AA: "bg-[var(--sage-deep)] text-white",
  // Passes for large text only: neither a pass nor a fail, so it gets the
  // in-between tone. Dark text keeps it readable — warning on its own soft
  // tint does not reach 4.5:1.
  "AA large": "bg-[var(--warning-soft)] text-[var(--foreground)] ring-1 ring-inset ring-[var(--warning)]/40",
  fail: "bg-[var(--danger)] text-white",
};

const RATING_LABELS: Record<ContrastRating, string> = {
  AAA: "AAA",
  AA: "AA",
  "AA large": "AA large",
  fail: "Fails",
};

function Readout({ colour, target }: { colour: string; target: ContrastTarget }) {
  const ratio = contrastRatio(colour, target.value);
  const level = rating(ratio);
  const asText = target.use === "text";
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-9 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] font-display text-[16px] font-medium"
        style={{
          background: asText ? colour : target.value,
          color: asText ? target.value : colour,
        }}
      >
        Aa
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <span className="block truncate">{target.name}</span>
        <span className="block tabular-nums text-[var(--muted)]">{formatRatio(ratio)}</span>
      </span>
      <span
        className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium ${RATING_STYLES[level]}`}
      >
        {RATING_LABELS[level]}
      </span>
    </li>
  );
}

export default function ColorPicker({
  label,
  value,
  onChange,
  swatches = BRAND_SWATCHES,
  against = [],
  disabled = false,
  hint,
  className = "",
}: {
  label: string;
  /** A six-digit hex colour, "#C8754E". */
  value: string;
  /** Always called with an upper-case six-digit hex. */
  onChange: (value: string) => void;
  swatches?: Swatch[];
  /** What the colour will sit on (or carry), to show its contrast against. */
  against?: ContrastTarget[];
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Switched off while open (a save in progress, say) closes it, and it stays
  // closed when switched back on.
  if (disabled && open) setOpen(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const popoverId = useId();
  const paletteId = useId();
  const hexId = useId();
  const hexErrorId = useId();

  const current = isHex(value) ? value.toUpperCase() : null;
  const named = current ? swatches.find((s) => s.value.toUpperCase() === current) : undefined;
  // One swatch is in the Tab order, the chosen one (else the first); the
  // arrow keys move between the rest, so the palette is one stop, not 22.
  const chosenIndex = swatches.findIndex((s) => s.value.toUpperCase() === current);
  const tabStop = chosenIndex >= 0 ? chosenIndex : 0;

  // The hex box keeps its own draft so a half-typed "#C87" is not thrown away
  // or sent upward. When the colour changes from elsewhere — a swatch, the
  // native picker, the parent — the draft follows, unless it already says the
  // same colour (so typing "c8754e" is not rewritten under the cursor).
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (normalise(draft).toUpperCase() !== value.toUpperCase()) setDraft(value);
  }
  // Only a code that can no longer become a colour is an error. Flagging
  // "#C8" in red while it is still being typed would be scolding somebody
  // for being halfway through.
  const draftBad = !isHex(normalise(draft)) && !unfinished(draft);

  function choose(next: string) {
    const hex = normalise(next);
    if (isHex(hex)) onChange(hex);
  }

  function toggle() {
    // Opening starts the hex box from the colour in use. A half-typed code
    // left behind by a click outside would otherwise still be sitting there.
    if (!open) setDraft(value);
    setOpen(!open);
  }

  function onPaletteKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at + COLUMNS,
      ArrowUp: at - COLUMNS,
      Home: 0,
      End: buttons.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, moves[e.key]))]?.focus();
  }

  // Focus goes into the popover when it opens — to the chosen swatch if there
  // is one — so the keyboard is where the eyes are. It is scrolled into view
  // first: near the foot of a modal or drawer it can open below the fold.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const root = popoverRef.current;
      root?.scrollIntoView({ block: "nearest" });
      const target =
        root?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        root?.querySelector<HTMLElement>("button, input");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // A press anywhere outside closes it, as any popover does.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <Field label={label} htmlFor={triggerId} hint={hint} className={className}>
      <div
        ref={wrapRef}
        className="relative"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            // Stop it reaching a Modal underneath, which would close too.
            e.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
        onBlur={(e) => {
          // Tabbing out closes it. A null relatedTarget is focus leaving the
          // page — the native colour dialog does that — so it stays open.
          const next = e.relatedTarget as Node | null;
          if (open && next && !wrapRef.current?.contains(next)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          // The name carries the colour too. Left to the <label>, a screen
          // reader would hear "Brand colour, button" and never the colour.
          aria-label={`${label}: ${current ? `${current}${named ? `, ${named.name}` : ""}` : "no colour"}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={toggle}
          className="flex h-12 w-full items-center gap-3 rounded-2xl border border-[var(--dark)]/15 bg-[var(--background)] px-3 text-left text-[14px] text-[var(--foreground)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/10 disabled:opacity-60"
        >
          <span
            aria-hidden
            className="h-7 w-7 shrink-0 rounded-full border border-[var(--dark)]/15"
            style={{
              background: current ?? "transparent",
              // No colour yet: a diagonal line, the usual sign for "none".
              backgroundImage: current
                ? undefined
                : "linear-gradient(135deg, transparent 46%, var(--danger) 46%, var(--danger) 54%, transparent 54%)",
            }}
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="tabular-nums tracking-[0.04em]">{current ?? "No colour"}</span>
            {named ? <span className="text-[var(--muted)]"> · {named.name}</span> : null}
          </span>
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className={`mr-1 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={`${label}: choose a colour`}
              initial={{ y: -8, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -6, opacity: 0, scale: 0.98 }}
              transition={SPRING_SNAP}
              className="absolute left-0 top-full z-40 mt-2 w-[320px] max-w-[calc(100vw-32px)] origin-top-left rounded-[22px] border border-[var(--dark)]/[0.06] bg-[var(--surface)] p-4 shadow-[var(--shadow-floating)]"
            >
              <p id={paletteId} className="text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--sage)]">
                Palette
              </p>
              <div
                role="group"
                aria-labelledby={paletteId}
                onKeyDown={onPaletteKeyDown}
                className="mt-3 grid grid-cols-6 gap-2"
              >
                {swatches.map((swatch, i) => {
                  const chosen = current === swatch.value.toUpperCase();
                  return (
                    <button
                      key={`${swatch.name}-${swatch.value}`}
                      type="button"
                      tabIndex={i === tabStop ? 0 : -1}
                      title={`${swatch.name} ${swatch.value.toUpperCase()}`}
                      aria-label={`${swatch.name}, ${swatch.value.toUpperCase()}`}
                      aria-pressed={chosen}
                      onClick={() => choose(swatch.value)}
                      className={`relative aspect-square w-full rounded-full border border-[var(--dark)]/15 outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--accent)]/25 ${
                        chosen ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]" : ""
                      }`}
                      style={{ background: swatch.value }}
                    />
                  );
                })}
              </div>
              {named ? (
                <p className="mt-2 text-[12px] text-[var(--muted)]">
                  {named.name}
                </p>
              ) : null}

              <div className="mt-4 flex items-start gap-3 border-t border-[var(--border)] pt-4">
                {/* The ring is drawn here because the input itself is invisible:
                    without it, tabbing onto the free choice shows nothing. */}
                <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-[var(--dark)]/15 transition-shadow has-[:focus-visible]:border-[var(--accent)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--accent)]/25">
                  <span className="sr-only">Any colour</span>
                  <span aria-hidden className="absolute inset-0" style={{ background: current ?? "#FFFFFF" }} />
                  {/* The native chooser does the free choice: every phone has a
                      good one already. It sits invisibly over the swatch. */}
                  <input
                    type="color"
                    value={(current ?? "#FFFFFF").toLowerCase()}
                    onChange={(e) => choose(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <label htmlFor={hexId} className="sr-only">
                    Hex code
                  </label>
                  <input
                    id={hexId}
                    value={draft}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="#C8754E"
                    aria-invalid={draftBad || undefined}
                    aria-describedby={draftBad ? hexErrorId : undefined}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      choose(e.target.value);
                    }}
                    onBlur={() => {
                      // Leaving a half-typed code puts back the colour in use.
                      if (!isHex(normalise(draft))) setDraft(value);
                    }}
                    className={`h-12 w-full rounded-2xl border bg-[var(--background)] px-4 text-[14px] uppercase tabular-nums tracking-[0.04em] text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 ${
                      draftBad ? "border-[var(--danger)]" : "border-[var(--dark)]/15"
                    }`}
                  />
                  {draftBad ? (
                    <p id={hexErrorId} className="mt-1.5 text-[12px] leading-snug text-[var(--danger)]">
                      Six characters after the #, like #C8754E.
                    </p>
                  ) : null}
                </div>
              </div>

              {against.length > 0 && current ? (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <p className="text-[10.5px] uppercase tracking-[0.28em] font-medium text-[var(--sage)]">
                    Contrast
                  </p>
                  {/* Not a live region: dragging the native chooser changes the
                      colour many times a second, and reading every step aloud
                      would drown everything else out. */}
                  <ul className="mt-3 space-y-2.5">
                    {against.filter((t) => isHex(t.value)).map((target) => (
                      <Readout key={`${target.name}-${target.value}`} colour={current} target={target} />
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                    Body text needs AA (4.5:1). AA large (3:1) is only for big headings, icons and borders.
                  </p>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Field>
  );
}
