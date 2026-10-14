"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";

/**
 * Dropdown — a listbox we draw ourselves.
 *
 * The native `Select` in Input.tsx is still the right call for a long, plain
 * list on a phone, where the operating system's own picker beats anything we
 * could draw. Reach for this one when a choice needs more than a word (a
 * description, an icon), when the list wants a search box, or when several
 * values can be chosen at once (`MultiDropdown`).
 *
 * Two looks: `field` sits in a form beside the other inputs; `pill` is the
 * providers page filter, which fills terracotta once something is chosen.
 *
 * The panel is portalled to document.body and positioned against the trigger,
 * for the same reason Modal is: a table inside `overflow-x-auto`, or any card
 * with `overflow-hidden`, would otherwise clip it.
 *
 * Keyboard and screen reader behaviour follows the WAI-ARIA listbox pattern.
 * Focus moves into the open list (or its search box) and the highlighted
 * option is announced through `aria-activedescendant`, so the options
 * themselves never take focus.
 */

/* ─── The floating panel, shared with Menu and Tooltip ─────────────────── */

const GAP = 8; // between the trigger and the panel
const EDGE = 8; // the closest a panel may come to the edge of the screen
const PANEL_MAX = 320;

const subscribeNever = () => () => {};

/** True once on the client: a portal needs a document to render into. */
export function useHasDocument(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export type Place = {
  top: number;
  left?: number;
  right?: number;
  minWidth: number;
  maxHeight: number;
  /** Opens upward: `top` is then the panel's bottom edge. */
  up: boolean;
};

/**
 * Where a panel should sit against its trigger.
 *
 * It opens downward unless it would be cramped there and there is more room
 * above, which is what keeps a filter at the foot of a phone screen usable.
 * Upward panels are anchored by their bottom edge (with a -100% translate),
 * so nothing here needs to know how tall the panel turns out to be.
 */
export function placePanel(
  anchor: HTMLElement,
  {
    align = "start",
    minWidth = 0,
    matchWidth = false,
    height = PANEL_MAX,
  }: {
    align?: "start" | "end";
    minWidth?: number;
    matchWidth?: boolean;
    /** A rough guess at the panel's natural height, used only to decide the flip. */
    height?: number;
  } = {},
): Place {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const wanted = Math.min(height, PANEL_MAX);
  const up = below < wanted && above > below;

  const width = Math.min(Math.max(minWidth, matchWidth ? rect.width : 0), viewportWidth - EDGE * 2);
  const fitsFromLeft = rect.left + width <= viewportWidth - EDGE;
  const fitsFromRight = rect.right - width >= EDGE;
  // Honour the asked-for alignment unless it would push the panel off screen.
  const fromRight = align === "end" ? fitsFromRight || !fitsFromLeft : !fitsFromLeft && fitsFromRight;

  return {
    top: up ? rect.top - GAP : rect.bottom + GAP,
    left: fromRight ? undefined : Math.max(EDGE, rect.left),
    right: fromRight ? Math.max(EDGE, viewportWidth - rect.right) : undefined,
    minWidth: width,
    maxHeight: Math.max(140, Math.min(PANEL_MAX, up ? above : below)),
    up,
  };
}

/**
 * Closes a panel on a press anywhere outside it and its trigger, and keeps it
 * pinned to the trigger while the page scrolls or the window resizes.
 */
export function useFloatingDismiss({
  open,
  anchorRef,
  panelRef,
  onDismiss,
  onReposition,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  onReposition: () => void;
}) {
  const pressed = useEffectEvent((target: EventTarget | null) => {
    if (!(target instanceof Node)) return;
    if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
    onDismiss();
  });

  const moved = useEffectEvent((target: EventTarget | null) => {
    // A long list scrolling inside its own panel is not the page moving.
    if (target instanceof Node && panelRef.current?.contains(target)) return;
    onReposition();
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => pressed(event.target);
    const onScroll = (event: Event) => moved(event.target);
    const onResize = () => moved(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);
}

/**
 * The popover surface itself. z-[70] puts it above Modal (50) and Toast (60),
 * so a dropdown inside a dialog still opens over it.
 */
export function FloatingPanel({
  open,
  place,
  panelRef,
  className = "",
  children,
}: {
  open: boolean;
  place: Place | null;
  panelRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const hasDocument = useHasDocument();
  if (!hasDocument) return null;

  return createPortal(
    <AnimatePresence>
      {open && place ? (
        <PanelSurface place={place} panelRef={panelRef} className={className}>
          {children}
        </PanelSurface>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function PanelSurface({
  place,
  panelRef,
  className,
  children,
}: {
  place: Place;
  panelRef: RefObject<HTMLDivElement | null>;
  className: string;
  children: ReactNode;
}) {
  // False from the moment the panel starts to fade out. The fade takes the
  // best part of a second, and a fading panel that still took clicks would
  // run a menu action twice on a double click.
  const present = useIsPresent();

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: place.up ? 6 : -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: place.up ? 4 : -4, scale: 0.98 }}
      transition={SPRING_SNAP}
      // Swallowed rather than passed through, so the late click does not
      // land on whatever sits under the panel either.
      onClickCapture={(event) => {
        if (!present) event.stopPropagation();
      }}
      // Pressing the panel's padding or a row would otherwise move focus
      // to the page body, and the arrow keys and Escape would stop working
      // with the panel still open. Text fields are left alone so a search
      // box can still be clicked into.
      onMouseDown={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          event.preventDefault();
        }
      }}
      // The panel lives at the end of body but is still a React child of
      // its trigger, so a click in it would otherwise bubble to whatever
      // clickable row or card the trigger sits in.
      onClick={(event) => event.stopPropagation()}
      style={{
        top: place.top,
        left: place.left,
        right: place.right,
        minWidth: place.minWidth,
        maxHeight: place.maxHeight,
        transformOrigin: `${place.up ? "bottom" : "top"} ${place.right === undefined ? "left" : "right"}`,
      }}
      className={`fixed z-[70] flex max-w-[calc(100vw-16px)] flex-col rounded-2xl bg-[var(--surface)] p-2 shadow-[var(--shadow-floating)] ${
        place.up ? "-translate-y-full" : ""
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** A key that types a character, as opposed to Shift, Tab or a shortcut. */
export function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Remembers what has been typed in quick succession, so "ma" can reach
 * Mandinka past Malaria. Call the returned function from a key handler.
 */
export function useTypeahead(): (key: string) => string {
  const typed = useRef({ text: "", at: 0 });
  return (key: string) => {
    const now = Date.now();
    const text = now - typed.current.at > 700 ? key : typed.current.text + key;
    typed.current = { text, at: now };
    return text;
  };
}

/** The next enabled item whose label starts with what was typed, or -1. */
export function findByPrefix(
  items: { label: string; disabled?: boolean }[],
  text: string,
  from: number,
): number {
  // Pressing the same letter again walks through everything that starts with
  // it, the way a native select does.
  const repeated = [...text].every((character) => character === text[0]);
  const needle = (repeated ? text[0] : text).toLowerCase();
  const start = repeated ? from + 1 : Math.max(from, 0);
  for (let n = 0; n < items.length; n++) {
    const index = (start + n) % items.length;
    const item = items[index];
    if (!item.disabled && item.label.toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/** The chevron that turns over when its panel opens. */
export function Chevron({ open, variant = "field" }: { open: boolean; variant?: "field" | "pill" }) {
  if (variant === "pill") {
    return (
      <motion.svg
        aria-hidden
        animate={{ rotate: open ? 180 : 0 }}
        transition={SPRING_SNAP}
        width="10"
        height="7"
        viewBox="0 0 10 7"
        className="shrink-0"
      >
        <path d="M1 1l4 4 4-4" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </motion.svg>
    );
  }
  return (
    <motion.svg
      aria-hidden
      animate={{ rotate: open ? 180 : 0 }}
      transition={SPRING_SNAP}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className="shrink-0 text-[var(--muted)]"
    >
      <path d="M6 9l6 6 6-6" />
    </motion.svg>
  );
}

/* ─── Dropdown ─────────────────────────────────────────────────────────── */

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type CommonProps<T extends string> = {
  /** Shown above a field, or inside a pill as "Label: choice". */
  label?: string;
  hideLabel?: boolean;
  options: DropdownOption<T>[];
  placeholder?: string;
  /** Adds a search box to the top of the list. Worth it past a dozen options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  error?: string | null;
  size?: "sm" | "md";
  variant?: "field" | "pill";
  /** Posts the choice with a plain form submit, through hidden inputs. */
  name?: string;
  className?: string;
};

export function Dropdown<T extends string>({
  value,
  onChange,
  ...common
}: CommonProps<T> & {
  value: T | null;
  onChange: (value: T) => void;
}) {
  const chosen = common.options.find((option) => option.value === value) ?? null;
  return (
    <Listbox
      {...common}
      multiple={false}
      selected={value === null ? [] : [value]}
      display={chosen?.label ?? null}
      displayIcon={chosen?.icon}
      onPick={(next) => {
        // A native select stays quiet when the same value is picked again.
        if (next !== value) onChange(next);
      }}
    />
  );
}

export function MultiDropdown<T extends string>({
  values,
  onChange,
  summary,
  ...common
}: CommonProps<T> & {
  values: T[];
  onChange: (values: T[]) => void;
  /** What the trigger says once something is chosen. Defaults to "Wolof +2". */
  summary?: (values: T[]) => string;
}) {
  const display =
    values.length === 0 ? null : summary ? summary(values) : defaultSummary(common.options, values);
  return (
    <Listbox
      {...common}
      multiple
      selected={values}
      display={display}
      onPick={(next) =>
        onChange(values.includes(next) ? values.filter((v) => v !== next) : [...values, next])
      }
    />
  );
}

function defaultSummary<T extends string>(options: DropdownOption<T>[], values: T[]): string {
  const labels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
  if (labels.length === 0) return `${values.length} chosen`;
  return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
}

function filterOptions<T extends string>(options: DropdownOption<T>[], query: string): DropdownOption<T>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      (option.description?.toLowerCase().includes(needle) ?? false),
  );
}

/** One step from `from` in `direction`, skipping disabled options; stays put at the ends. */
function step<T extends string>(list: DropdownOption<T>[], from: number, direction: 1 | -1): number {
  for (let index = from + direction; index >= 0 && index < list.length; index += direction) {
    if (!list[index].disabled) return index;
  }
  return from;
}

/** The first (1) or last (-1) enabled option, or -1 when there is none. */
function edge<T extends string>(list: DropdownOption<T>[], direction: 1 | -1): number {
  const outside = direction === 1 ? -1 : list.length;
  const index = step(list, outside, direction);
  return index === outside ? -1 : index;
}

const FIELD_SIZES = {
  sm: "h-10 px-3.5 text-[13.5px]",
  md: "h-12 px-4 text-[14px]",
};

const PILL_SIZES = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-10 px-4 text-[13.5px]",
};

function CheckCircle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
        on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--dark)]/30"
      }`}
    >
      {on ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
          <path d="M5 12l5 5L20 7" />
        </svg>
      ) : null}
    </span>
  );
}

/** The single and multiple dropdowns differ only in what a pick does. */
function Listbox<T extends string>({
  label,
  hideLabel = false,
  options,
  placeholder = "Choose…",
  searchable = false,
  searchPlaceholder = "Search",
  disabled = false,
  required = false,
  hint,
  error,
  size = "md",
  variant = "field",
  name,
  className = "",
  multiple,
  selected,
  display,
  displayIcon,
  onPick,
}: CommonProps<T> & {
  multiple: boolean;
  selected: T[];
  display: string | null;
  displayIcon?: ReactNode;
  onPick: (value: T) => void;
}) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const messageId = `${uid}-message`;
  const optionId = (index: number) => `${uid}-option-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useTypeahead();

  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);

  // A field disabled while its list is open, as when the form around it is
  // being sent, closes the list rather than leaving it usable.
  if (open && disabled) setOpen(false);

  const pill = variant === "pill";
  const visible = searchable ? filterOptions(options, query) : options;
  // Options can change under an open list; a stale index highlights nothing
  // rather than the wrong row.
  const activeIndex = active < visible.length ? active : -1;

  function measure(): Place | null {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const row = options.some((option) => option.description) ? 58 : 44;
    return placePanel(trigger, {
      matchWidth: !pill,
      minWidth: pill ? 220 : 0,
      height: options.length * row + 16 + (searchable ? 52 : 0),
    });
  }

  function show(at: number, seed = "") {
    const next = measure();
    if (!next) return;
    setPlace(next);
    setQuery(seed);
    setActive(at);
    setOpen(true);
  }

  function hide(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  /** Where the highlight starts: on the current choice, else at an end. */
  function startIndex(fromEnd = false): number {
    const current = options.findIndex((option) => !option.disabled && selected.includes(option.value));
    return current >= 0 ? current : edge(options, fromEnd ? -1 : 1);
  }

  function move(index: number) {
    if (index < 0) return;
    setActive(index);
    // The rows already exist, so the row can be scrolled to straight away.
    document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" });
  }

  function pick(option: DropdownOption<T>) {
    if (option.disabled) return;
    onPick(option.value);
    if (!multiple) hide();
  }

  useFloatingDismiss({
    open,
    anchorRef: triggerRef,
    panelRef,
    onDismiss: () => setOpen(false),
    onReposition: () => {
      const next = measure();
      if (next) setPlace(next);
    },
  });

  // Focus follows the list open. A frame's wait lets the portal mount first.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const search = searchRef.current;
      if (search) {
        search.focus({ preventScroll: true });
        // A search started by typing on the trigger carries on after that
        // first letter rather than in front of it.
        search.setSelectionRange(search.value.length, search.value.length);
      } else {
        listRef.current?.focus({ preventScroll: true });
      }
      listRef.current
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open) return;
    // Enter and Space are handled here rather than left to become a click;
    // see onTriggerKeyUp for why.
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show(startIndex());
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(startIndex(event.key === "ArrowUp"));
      return;
    }
    if (!isPrintable(event)) return;
    event.preventDefault();
    if (searchable) {
      // Typing on the closed field starts the search with that letter.
      show(edge(filterOptions(options, event.key), 1), event.key);
      return;
    }
    const current = options.findIndex((option) => selected.includes(option.value));
    const match = findByPrefix(options, typeahead(event.key), current);
    show(match >= 0 ? match : startIndex());
  }

  /**
   * Picking with Space hands focus back to the trigger while the key is still
   * down. Firefox then turns the Space keyup into a click on the trigger,
   * which opened the list again straight after the choice was made.
   */
  function onTriggerKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " ") event.preventDefault();
  }

  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(activeIndex < 0 ? edge(visible, 1) : step(visible, activeIndex, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        move(activeIndex < 0 ? edge(visible, -1) : step(visible, activeIndex, -1));
        return;
      case "Home":
        event.preventDefault();
        move(edge(visible, 1));
        return;
      case "End":
        event.preventDefault();
        move(edge(visible, -1));
        return;
      case "Enter":
        event.preventDefault();
        if (activeIndex >= 0) pick(visible[activeIndex]);
        return;
      case " ":
        // In a search box a space is part of the search.
        if (searchable) return;
        event.preventDefault();
        if (activeIndex >= 0) pick(visible[activeIndex]);
        return;
      case "Escape":
        // Stopped here so a Modal around the dropdown stays open.
        event.preventDefault();
        event.stopPropagation();
        hide();
        return;
      case "Tab":
        // Back to the trigger first, so Tab carries on from there rather
        // than from the end of the page where the panel is portalled.
        hide();
        return;
    }
    if (!searchable && isPrintable(event)) {
      move(findByPrefix(visible, typeahead(event.key), activeIndex));
    }
  }

  const hasValue = display !== null;
  const describedBy = error || hint ? messageId : undefined;

  const triggerText = pill
    ? hasValue
      ? label
        ? `${label}: ${display}`
        : display
      : (label ?? placeholder)
    : (display ?? placeholder);

  const triggerClass = pill
    ? `inline-flex max-w-full items-center gap-2.5 rounded-full border-[1.5px] outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-60 ${PILL_SIZES[size]} ${
        hasValue
          ? "border-[var(--accent)] bg-[var(--accent)] text-white hover:border-[var(--accent-deep)] hover:bg-[var(--accent-deep)]"
          : `border-[var(--dark)]/70 text-[var(--foreground)] hover:bg-[var(--sand)] ${open ? "bg-[var(--sand)]" : ""}`
      }`
    : `flex w-full items-center gap-3 rounded-2xl border bg-[var(--background)] text-left text-[var(--foreground)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-60 ${FIELD_SIZES[size]} ${
        open
          ? "border-[var(--accent)] ring-4 ring-[var(--accent)]/10"
          : error
            ? "border-[var(--accent)]"
            : "border-[var(--dark)]/15 hover:border-[var(--dark)]/30"
      }`;

  // The list is named by the visible label where there is one.
  const listNaming =
    !pill && label ? { "aria-labelledby": labelId } : { "aria-label": label ?? placeholder };

  return (
    <div className={className}>
      {label && !pill ? (
        // Not a <label>: clicking one would open the list, where a native
        // field only takes focus. This one just hands focus to the trigger.
        <span
          id={labelId}
          onClick={() => triggerRef.current?.focus()}
          className={
            hideLabel
              ? "sr-only"
              : "mb-2 block text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent)]"
          }
        >
          {label}
          {required ? <span className="text-[var(--accent)]"> *</span> : null}
        </span>
      ) : null}

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={!pill && label ? `${labelId} ${triggerId}` : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? hide(false) : show(startIndex()))}
        onKeyDown={onTriggerKeyDown}
        onKeyUp={onTriggerKeyUp}
        className={triggerClass}
      >
        {!pill && displayIcon ? (
          <span aria-hidden className="flex shrink-0 text-[var(--muted)]">
            {displayIcon}
          </span>
        ) : null}
        <span
          className={`min-w-0 truncate ${pill ? "" : "flex-1"} ${
            !pill && !hasValue ? "text-[var(--muted)]" : ""
          }`}
        >
          {triggerText}
        </span>
        <Chevron open={open} variant={pill ? "pill" : "field"} />
      </button>

      {name
        ? multiple
          ? selected.map((value) => <input key={value} type="hidden" name={name} value={value} />)
          : <input type="hidden" name={name} value={selected[0] ?? ""} />
        : null}

      {error ? (
        <p id={messageId} className="mt-2 text-[13px] leading-snug text-[var(--accent)]">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-2 text-[12px] leading-snug text-[var(--muted)]">
          {hint}
        </p>
      ) : null}

      <FloatingPanel open={open} place={place} panelRef={panelRef}>
        {searchable ? (
          <div className="relative mb-1.5 shrink-0">
            <svg
              aria-hidden
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-label={label ? `Search ${label.toLowerCase()}` : "Search the options"}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(edge(filterOptions(options, event.target.value), 1));
              }}
              onKeyDown={onListKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              // 16px on phones: iOS zooms the page into any smaller text box
              // it focuses, which would throw the fixed panel off its trigger.
              className="h-10 w-full rounded-xl border border-[var(--dark)]/10 bg-[var(--background)] pl-9 pr-3 text-[16px] outline-none transition-[border-color] placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 sm:text-[13.5px]"
            />
          </div>
        ) : null}

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={searchable ? undefined : -1}
          aria-multiselectable={multiple || undefined}
          // A button cannot carry these, so the trigger leaves the error to
          // its description and the list says it is required or wrong.
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-activedescendant={!searchable && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          onKeyDown={searchable ? undefined : onListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
          {...listNaming}
        >
          {visible.map((option, index) => {
            const on = selected.includes(option.value);
            const lit = index === activeIndex;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={on}
                aria-disabled={option.disabled || undefined}
                data-active={lit}
                onPointerMove={() => {
                  if (!lit && !option.disabled) setActive(index);
                }}
                onClick={() => pick(option)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors ${
                  option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
                } ${lit ? "bg-[var(--sand)]" : ""}`}
              >
                {option.icon ? (
                  <span aria-hidden className="flex shrink-0 text-[var(--muted)]">
                    {option.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className={`block leading-snug ${on ? "font-medium" : ""}`}>{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--muted)]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {/* A multiple list shows every circle, like checkboxes; a
                    single one marks only the current choice. */}
                {multiple || on ? <CheckCircle on={on} /> : null}
              </li>
            );
          })}
        </ul>

        {visible.length === 0 ? (
          <p className="px-3 py-5 text-center text-[13px] text-[var(--muted)]">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : "Nothing to choose from yet."}
          </p>
        ) : null}
      </FloatingPanel>
    </div>
  );
}
