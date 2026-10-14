"use client";

import { themeVariables, type ThemeColors } from "@/lib/content/theme";

/**
 * The palette being edited, on the things it colours: a heading with its
 * italic sage line, the buttons, a card, a cream band, the footer band and
 * TALK's screen. The colours are set on this one element, so the samples
 * take them and the rest of the editor keeps the live palette — a palette
 * half-chosen can never make the editor itself hard to read.
 */
export default function ThemeSample({ colors }: { colors: ThemeColors }) {
  return (
    <div
      style={themeVariables(colors)}
      className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-card)]"
    >
      <div className="px-5 pb-6 pt-6 md:px-7">
        <p className="eyebrow flex items-center gap-3">
          <span className="h-[2px] w-8 bg-[var(--accent)]" aria-hidden />
          Care that understands your world
        </p>
        <p className="font-display mt-4 text-[32px] font-medium leading-[1.05] md:text-[38px]">
          Talk it through,
          <span className="display-accent block">your own way.</span>
        </p>
        <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-[var(--foreground)]/80">
          Private conversations with TALK and qualified providers.
        </p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">Quieter words, for times and notes.</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <span className="inline-flex h-11 items-center rounded-full bg-[var(--accent)] px-6 text-[14px] font-medium text-white shadow-[var(--shadow-accent)]">
            Begin with TALK
          </span>
          <span className="inline-flex h-11 items-center rounded-full bg-[var(--accent-deep)] px-6 text-[14px] font-medium text-white">
            Pointed at
          </span>
          <span className="inline-flex h-11 items-center rounded-full border-[1.5px] border-[var(--dark)] px-6 text-[14px] font-medium">
            Meet providers
          </span>
          <span className="inline-flex h-11 items-center rounded-full bg-[var(--sage)] px-6 text-[14px] font-medium text-white">
            Sage
          </span>
        </div>
      </div>

      <div className="bg-[var(--cream)] px-5 py-6 md:px-7">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="rounded-[22px] border border-[var(--dark)]/[0.05] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <span className="arch flex h-14 w-12 shrink-0 items-end justify-center rounded-b-xl bg-[var(--peach)] pb-2 text-[13px] font-medium text-[var(--dark)]">
                AJ
              </span>
              <div className="min-w-0">
                <p className="font-display text-[18px] font-medium leading-tight">A provider&rsquo;s card</p>
                <p className="text-[12.5px] text-[var(--muted)]">Wolof, English · Banjul</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed">Words on the white cards, where most of the reading happens.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--sage)] px-3 text-[11.5px] font-medium text-white">
                Next available: today
              </span>
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--sand)] px-3 text-[11.5px]">Sand</span>
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--sage-pale)] px-3 text-[11.5px]">Pale sage</span>
            </div>
          </div>
          <div aria-hidden className="flex items-end justify-center gap-2">
            <span className="arch block h-24 w-12 rounded-b-xl bg-[var(--sage-soft)]" />
            <span className="arch block h-28 w-12 rounded-b-xl bg-[var(--sage)]" />
            <span className="arch block h-20 w-12 rounded-b-xl bg-[var(--accent-soft)]" />
            <span className="arch block h-16 w-12 rounded-b-xl bg-[var(--sage-deep)]" />
          </div>
        </div>
      </div>
      <div className="zigzag bg-[var(--cream)]" aria-hidden />

      <div className="bg-[var(--dark)] px-5 py-6 text-[var(--cream)] md:px-7">
        <p className="font-display text-[26px] font-medium">TALK</p>
        <p className="mt-1 text-[11px] tracking-[0.32em] text-[var(--on-dark-muted)]">LISTEN SUPPORT HEAL GROW</p>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <span>Providers</span>
          <span>How it works</span>
          <span>Pricing</span>
          <span className="text-[var(--on-dark-muted)]">Privacy</span>
        </p>
      </div>

      <div className="bg-[var(--background)] p-5 md:p-7">
        <div className="relative flex aspect-[16/7] min-h-[150px] flex-col items-center justify-center overflow-hidden rounded-[22px] bg-[var(--stage)]">
          <span
            aria-hidden
            className="block h-20 w-20 rounded-full"
            style={{
              background: "radial-gradient(circle at 35% 35%, var(--peach), var(--accent) 55%, var(--sage) 100%)",
              boxShadow: "0 0 60px 6px color-mix(in srgb, var(--accent) 45%, transparent)",
            }}
          />
          <p className="mt-4 text-[13px] text-[var(--cream)]">TALK is listening…</p>
        </div>
      </div>
    </div>
  );
}
