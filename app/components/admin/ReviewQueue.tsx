"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../AuthProvider";
import Button from "../ui/Button";
import { Alert, EmptyState, Skeleton } from "../ui/Feedback";
import { IconShield } from "../ui/icons";
import { firebaseConfigured, firebaseFunctions, firestore } from "../../lib/firebase";
import { COLLECTIONS } from "../../lib/models";
import { formatDalasi } from "../../lib/money";

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

function watch(field: string, collectionName: string, cb: (items: Item[]) => void) {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), collectionName), where(field, "==", true)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
          .sort((a, b) => Number(a.data.updatedAt ?? 0) - Number(b.data.updatedAt ?? 0)),
      ),
    () => cb([]),
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const when = (v: unknown) =>
  typeof v === "number"
    ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

export default function ReviewQueue() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [payments, setPayments] = useState<Item[] | null>(null);
  const [payouts, setPayouts] = useState<Item[] | null>(null);
  const [sessions, setSessions] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const a = watch("needsReview", COLLECTIONS.payments, setPayments);
    const b = watch("needsReview", COLLECTIONS.payouts, setPayouts);
    const c = watch("disputed", COLLECTIONS.bookings, setSessions);
    return () => {
      a();
      b();
      c();
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return <EmptyState icon={<IconShield />} title="Staff only" description="This page is for the Talk team." />;
  }

  return (
    <div className="space-y-10">
      <Queue
        title="Payments held for review"
        explain="Money arrived but was not used for anything automatically. Grant delivers what it paid for; refunded records that you refunded it in the Modem Pay dashboard."
        items={payments}
        render={(p) => ({
          heading: `${formatDalasi(num(p.data.amountMinor))} · ${str(p.data.purpose) || "unknown purpose"}`,
          detail: `${str(p.data.reviewReason) || "Held for review"} — ${str(p.data.customerEmail) || str(p.data.uid) || "payer unknown"} · ${when(p.data.updatedAt)} · ${p.id}`,
          actions: [
            { decision: "grant", label: "Grant it" },
            { decision: "refunded", label: "Refunded" },
          ],
          kind: "payment",
        })}
      />
      <Queue
        title="Payouts flagged"
        explain="A provider may have been paid twice for a session, a transfer came back, or Talk's side refused it (key, balance, limits). Check Modem Pay, put it right there, then acknowledge."
        items={payouts}
        render={(p) => ({
          heading: `${formatDalasi(num(p.data.amountMinor))} to ${str(p.data.beneficiaryName)} · ${str(p.data.status)}`,
          detail: `${str(p.data.reviewReason) || "Flagged"} · ${when(p.data.updatedAt)} · ${p.id}`,
          actions: [{ decision: "acknowledged", label: "Dealt with" }],
          kind: "payout",
        })}
      />
      <Queue
        title="Sessions a patient says did not happen"
        explain="The provider's fee for these is held. Pay the provider if it happened; otherwise it comes out of their earnings and the patient is owed a refund, made in the Modem Pay dashboard."
        items={sessions}
        render={(s) => ({
          heading: `${formatDalasi(num(s.data.amountMinor))} · ${when(s.data.startsAt)}`,
          detail: `Patient ${str(s.data.patientId)} · provider ${str(s.data.providerId)} · reported ${when(s.data.disputedAt)} · ${s.id}`,
          actions: [
            { decision: "pay-provider", label: "It happened — pay the provider" },
            { decision: "refund-patient", label: "It did not — refund the patient" },
          ],
          kind: "session",
        })}
      />
    </div>
  );
}

function Queue({
  title,
  explain,
  items,
  render,
}: {
  title: string;
  explain: string;
  items: Item[] | null;
  render: (item: Item) => {
    heading: string;
    detail: string;
    actions: { decision: string; label: string }[];
    kind: "payment" | "payout" | "session";
  };
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-medium">{title}</h2>
        {items ? <span className="text-[12px] text-[var(--muted)]">{items.length} waiting</span> : null}
      </div>
      <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[var(--muted)]">{explain}</p>
      <div className="mt-4 space-y-2">
        {items === null ? (
          <Skeleton className="h-20" />
        ) : items.length === 0 ? (
          <p className="rounded-[18px] bg-white px-4 py-4 text-[13px] text-[var(--muted)]">Nothing waiting.</p>
        ) : (
          items.map((item) => <ReviewRow key={item.id} item={item} {...render(item)} />)
        )}
      </div>
    </section>
  );
}

function ReviewRow({
  item,
  heading,
  detail,
  actions,
  kind,
}: {
  item: Item;
  heading: string;
  detail: string;
  actions: { decision: string; label: string }[];
  kind: "payment" | "payout" | "session";
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: string) {
    setBusy(decision);
    setError(null);
    try {
      await httpsCallable(firebaseFunctions(), "resolveReview")({ kind, id: item.id, decision, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[18px] bg-white px-4 py-4">
      <p className="text-[14.5px] font-medium">{heading}</p>
      <p className="mt-1 break-words text-[12.5px] leading-relaxed text-[var(--muted)]">{detail}</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note for the record (what you did, and why)"
        aria-label="A note for the record"
        className="mt-3 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-[13px] outline-none focus:border-[var(--accent)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.decision}
            size="sm"
            variant={a === actions[0] ? "primary" : "secondary"}
            withArrow={false}
            loading={busy === a.decision}
            disabled={busy !== null}
            onClick={() => void decide(a.decision)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {error ? (
        <Alert tone="crisis" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
