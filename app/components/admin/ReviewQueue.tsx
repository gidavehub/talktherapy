"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../AuthProvider";
import { EmptyState, Skeleton } from "../ui/Feedback";
import { IconShield } from "../ui/icons";
import StatCard from "../ui/StatCard";
import { firebaseConfigured, firestore } from "../../lib/firebase";
import { COLLECTIONS } from "../../lib/models";
import { formatDalasi } from "../../lib/money";
import { useNow } from "../../lib/useNow";
import { PAYOUT_STATUS_LABELS } from "../../lib/adminOps";
import type { PayoutStatus } from "../../lib/payouts";
import { purposeLabel } from "./ops/columns";
import { banjulDateTime, banjulSlot, relativeTime } from "./ops/format";
import { Chip, LoadError, PersonLink, Reference, Section } from "./ops/parts";
import ReviewActions, { type ReviewKind } from "./ops/ReviewActions";

/**
 * What is waiting for a person.
 *
 * The payment and payout code refuses to guess — a payment whose amount did
 * not match, one nobody could be matched to, a second purchase, a payout that
 * may have paid twice or came back, a session a patient says did not happen.
 * Each was parked here instead. Somebody has to watch this from day one, or a
 * person who paid waits for ever.
 *
 * Live: items arrive as they are parked and leave as they are decided. Every
 * decision goes through the resolveReview function, which records who made it.
 */

type Item = { id: string; data: Record<string, unknown> };
/** Null while the first answer is on its way. */
type Queue = { items: Item[] | null; error: boolean };

