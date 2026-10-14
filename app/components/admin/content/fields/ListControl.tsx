"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "motion/react";
import Button from "@/components/ui/Button";
import Tooltip from "@/components/ui/Tooltip";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { fieldDefault, type Field, type ListField } from "@/lib/content/schema";
import { pathKey, type Path } from "@/lib/content/validate";
import { fillTokens } from "@/lib/content/tokens";
import { LABEL } from "./FieldShell";
import { useForm } from "./context";
import { GlyphArrowDown, GlyphArrowUp, GlyphChevron, GlyphGrip, GlyphPlus } from "../icons";
import { IconTrash } from "@/components/ui/icons";

/**
 * Repeated items — questions, cards, steps, the lines of a heading — added,
 * removed and put in order: by dragging the handle, or with the up and down
 * buttons, which are the way for a keyboard and the surer way on a phone.
 *
 * Items that are cards of several fields fold up to a line each, so a list
 * of twelve questions can be put in order without scrolling past every
 * answer. A heading's lines show the heading as it will read, last line in
 * italics.
 */

export type RenderItem = (args: {
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
  path: Path;
  label: string;
  /** The item's header already names it: a single control inside should not say it again. */
  hideLabel: boolean;
}) => React.ReactNode;

const ROUND =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] outline-none transition-colors hover:bg-[var(--sand)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 disabled:pointer-events-none disabled:opacity-30";

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A line to show for a folded card: its first words. */
function summaryOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    for (const part of Object.values(value)) {
      const words = summaryOf(part);
      if (words.trim()) return words;
    }
  }
  return "";
}

