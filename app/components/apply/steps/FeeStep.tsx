"use client";

import { useId } from "react";
import { Slider } from "../fields";
import { formatDalasi, platformFeeMinor, PLATFORM_FEE_RATE, toMajor, toMinor } from "@/lib/money";
import { RATE_RANGE, SLOT_MINUTES, takeHomeMinor } from "@/lib/providerApplication";
import type { StepProps } from "./types";

const STEP = 50_00;

export default function FeeStep({ value, onChange, problems }: StepProps<"fee">) {
  const inputId = useId();
  const fee = value.sessionRateMinor;
  const shown = fee ?? RATE_RANGE.min;
  const percent = Math.round(PLATFORM_FEE_RATE * 100);

  return (
    <div className="space-y-8">
      <div className="rounded-[26px] bg-[var(--background)] p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Your fee for one session</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className={`font-display text-[52px] font-medium leading-none md:text-[64px] ${fee == null ? "text-[var(--muted)]" : ""}`}>
            {formatDalasi(shown)}
          </p>
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor={inputId} className="text-[13px] text-[var(--muted)]">
              or type it:
            </label>
            <div className="flex h-11 items-center rounded-full border border-[var(--dark)]/15 bg-[var(--surface)] px-4 focus-within:border-[var(--accent)]">
              <span className="text-[14px] text-[var(--muted)]">D</span>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={RATE_RANGE.min / 100}
                max={RATE_RANGE.max / 100}
                step={50}
                value={fee == null ? "" : toMajor(fee)}
                onChange={(e) => {
                  const major = Number(e.target.value);
                  onChange({ sessionRateMinor: e.target.value === "" || !Number.isFinite(major) ? null : toMinor(Math.round(major)) });
                }}
                className="w-[86px] bg-transparent pl-1 text-[15px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
        </div>
        <Slider
          label="Fee per session"
          value={shown}
          min={RATE_RANGE.min}
          max={RATE_RANGE.max}
          step={STEP}
          onChange={(next) => onChange({ sessionRateMinor: next })}
          format={(v) => formatDalasi(v)}
        />
        {problems.sessionRateMinor ? (
          <p role="alert" className="text-[13px] text-[var(--accent)]">
            {problems.sessionRateMinor}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-[22px] border border-[var(--dark)]/10 p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">People pay</p>
          <p className="font-display mt-2 text-[28px] font-medium">{formatDalasi(shown)}</p>
        </div>
        <div className="rounded-[22px] border border-[var(--dark)]/10 p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">TALK keeps {percent}%</p>
          <p className="font-display mt-2 text-[28px] font-medium">{formatDalasi(platformFeeMinor(shown))}</p>
        </div>
        <div className="rounded-[22px] bg-[var(--sage)] p-5 text-white">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/80">You receive</p>
          <p className="font-display mt-2 text-[28px] font-medium">{formatDalasi(takeHomeMinor(shown))}</p>
        </div>
      </div>

      <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
        <li>· Sessions are {SLOT_MINUTES} minutes, by video or voice call, inside TALK.</li>
        <li>· People see your fee before they book, and pay before the session.</li>
        <li>· A day after each session ends, your share can be sent to your wallet.</li>
        <li>· You can change your fee later from your profile.</li>
      </ul>
    </div>
  );
}
