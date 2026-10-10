"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import Card, { StatTile } from "../ui/Card";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { Alert, EmptyState, Skeleton } from "../ui/Feedback";
import { Input, Select } from "../ui/Input";
import { IconWallet } from "../ui/icons";
import { formatDalasi } from "../../lib/money";
import { PLATFORM_FEE_RATE } from "../../lib/money";
import {
  PAYOUT_HOLD_MS,
  PAYOUT_NETWORK_LABELS,
  maskWallet,
  type Payout,
  type PayoutAccount,
  type PayoutStatus,
} from "../../lib/payouts";
import {
  checkPayout,
  fetchEarnings,
  requestPayout,
  savePayoutAccount,
  watchPayoutAccount,
  watchPayouts,
  type Earnings,
} from "../../lib/payouts-client";
import { PAYOUT_NETWORKS, type PayoutNetwork } from "../../lib/payments/modempay-protocol";

/**
 * A provider's money: what they have earned, where it goes, and sending it.
 *
 * The numbers come from the server — the same count the payout itself uses —
 * so what this screen says is ready is exactly what is sent. Sending goes to
 * the provider's own wallet on Modem Pay (Wave, Afrimoney, QMoney or APS), the
 * way the owner's connekteasy pays out.
 */

const STATUS_COPY: Record<PayoutStatus, { label: string; tone: string }> = {
  initiating: { label: "Sending", tone: "text-[var(--muted)]" },
  pending: { label: "On its way", tone: "text-amber-700" },
  uncertain: { label: "Checking", tone: "text-amber-700" },
  completed: { label: "Sent", tone: "text-emerald-700" },
  failed: { label: "Did not go through", tone: "text-[var(--accent)]" },
};

const HOLD_HOURS = Math.round(PAYOUT_HOLD_MS / 3_600_000);
const SHARE = Math.round((1 - PLATFORM_FEE_RATE) * 100);

export default function Earnings() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [earnings, setEarnings] = useState<Earnings | null | undefined>(undefined);
  const [account, setAccount] = useState<PayoutAccount | null | undefined>(undefined);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "crisis"; text: string } | null>(null);

  const refresh = useCallback(async () => setEarnings(await fetchEarnings()), []);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    void fetchEarnings().then((e) => live && setEarnings(e));
    const stopAccount = watchPayoutAccount(uid, setAccount);
    const stopPayouts = watchPayouts(uid, setPayouts);
    return () => {
      live = false;
      stopAccount();
      stopPayouts();
    };
  }, [uid]);

  // A payout that settles changes what is available.
  const settledKey = (payouts ?? []).map((p) => `${p.id}:${p.status}`).join("|");
  useEffect(() => {
    if (!settledKey) return;
    let live = true;
    void fetchEarnings().then((e) => live && setEarnings(e));
    return () => {
      live = false;
    };
  }, [settledKey]);

  async function send() {
    setSending(true);
    setNotice(null);
    const result = await requestPayout();
    setSending(false);
    setConfirming(false);
    setNotice(
      result.ok
        ? { tone: "success", text: `${formatDalasi(result.amountMinor)} is on its way to your wallet.` }
        : { tone: "crisis", text: result.error },
    );
    void refresh();
  }

  if (earnings === undefined || account === undefined) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your earnings">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (earnings === null) {
    return (
      <Alert tone="warning" title="Your earnings could not be loaded">
        Check the connection and try again in a moment.
      </Alert>
    );
  }

  const available = earnings.availableMinor;
  const canSend = Boolean(account) && available > 0;
  const showForm = editing || !account;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Ready to send"
          value={formatDalasi(available)}
          caption={`${earnings.availableSessions} session${earnings.availableSessions === 1 ? "" : "s"}`}
        />
        <StatTile label="On hold" value={formatDalasi(earnings.heldMinor)} caption={`Ready ${HOLD_HOURS} hours after a session`} delay={0.05} />
        <StatTile label="Paid out" value={formatDalasi(earnings.withdrawnMinor)} caption="All time" delay={0.1} />
      </div>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <Card reveal={false} className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-[var(--accent)]">
            <IconWallet size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-snug">Where your money goes</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              Your share is {SHARE}% of each session&apos;s fee. A session can be sent {HOLD_HOURS} hours after it
              ends, so there is time to sort out one that did not happen.
            </p>
          </div>
        </div>

        {showForm ? (
          <AccountForm
            account={account ?? null}
            onSaved={() => {
              setEditing(false);
              setNotice({ tone: "success", text: "Saved. Payouts will go to this wallet." });
            }}
            onCancel={account ? () => setEditing(false) : undefined}
          />
        ) : account ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[var(--background)] px-4 py-3">
            <div>
              <p className="text-[14px] font-medium">
                {PAYOUT_NETWORK_LABELS[account.network]} {maskWallet(account.accountNumber)}
              </p>
              <p className="text-[12px] text-[var(--muted)]">{account.beneficiaryName}</p>
            </div>
            <Button variant="ghost" size="sm" withArrow={false} onClick={() => setEditing(true)}>
              Change
            </Button>
          </div>
        ) : null}

        {account && !editing ? (
          <Button onClick={() => setConfirming(true)} disabled={!canSend}>
            {available > 0 ? `Send ${formatDalasi(available)}` : "Nothing ready to send yet"}
          </Button>
        ) : null}
      </Card>

      <section aria-label="Payouts">
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Payouts</p>
        {payouts === null ? (
          <Skeleton className="h-16" />
        ) : payouts.length === 0 ? (
          <EmptyState icon={<IconWallet />} title="No payouts yet" description="When you send money to your wallet, it shows here." />
        ) : (
          <ul className="space-y-2">
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        variant="dialog"
        title={`Send ${formatDalasi(available)}?`}
        description={
          account
            ? `To ${PAYOUT_NETWORK_LABELS[account.network]} ${maskWallet(account.accountNumber)}, in the name of ${account.beneficiaryName}.`
            : undefined
        }
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="ghost" withArrow={false} onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button onClick={() => void send()} loading={sending}>
              Send it
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          It usually arrives within minutes. If the network is slow, it shows here as on its way until it lands.
        </p>
      </Modal>
    </div>
  );
}