export default function ListControl({
  field,
  value,
  onChange,
  path,
  renderItem,
}: {
  field: ListField;
  value: unknown[];
  onChange: (next: unknown[]) => void;
  path: Path;
  renderItem: RenderItem;
}) {
  const { problem, problemsUnder } = useForm();
  const base = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const key = pathKey(path);
  const issue = problem(key, true);
  const folds = field.item.kind === "group";
  const itemName = field.itemLabel.toLowerCase();

  // A key for each item that follows it as it moves, so a folded or open
  // card stays so, and the drag knows which is which. When the list changes
  // length from elsewhere (somebody else's draft, an old version put back),
  // the keys are fitted to it here, as it renders.
  const [ids, setIds] = useState(() => ({ list: value.map((_, i) => `${base}-${i}`), next: value.length }));
  if (ids.list.length !== value.length) {
    const list = ids.list.slice(0, value.length);
    let next = ids.next;
    while (list.length < value.length) list.push(`${base}-${next++}`);
    setIds({ list, next });
  }
  const keys = value.map((_, i) => ids.list[i] ?? `${base}-new-${i}`);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const canAdd = value.length < field.max;
  const canRemove = value.length > field.min;

  function reorder(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return;
    onChange(move(value, from, to));
    setIds({ ...ids, list: move(keys, from, to) });
  }

  function add() {
    if (!canAdd) return;
    const id = `${base}-${ids.next}`;
    onChange([...value, fieldDefault(field.item)]);
    setIds({ list: [...keys, id], next: ids.next + 1 });
    if (folds) setOpen(new Set(open).add(id));
    // Straight into the new item's first box.
    requestAnimationFrame(() => {
      const items = listRef.current?.querySelectorAll<HTMLElement>(":scope > li");
      items?.[items.length - 1]?.querySelector<HTMLElement>("input, textarea")?.focus();
    });
  }

  function remove(index: number) {
    if (!canRemove) return;
    onChange(value.filter((_, i) => i !== index));
    setIds({ ...ids, list: keys.filter((_, i) => i !== index) });
  }

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  const headingPreview = field.itemLabel === "Line" && value.every((v) => typeof v === "string");

  return (
    <div role="group" aria-labelledby={`${base}-label`}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <p id={`${base}-label`} className={LABEL}>
          {field.label}
        </p>
        <span className="text-[11.5px] tabular-nums text-[var(--muted)]">
          {value.length} of {field.max === field.min ? field.max : `${field.min}–${field.max}`}
        </span>
      </div>
      {field.help ? <p className="mb-3 text-[12px] leading-snug text-[var(--muted)]">{field.help}</p> : null}

      <Reorder.Group
        ref={listRef}
        as="ul"
        axis="y"
        values={keys}
        onReorder={(order: string[]) => {
          const next = order.map((id) => value[keys.indexOf(id)]);
          onChange(next);
          setIds({ ...ids, list: order });
        }}
        className="space-y-2.5"
      >
        {value.map((item, index) => {
          const id = keys[index];
          const itemPath = [...path, index];
          const label = `${field.itemLabel} ${index + 1}`;
          const isOpen = !folds || open.has(id);
          const errors = problemsUnder(pathKey(itemPath));
          return (
            <Item key={id} id={id}>
              {(startDrag) => (
                <div className="rounded-[20px] border border-[var(--dark)]/10 bg-[var(--surface)] shadow-[var(--shadow-card)]">
                  <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
                    <span
                      aria-hidden
                      title="Drag to move"
                      onPointerDown={startDrag}
                      className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--sand)] active:cursor-grabbing"
                    >
                      <GlyphGrip size={16} />
                    </span>
                    {folds ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`${id}-body`}
                        onClick={() => toggle(id)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left outline-none hover:bg-[var(--sand)]/60 focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                      >
                        <span className="shrink-0 text-[13px] font-medium">{label}</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--muted)]">
                          {isOpen ? "" : fillTokens(summaryOf(item)) || "Empty"}
                        </span>
                        {errors ? (
                          <span
                            data-problem
                            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--danger)] px-1.5 text-[10.5px] font-medium tabular-nums text-white"
                          >
                            {errors}
                            <span className="sr-only"> to fix</span>
                          </span>
                        ) : null}
                        <GlyphChevron open={isOpen} size={15} className="shrink-0 text-[var(--muted)]" />
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 px-2 text-[13px] font-medium">{label}</span>
                    )}
                    <Tooltip content={`Move ${label.toLowerCase()} up`}>
                      <button
                        type="button"
                        aria-label={`Move ${label.toLowerCase()} up`}
                        disabled={index === 0}
                        onClick={() => reorder(index, index - 1)}
                        className={ROUND}
                      >
                        <GlyphArrowUp size={16} />
                      </button>
                    </Tooltip>
                    <Tooltip content={`Move ${label.toLowerCase()} down`}>
                      <button
                        type="button"
                        aria-label={`Move ${label.toLowerCase()} down`}
                        disabled={index === value.length - 1}
                        onClick={() => reorder(index, index + 1)}
                        className={ROUND}
                      >
                        <GlyphArrowDown size={16} />
                      </button>
                    </Tooltip>
                    <Tooltip content={canRemove ? `Remove ${label.toLowerCase()}` : `Keep at least ${field.min}`}>
                      <button
                        type="button"
                        aria-label={`Remove ${label.toLowerCase()}`}
                        disabled={!canRemove}
                        onClick={() => remove(index)}
                        className={`${ROUND} hover:text-[var(--danger)]`}
                      >
                        <IconTrash size={16} />
                      </button>
                    </Tooltip>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        id={`${id}-body`}
                        initial={folds ? { height: 0, opacity: 0 } : false}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING_SNAP}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1">
                          {renderItem({
                            field: field.item,
                            value: item,
                            onChange: (next) => onChange(value.map((v, i) => (i === index ? next : v))),
                            path: itemPath,
                            label,
                            hideLabel: !folds,
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}
            </Item>
          );
        })}
      </Reorder.Group>

      {headingPreview && value.length > 0 ? (
        <div aria-hidden className="mt-3 rounded-[20px] bg-[var(--cream)] px-5 py-4">
          <p className="text-[10.5px] uppercase tracking-[0.24em] text-[var(--muted)]">Reads as</p>
          <p className="font-display mt-1.5 text-[22px] font-medium leading-[1.1]">
            {(value as string[]).map((line, i) => (
              <span
                key={keys[i]}
                className={`block ${i === value.length - 1 && value.length > 1 ? "display-accent" : ""}`}
              >
                {fillTokens(line) || " "}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {issue ? <p className="mt-2 text-[12.5px] leading-snug text-[var(--danger)]">{issue}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={add} disabled={!canAdd}>
          <span className="flex items-center gap-2">
            <GlyphPlus size={15} />
            Add {itemName}
          </span>
        </Button>
        {!canAdd ? (
          <span className="text-[12px] text-[var(--muted)]">
            At most {field.max}. Remove one to add another.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One item, dragged by its handle only — the rest of it is for typing in. */
function Item({ id, children }: { id: string; children: (startDrag: (event: React.PointerEvent) => void) => React.ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      as="li"
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.01, boxShadow: "var(--shadow-floating)", zIndex: 5 }}
      transition={SPRING_SNAP}
      className="relative list-none rounded-[20px]"
    >
      {children((event) => controls.start(event))}
    </Reorder.Item>
  );
}
