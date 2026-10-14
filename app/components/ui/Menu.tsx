"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Chevron,
  FloatingPanel,
  findByPrefix,
  isPrintable,
  placePanel,
  useFloatingDismiss,
  useTypeahead,
  type Place,
} from "./Dropdown";

/**
 * Menu — a short list of actions behind a button: the "…" at the end of a
 * table row, or an "Export" button with its formats.
 *
 * It looks like Dropdown's panel (and borrows its positioning) but holds no
 * value: each item does something and the menu closes. Focus moves onto the
 * items themselves, per the WAI-ARIA menu button pattern, so a screen reader
 * hears each action as it is reached.
 *
 * The trigger is yours to draw if you want: pass a function and spread the
 * props it receives onto a button. Pass a string for the outlined pill, or
 * nothing for the round "…" button.
 */

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  description?: string;
  /** Destructive actions, such as removing a provider, read in red. */
  danger?: boolean;
  disabled?: boolean;
};

/** Spread these onto your own trigger button. */
export type MenuTriggerProps = {
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

const ITEM =
  "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] outline-none transition-colors";

/** The pointer and the keyboard share one highlight: whatever is under the pointer takes focus. */
function focusUnderPointer(event: PointerEvent<HTMLElement>) {
  if (document.activeElement !== event.currentTarget) {
    event.currentTarget.focus({ preventScroll: true });
  }
}

/**
 * Calls a caller-drawn trigger. It is a component of its own because the
 * trigger props close over the menu's refs (to measure and refocus), and the
 * React Compiler rightly refuses a ref-holding function being called while
 * rendering; handed over as props, they stay what they are: event handlers.
 */
function CustomTrigger({
  render,
  props,
  open,
}: {
  render: (props: MenuTriggerProps, state: { open: boolean }) => ReactNode;
  props: MenuTriggerProps;
  open: boolean;
}) {
  return render(props, { open });
}

function Dots() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

export default function Menu({
  trigger,
  label,
  items,
  align = "start",
  className = "",
}: {
  trigger?: string | ((props: MenuTriggerProps, state: { open: boolean }) => ReactNode);
  /** Names the round "…" trigger for screen readers. Defaults to "More actions". */
  label?: string;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}) {
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const menuId = `${uid}-menu`;

  // The wrapper is measured rather than the trigger, so a custom trigger
  // does not have to forward a ref.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useTypeahead();

  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [startAt, setStartAt] = useState<"first" | "last">("first");

  function measure(): Place | null {
    const anchor = anchorRef.current;
    if (!anchor) return null;
    const height = items.reduce((sum, item) => sum + (item.description ? 60 : 44), 16);
    return placePanel(anchor, { align, minWidth: 200, height });
  }

  function show(from: "first" | "last") {
    const next = measure();
    if (!next) return;
    setPlace(next);
    setStartAt(from);
    setOpen(true);
  }

  function hide(refocus = true) {
    setOpen(false);
    if (refocus) document.getElementById(triggerId)?.focus();
  }

  function choose(item: MenuItem) {
    if (item.disabled) return;
    // Focus goes home before the action runs, so a Modal the action opens
    // remembers the trigger and hands focus back to it when it closes.
    hide();
    item.onSelect();
  }

  useFloatingDismiss({
    open,
    anchorRef,
    panelRef,
    onDismiss: () => setOpen(false),
    onReposition: () => {
      const next = measure();
      if (next) setPlace(next);
    },
  });

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const nodes = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!nodes || nodes.length === 0) return;
      nodes[startAt === "last" ? nodes.length - 1 : 0].focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, startAt]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (nodes.length === 0) return;
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => nodes[(index + nodes.length) % nodes.length].focus();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at < 0 ? nodes.length - 1 : at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(nodes.length - 1);
        return;
      case "Escape":
        // Stopped here so a Modal around the menu stays open.
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
    if (isPrintable(event)) {
      const match = findByPrefix(items, typeahead(event.key), at);
      if (match >= 0) go(match);
    }
  }

  const triggerProps: MenuTriggerProps = {
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: (event) => {
      // Row menus sit inside clickable rows; opening one must not open the row too.
      event.stopPropagation();
      if (open) hide(false);
      else show("first");
    },
    onKeyDown: (event) => {
      // Enter and Space arrive as a click.
      if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      event.preventDefault();
      show(event.key === "ArrowUp" ? "last" : "first");
    },
  };

  const triggerNode =
    typeof trigger === "function" ? (
      <CustomTrigger render={trigger} props={triggerProps} open={open} />
    ) : typeof trigger === "string" ? (
      <button
        type="button"
        {...triggerProps}
        className={`inline-flex h-10 items-center gap-2.5 rounded-full border-[1.5px] border-[var(--dark)] px-5 text-[14px] font-medium tracking-[0.01em] outline-none transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 ${
          open ? "bg-[var(--dark)] text-[var(--cream)]" : "text-[var(--foreground)]"
        }`}
      >
        {trigger}
        <Chevron open={open} variant="pill" />
      </button>
    ) : (
      <button
        type="button"
        {...triggerProps}
        aria-label={label ?? "More actions"}
        className={`flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--sand)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/15 ${
          open ? "bg-[var(--sand)] text-[var(--foreground)]" : "text-[var(--muted)]"
        }`}
      >
        <Dots />
      </button>
    );

  return (
    <>
      <span ref={anchorRef} className={`inline-flex ${className}`}>
        {triggerNode}
      </span>

      <FloatingPanel open={open} place={place} panelRef={panelRef}>
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          aria-orientation="vertical"
          onKeyDown={onMenuKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              // Disabled items stay reachable, as the pattern asks, so a
              // screen reader can still say the action exists.
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              onClick={() => choose(item)}
              onPointerMove={focusUnderPointer}
              className={`${ITEM} ${
                item.danger
                  ? "text-[var(--danger)] focus:bg-[var(--danger-soft)]"
                  : "text-[var(--foreground)] focus:bg-[var(--sand)]"
              } ${item.disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              {item.icon ? (
                <span
                  aria-hidden
                  className={`mt-0.5 flex shrink-0 ${item.danger ? "" : "text-[var(--muted)]"}`}
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--muted)]">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}
