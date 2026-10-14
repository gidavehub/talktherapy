"use client";

import { useState } from "react";
import { Input } from "../../ui/Input";
import Button from "../../ui/Button";
import { Alert } from "../../ui/Feedback";
import { IconWallet } from "../../ui/icons";
import { ChoiceCards, PhoneField } from "../fields";
import { savePayoutAccount } from "@/lib/payouts-client";
import { PAYOUT_NETWORK_LABELS, maskWallet, walletNumber } from "@/lib/payouts";
import type { PayoutNetwork } from "@/lib/payments/modempay-protocol";
import type { StepProps } from "./types";

const NETWORKS = Object.keys(PAYOUT_NETWORK_LABELS) as PayoutNetwork[];

/**
 * Where their earnings go. Saved straight to their payout account through
 * savePayoutAccount — the same function and the same checks as the Earnings
 * screen, which keeps every change on record. The application keeps only
 * enough to show which wallet it was.
 */
export default function PayoutStep({ value, onChange, problems, draft }: StepProps<"payout">) {
  const saved = Boolean(value.network && value.accountHint);
  const [editing, setEditing] = useState(false);
  const [network, setNetwork] = useState<PayoutNetwork | null>(value.network);
  const [number, setNumber] = useState("");
  const [name, setName] = useState(value.beneficiaryName || draft.personal.legalName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const digits = walletNumber(number);
    if (!network) return setError("Choose the network your wallet is on.");
    if (!digits) return setError("That is not a Gambian mobile number — seven digits, like 700 0000.");
    if (name.trim().length < 3) return setError("The name on the wallet, please.");
    setBusy(true);
    const result = await savePayoutAccount({ network, accountNumber: digits, beneficiaryName: name.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onChange({ network, accountHint: maskWallet(digits), beneficiaryName: name.trim() }, { immediate: true });
    setEditing(false);
    setNumber("");
  }

  if (saved && !editing) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[24px] bg-[var(--sage)] p-6 text-white sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <IconWallet size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/80">Your earnings go to</p>
            <p className="font-display mt-1 text-[24px] leading-tight">
              {value.network ? PAYOUT_NETWORK_LABELS[value.network] : ""} {value.accountHint}
            </p>
            <p className="mt-0.5 text-[13px] text-white/85">In the name of {value.beneficiaryName}</p>
          </div>
          <Button variant="onDark" size="sm" onClick={() => setEditing(true)}>
            Use a different wallet
          </Button>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          A day after each session ends, your share is ready. You send it to this wallet from Earnings, whenever you like.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChoiceCards<PayoutNetwork>
        legend="Your wallet is with"
        options={NETWORKS.map((n) => ({ value: n, label: PAYOUT_NETWORK_LABELS[n] }))}
        value={network ? [network] : []}
        onChange={(next) => setNetwork(next[0] ?? null)}
        columns={2}
      />
      <PhoneField
        label="Wallet number"
        hint="The number your mobile-money wallet is on."
        value={number}
        onChange={setNumber}
      />
      <Input
        label="Name on the wallet"
        hint="It should be yours. Money sent to somebody else's wallet cannot be taken back."
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error || problems.account ? (
        <Alert tone="warning">{error ?? problems.account}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button loading={busy} onClick={() => void save()}>
          Save this wallet
        </Button>
        {saved ? (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Keep the one I had
          </Button>
        ) : null}
      </div>
    </div>
  );
}