function AccountForm({
  account,
  onSaved,
  onCancel,
}: {
  account: PayoutAccount | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [network, setNetwork] = useState<PayoutNetwork>(account?.network ?? "wave");
  const [number, setNumber] = useState("");
  const [name, setName] = useState(account?.beneficiaryName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await savePayoutAccount({ network, accountNumber: number, beneficiaryName: name });
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.error);
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <Select
        label="Wallet"
        value={network}
        onChange={(e) => setNetwork(e.target.value as PayoutNetwork)}
        options={PAYOUT_NETWORKS.map((n) => ({ value: n, label: PAYOUT_NETWORK_LABELS[n] }))}
      />
      <Input
        label="Wallet number"
        hint="Your seven-digit number, like 7000000."
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder={account ? `Currently ${maskWallet(account.accountNumber)}` : "7000000"}
        required
      />
      <Input
        label="Name on the wallet"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      {error ? <Alert tone="crisis">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          Save
        </Button>
        {onCancel ? (
          <Button variant="ghost" withArrow={false} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PayoutRow({ payout }: { payout: Payout }) {
  const status = STATUS_COPY[payout.status];
  const [checking, setChecking] = useState(false);
  const unsettled = payout.status === "initiating" || payout.status === "pending" || payout.status === "uncertain";
  return (
    <motion.li
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className="rounded-[18px] bg-white px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium">{formatDalasi(payout.amountMinor)}</p>
          <p className="text-[12px] text-[var(--muted)]">
            {new Date(payout.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
            {PAYOUT_NETWORK_LABELS[payout.network]} {payout.accountHint} · {payout.bookingIds.length} session
            {payout.bookingIds.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-[11px] uppercase tracking-[0.14em] ${status.tone}`}>{status.label}</span>
          {unsettled ? (
            <Button
              variant="ghost"
              size="sm"
              withArrow={false}
              loading={checking}
              onClick={async () => {
                setChecking(true);
                await checkPayout(payout.id);
                setChecking(false);
              }}
            >
              Check
            </Button>
          ) : null}
        </div>
      </div>
      {payout.status === "failed" && payout.failureReason ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
          {payout.failureReason} The sessions are back in what is ready to send.
        </p>
      ) : null}
    </motion.li>
  );
}
