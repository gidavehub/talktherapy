"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { useHasDocument } from "./Dropdown";

/**
 * Tooltip — a small brown bubble that names an icon button or explains a
 * figure, shown on hover and on keyboard focus.
 *
 * Only for extra words. Anything someone must read to use the page belongs
 * on the page, because a phone has no hover and a tap is not a hover.
 *
 * The child must be a single focusable element that takes `aria-describedby`.
 * The description points at a hidden copy of the content that is always in
 * the page, so a screen reader hears it on focus without racing the bubble's
 * entrance; the visible bubble is aria-hidden to avoid saying it twice.
 *
 * The bubble is portalled for the same reason Dropdown's panel is: an
 * `overflow-hidden` card would otherwise clip it.
 */

type Side = "top" | "bottom" | "left" | "right";
type Spot = { side: Side; x: number; y: number };

const GAP = 8;
const EDGE = 8;

// Each side pins a different corner of the bubble to the spot. Tailwind 4
// writes these to the `translate` property, which leaves `transform` free for
// the entrance animation.
const ANCHORING: Record<Side, string> = {
  top: "-translate-x-1/2 -translate-y-full",
  bottom: "-translate-x-1/2",
  left: "-translate-x-full -translate-y-1/2",
  right: "-translate-y-1/2",
};

const DRIFT: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  left: { x: 4, y: 0 },
  right: { x: -4, y: 0 },
};

/** Where the bubble goes, on the opposite side when the asked-for one has no room. */
function spotFor(anchor: HTMLElement, preferred: Side): Spot {
  const rect = anchor.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  let side = preferred;
  if (side === "top" && rect.top < 48) side = "bottom";
  else if (side === "bottom" && window.innerHeight - rect.bottom < 48) side = "top";
  else if (side === "left" && rect.left < 160) side = "right";
  else if (side === "right" && width - rect.right < 160) side = "left";

  switch (side) {
    case "top":
      return { side, x: rect.left + rect.width / 2, y: rect.top - GAP };
    case "bottom":
      return { side, x: rect.left + rect.width / 2, y: rect.bottom + GAP };
    case "left":
      return { side, x: rect.left - GAP, y: rect.top + rect.height / 2 };
    case "right":
      return { side, x: rect.right + GAP, y: rect.top + rect.height / 2 };
  }
}

/**
 * Nudges a bubble that has mounted half off the screen back on. Its width
 * is only known once it exists, so this runs as a ref callback rather than
 * in `spotFor`.
 *
 * The edges are worked out from `offsetWidth` and the spot, not measured:
 * the bubble mounts scaled down for its entrance, so a measured box is a few
 * pixels narrower than the bubble ends up, and a tip by the right edge of a
 * phone screen would settle partly off it.
 */
function keepOnScreen(node: HTMLDivElement | null, spot: Spot) {
  if (!node) return;
  const width = node.offsetWidth;
  const viewport = document.documentElement.clientWidth;
  const left =
    spot.side === "left" ? spot.x - width : spot.side === "right" ? spot.x : spot.x - width / 2;
  const right = left + width;
  const shift =
    left < EDGE ? EDGE - left : right > viewport - EDGE ? viewport - EDGE - right : 0;
  // Cleared as well as set, because the bubble can be shown again at a new
  // spot without remounting.
  node.style.marginLeft = shift === 0 ? "" : `${shift}px`;
}

/** Focus that came from the keyboard. A click focusing a button should not pop a bubble. */
function focusIsVisible(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

export default function Tooltip({
  content,
  children,
  side = "top",
  delay = 150,
  className = "",
}: {
  content: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: Side;
  /** How long the pointer rests before the bubble appears, in milliseconds. */
  delay?: number;
  className?: string;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<{ id?: ReturnType<typeof setTimeout> }>({});
  const [spot, setSpot] = useState<Spot | null>(null);
  const hasDocument = useHasDocument();
  const shown = spot !== null;

  function show(after: number) {
    clearTimeout(timer.current.id);
    const reveal = () => {
      const anchor = anchorRef.current;
      if (anchor) setSpot(spotFor(anchor, side));
    };
    if (after > 0) timer.current.id = setTimeout(reveal, after);
    else reveal();
  }

  // A short grace period on the way out lets the pointer cross the gap onto
  // the bubble, so its words can be selected or magnified.
  function hide(after = 0) {
    clearTimeout(timer.current.id);
    if (after > 0) timer.current.id = setTimeout(() => setSpot(null), after);
    else setSpot(null);
  }

  // Escape dismisses it wherever focus is, and it never trails behind a
  // scrolling page or a window that has changed shape under it.
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpot(null);
    };
    const onMove = () => setSpot(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [shown]);

  useEffect(() => {
    const pending = timer.current;
    return () => clearTimeout(pending.id);
  }, []);

  if (content === null || content === undefined || content === "") return children;

  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return (
    <span
      ref={anchorRef}
      className={`inline-flex ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") show(delay);
      }}
      onPointerLeave={() => hide(80)}
      // Pressing the thing means the hint has done its job; it should not
      // sit over whatever the press opens.
      onPointerDown={() => hide()}
      onFocus={(event: FocusEvent) => {
        if (focusIsVisible(event.target)) show(0);
      }}
      onBlur={() => hide()}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span id={id} hidden>
        {content}
      </span>

      {hasDocument
        ? createPortal(
            <AnimatePresence>
              {spot ? (
                <motion.div
                  key="tooltip"
                  ref={(node: HTMLDivElement | null) => keepOnScreen(node, spot)}
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.96, ...DRIFT[spot.side] }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={SPRING_SNAP}
                  onPointerEnter={() => clearTimeout(timer.current.id)}
                  onPointerLeave={() => hide(80)}
                  // The bubble is a React child of the wrapper, so a press on
                  // it would reach the wrapper's onPointerDown and hide the
                  // very words someone is trying to select.
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ left: spot.x, top: spot.y }}
                  className={`fixed z-[80] w-max max-w-[240px] rounded-xl bg-[var(--dark)] px-3 py-2 text-[12.5px] leading-snug text-[var(--cream)] shadow-[var(--shadow-raised)] ${ANCHORING[spot.side]}`}
                >
                  {content}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </span>
  );
}
