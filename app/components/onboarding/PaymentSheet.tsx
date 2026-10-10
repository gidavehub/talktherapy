"use client";

import Link from "next/link";
import { motion } from "motion/react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { SPRING_SOFT } from "../motion/primitives";
import SpokenCaption from "./SpokenCaption";
import { formatDalasi } from "../../lib/money";
import { AI_TIERS, type AiTierId } from "../../lib/models";
import type { Saying } from "../../lib/audio/lines";
import type { useConsultation } from "../../lib/payments/consultation";

/**
 * "Confirm payment for consultation" — the owner's words, as the heading.
 *
 * Opens while Talk is saying the price, so the sheet and her voice arrive
 * together. Pay opens Modem Pay's checkout in a new tab and this one waits:
 * it moves on by itself the moment the payment lands, because the server
 * writes the consultation and this page is watching for it.
 *
 * Nothing here sends a price. The amount shown is AI_TIERS — the same table
 * the server prices from.
 */
export default function PaymentSheet({
  open,
  onClose,
  tier,
  consultation,
  saying,
}: {
  open: boolean;
  onClose: () => void;
  tier: AiTierId;
  consultation: ReturnType<typeof useConsultation>;
  /** What Talk is saying, shown at the top for anyone who cannot hear her. */
  saying?: Saying | null;
}) {
  const { amountMinor, label, blurb } = AI_TIERS[tier];
  const { phase, error, slow, pay, checkNow, startAgain } = consultation;
  const price = formatDalasi(amountMinor);

  return (
    <Modal open={open} onClose={onClose} title="Confirm payment for consultation" variant="responsive">
      <div className="space-y-5">
        <SpokenCaption saying={saying ?? null} tone="light" />

        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="rounded-[22px] bg-[var(--background)] px-5 py-5"
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
            <p className="text-[34px] leading-none font-medium tracking-tight">{price}</p>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)]">{blurb}</p>
          <p className="mt-3 text-[13px] text-[var(--foreground)]/80">
            Pay with Wave, Afrimoney, QMoney or a card.
          </p>
        </motion.div>

        {phase === "waiting" ? (
          <div role="status" aria-live="polite" className="rounded-[22px] border border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--accent)]" />
              </span>
              <p className="text-[14px] font-medium">Waiting for your payment</p>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
              Finish paying on the checkout page. This page moves on by itself the moment it arrives —
              you do not need to come back and press anything.
            </p>
            {slow ? (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                Taking longer than usual. If you have paid, it will still come through — this
                page keeps checking, and you can close this and come back.
              </p>
            ) : null}
          </div>
        ) : null}

        {phase === "held" ? (
          <Alert tone="warning" title="Your payment arrived — a person needs to check it">
            Nothing is lost. Something about it did not match what we expected, so it is waiting for our
            team rather than being guessed at.{" "}
            <Link href="/support" className="underline underline-offset-2">
              Contact support
            </Link>{" "}
            and we will sort it out.
          </Alert>
        ) : null}

        {error ? <Alert tone="crisis">{error}</Alert> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {phase === "waiting" ? (
            <>
              <Button variant="ghost" withArrow={false} onClick={() => void startAgain()}>
                Start again
              </Button>
              <Button variant="secondary" onClick={() => void checkNow()}>
                I&apos;ve paid — check now
              </Button>
            </>
          ) : phase === "held" ? (
            <Button variant="ghost" withArrow={false} onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" withArrow={false} onClick={onClose}>
                Not now
              </Button>
              <Button onClick={() => void pay()} loading={phase === "opening"}>
                Pay {price}
              </Button>
            </>
          )}
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          Secure checkout by Modem Pay. If you are in danger right now, do not wait to pay —{" "}
          <Link href="/crisis" className="underline underline-offset-2">
            urgent help is free
          </Link>
          .
        </p>
      </div>
    </Modal>
  );
}