function watch(field: string, collectionName: string, onItems: (items: Item[]) => void, onError: () => void) {
  if (!firebaseConfigured()) {
    onItems([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), collectionName), where(field, "==", true)),
    (snap) =>
      onItems(
        snap.docs
          .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
          .sort((a, b) => Number(a.data.updatedAt ?? 0) - Number(b.data.updatedAt ?? 0)),
      ),
    onError,
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const time = (v: unknown) => (typeof v === "number" ? v : null);
const payoutStatus = (status: string) =>
  Object.hasOwn(PAYOUT_STATUS_LABELS, status) ? PAYOUT_STATUS_LABELS[status as PayoutStatus] : status || "status unknown";

const WAITING: Queue = { items: null, error: false };

export default function ReviewQueue() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const now = useNow(60_000);
  const [payments, setPayments] = useState<Queue>(WAITING);
  const [payouts, setPayouts] = useState<Queue>(WAITING);
  const [sessions, setSessions] = useState<Queue>(WAITING);
  /** Bumped by "Try again": the listeners start over. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const listen = (field: string, name: string, set: (q: Queue) => void) =>
      watch(
        field,
        name,
        (items) => set({ items, error: false }),
        () => set({ items: [], error: true }),
      );
    const a = listen("needsReview", COLLECTIONS.payments, setPayments);
    const b = listen("needsReview", COLLECTIONS.payouts, setPayouts);
    const c = listen("disputed", COLLECTIONS.bookings, setSessions);
    return () => {
      a();
      b();
      c();
    };
  }, [isAdmin, attempt]);

  if (!isAdmin) {
    return <EmptyState icon={<IconShield />} title="Staff only" description="This page is for the TALK team." />;
  }

  const retry = () => {
    setPayments(WAITING);
    setPayouts(WAITING);
    setSessions(WAITING);
    setAttempt((n) => n + 1);
  };
  const count = (q: Queue) => (q.items === null ? "—" : q.error ? "?" : q.items.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Payments held" value={count(payments)} loading={payments.items === null} caption="Money in, not yet used" />
        <StatCard label="Payouts flagged" value={count(payouts)} loading={payouts.items === null} caption="Money out, to check in Modem Pay" />
        <StatCard
          label="Sessions disputed"
          value={count(sessions)}
          loading={sessions.items === null}
          caption="The provider's fee is held"
        />
      </div>

      <QueueSection
        title="Payments held for review"
        explain="Money arrived but was not used for anything automatically. Grant delivers what it paid for; refunded records that you refunded it in the Modem Pay dashboard."
        queue={payments}
        onRetry={retry}
        kind="payment"
        render={(p) => ({
          amount: num(p.data.amountMinor),
          heading: purposeLabel(str(p.data.purpose) || null),
          reason: str(p.data.reviewReason) || "Held for review",
          who: str(p.data.uid) ? (
            <PersonLink uid={str(p.data.uid)} name={str(p.data.customerEmail) || "Their account"} />
          ) : (
            <span>{str(p.data.customerEmail) || "Payer unknown"}</span>
          ),
          at: time(p.data.updatedAt),
        })}
        now={now}
      />
      <QueueSection
        title="Payouts flagged"
        explain="A provider may have been paid twice for a session, a transfer came back, or TALK's side refused it (key, balance, limits). Check Modem Pay, put it right there, then mark it as dealt with."
        queue={payouts}
        onRetry={retry}
        kind="payout"
        render={(p) => ({
          amount: num(p.data.amountMinor),
          heading: `To ${str(p.data.beneficiaryName) || "a provider"} · ${payoutStatus(str(p.data.status))}`,
          reason: str(p.data.reviewReason) || "Flagged",
          who: str(p.data.providerId) ? <PersonLink uid={str(p.data.providerId)} name="The provider" /> : null,
          at: time(p.data.updatedAt),
        })}
        now={now}
      />
      <QueueSection
        title="Sessions a patient says did not happen"
        explain="The provider's fee for these is held. Pay the provider if it happened; otherwise it comes out of their earnings and the patient is owed a refund, made in the Modem Pay dashboard."
        queue={sessions}
        onRetry={retry}
        kind="session"
        render={(s) => ({
          amount: num(s.data.amountMinor),
          heading: `Session ${banjulSlot(time(s.data.startsAt), time(s.data.endsAt))}`,
          reason: s.data.disputedAt ? `Reported ${banjulDateTime(time(s.data.disputedAt), now)}` : "Reported by the patient",
          who: (
            <span>
              <PersonLink uid={str(s.data.patientId)} name="The patient" />
              {" with "}
              <PersonLink uid={str(s.data.providerId)} name="the provider" />
            </span>
          ),
          at: time(s.data.updatedAt),
        })}
        now={now}
      />
    </div>
  );
}

type Shown = { amount: number; heading: string; reason: string; who: React.ReactNode; at: number | null };

function QueueSection({
  title,
  explain,
  queue,
  onRetry,
  kind,
  render,
  now,
}: {
  title: string;
  explain: string;
  queue: Queue;
  onRetry: () => void;
  kind: ReviewKind;
  render: (item: Item) => Shown;
  now: number;
}) {
  const { items, error } = queue;
  return (
    <Section
      title={title}
      aside={items && !error ? <Chip tone={items.length ? "accent" : "muted"}>{items.length} waiting</Chip> : undefined}
    >
      <p className="-mt-2 mb-5 max-w-[680px] text-[13px] leading-relaxed text-[var(--muted)]">{explain}</p>
      {error ? (
        <LoadError
          message="This queue could not be loaded. Your staff access may need a moment — try again."
          onRetry={onRetry}
        />
      ) : items === null ? (
        <div role="status" aria-label={`Loading ${title.toLowerCase()}`} className="space-y-3">
          <Skeleton className="h-28" rounded="rounded-[22px]" />
          <Skeleton className="h-28" rounded="rounded-[22px]" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-[22px] bg-[var(--background)] px-5 py-4 text-[13.5px] text-[var(--muted)]">Nothing waiting.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const shown = render(item);
            return (
              <li key={item.id} className="rounded-[22px] bg-[var(--background)] px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-display text-[22px] font-medium leading-tight">{formatDalasi(shown.amount)}</p>
                  {shown.at !== null ? (
                    <span className="text-[12px] text-[var(--muted)]" title={`${banjulDateTime(shown.at)} Banjul time`}>
                      {relativeTime(shown.at, now)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[14px] font-medium">{shown.heading}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{shown.reason}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{shown.who}</p>
                <p className="mt-2">
                  <Reference>{item.id}</Reference>
                </p>
                <div className="mt-4">
                  <ReviewActions kind={kind} id={item.id} summary={`${formatDalasi(shown.amount)} · ${shown.heading}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
