"use client";

import { AnimatePresence, motion } from "motion/react";
import { Dropdown } from "../../ui/Dropdown";
import Button from "../../ui/Button";
import { IconTrash } from "../../ui/icons";
import { SPRING_SOFT } from "../../motion/primitives";
import { newId } from "@/lib/providerApplication-client";
import {
  DAYS,
  SLOT_MINUTES,
  minutesOf,
  startsIn,
  weeklySessions,
  type AvailabilityRange,
} from "@/lib/providerApplication";
import type { StepProps } from "./types";

/**
 * Every half hour from 06:00 to 23:00, on the 24-hour clock — the way the
 * review screens show them, and short enough for two to sit side by side on
 * a small phone.
 */
const TIMES = Array.from({ length: 35 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});
const TIME_OPTIONS = TIMES.map((t) => ({ value: t, label: t }));

const WEEKDAYS = [1, 2, 3, 4, 5];

export default function AvailabilityStep({ value, onChange, problems }: StepProps<"availability">) {
  const ranges = value.ranges;
  const set = (next: AvailabilityRange[], immediate = false) => onChange({ ranges: next }, { immediate });

  const add = (day: number) => {
    const last = ranges.filter((r) => r.day === day).at(-1);
    const startMin = last ? (minutesOf(last.end) ?? 9 * 60) + 60 : 9 * 60;
    const start = TIMES.find((t) => (minutesOf(t) ?? 0) >= Math.min(startMin, 20 * 60)) ?? "09:00";
    const endMin = Math.min((minutesOf(start) ?? 540) + 180, 23 * 60);
    const end = TIMES.find((t) => (minutesOf(t) ?? 0) >= endMin) ?? "23:00";
    set([...ranges, { id: newId("r"), day, start, end }], true);
  };

  const update = (id: string, patch: Partial<AvailabilityRange>) =>
    set(ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => set(ranges.filter((r) => r.id !== id), true);

  const monday = ranges.filter((r) => r.day === 1);
  const copyMonday = () =>
    set(
      [
        ...ranges.filter((r) => !WEEKDAYS.includes(r.day) || r.day === 1),
        ...WEEKDAYS.filter((d) => d !== 1).flatMap((day) =>
          monday.map((r) => ({ id: newId("r"), day, start: r.start, end: r.end })),
        ),
      ],
      true,
    );

  const perWeek = weeklySessions(ranges);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-[22px] bg-[var(--background)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] leading-relaxed">
          {perWeek > 0 ? (
            <>
              That is <span className="font-medium">{perWeek} session{perWeek === 1 ? "" : "s"}</span> a week — {SLOT_MINUTES}{" "}
              minutes each, starting on the hour.
            </>
          ) : (
            "Add the times you can usually see people. Gambian time."
          )}
        </p>
        {monday.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={copyMonday}>
            Copy Monday to every weekday
          </Button>
        ) : null}
      </div>

      {problems.list ? (
        <p role="alert" className="text-[13px] text-[var(--accent)]">
          {problems.list}
        </p>
      ) : null}

      <ul className="space-y-3">
        {DAYS.map((day) => {
          const mine = ranges
            .map((r, index) => ({ r, index }))
            .filter(({ r }) => r.day === day.value);
          return (
            <li
              key={day.value}
              className={`rounded-[22px] border p-3 transition-colors sm:p-4 md:p-5 ${
                mine.length ? "border-[var(--sage)]/40 bg-[var(--surface)]" : "border-[var(--dark)]/10 bg-transparent"
              }`}
            >
              {/* On a phone the day sits above its hours, so two times fit
                  side by side; from sm up it is a column of its own. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex items-baseline justify-between gap-3 px-1 sm:block sm:w-[88px] sm:shrink-0 sm:px-0 sm:pt-2.5">
                  <p className="text-[14px] font-medium">{day.label}</p>
                  <p className="text-[12px] text-[var(--muted)]">
                    {mine.length ? `${mine.reduce((n, { r }) => n + startsIn(r).length, 0)} sessions` : "Not working"}
                  </p>
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <AnimatePresence initial={false}>
                    {mine.map(({ r, index }) => (
                      <motion.div
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={SPRING_SOFT}
                      >
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Dropdown
                            label={`${day.label} from`}
                            hideLabel
                            size="sm"
                            value={r.start}
                            onChange={(start) => update(r.id, { start })}
                            options={TIME_OPTIONS}
                            className="min-w-0 flex-1"
                          />
                          <span aria-hidden className="text-[12.5px] text-[var(--muted)]">
                            –
                          </span>
                          <Dropdown
                            label={`${day.label} until`}
                            hideLabel
                            size="sm"
                            value={r.end}
                            onChange={(end) => update(r.id, { end })}
                            options={TIME_OPTIONS}
                            className="min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => remove(r.id)}
                            aria-label={`Remove ${day.label} ${r.start} to ${r.end}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--sand)] hover:text-[var(--danger)]"
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                        {problems[`${index}`] ? (
                          <p className="mt-1.5 text-[12.5px] text-[var(--accent)]">{problems[`${index}`]}</p>
                        ) : null}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button
                    type="button"
                    onClick={() => add(day.value)}
                    className="flex h-11 items-center rounded-full px-1 text-[13px] font-medium text-[var(--accent-deep)] hover:underline"
                  >
                    + {mine.length ? "Add more hours" : "Add hours"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
