"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Checkbox, Input, Select } from "../ui/Input";
import { Alert } from "../ui/Feedback";
import { IconPhone, IconSpeaker } from "../ui/icons";
import { useAuth } from "../AuthProvider";
import { useReadAloud } from "../../lib/useReadAloud";
import { recordConsent } from "../../lib/wellbeing";
import { updateUserProfile } from "../../lib/auth";
import { DEFAULT_CONSENTS } from "../../lib/models";
import type { Language } from "../../lib/ai/protocol";

/**
 * The under-18 form: a parent or guardian confirms who they are, agrees to the
 * underage terms, and types their full name as a signature.
 *
 * Its purpose is narrow and the copy says so in the modal itself, not behind a
 * link: ONBOARDING, TRIAGE AND FLAGGING. It is not clinical consent. The
 * provider obtains legally valid guardian consent under their own licensing
 * before treatment begins; Talk records that it asked and flagged, and claims
 * nothing more.
 *
 * Three properties matter more than the form:
 *  - It never stands between a child and help. The emergency numbers are
 *    inside it, "Not now" always closes it, and the therapy page force-closes
 *    it the moment the conversation turns urgent — a `fixed inset-0` dialog
 *    would otherwise sit on top of the crisis panel.
 *  - It gates STARTING THERAPY with a provider, never the conversation.
 *  - The timestamp is the server's (`recordConsent` stamps it, and the rules
 *    refuse any other), so the record is evidence and not a claim.
 */

/** Bumped whenever the terms below change, so the ledger says which ones were agreed. */
const TERMS_VERSION = "2026-10";

const GUARDIAN_RELATIONSHIPS = [
  { value: "", label: "Choose one" },
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Legal guardian" },
  { value: "older-sibling", label: "Older brother or sister" },
  { value: "other-family", label: "Other family member" },
  { value: "teacher", label: "Teacher or school" },
  { value: "other", label: "Someone else responsible for them" },
];

const TERMS = [
  "Talk uses this to welcome a young person, understand what they need, and make sure the provider they meet knows they are under 18. That is all it is for.",
  "It is not consent to treatment. Before any therapy begins, the provider will ask you for that themselves, as their own professional rules require.",
  "Talk is not responsible where somebody under 18 gives a false age, or false details about their parent or guardian.",
  "If a young person tells Talk they are in danger, being hurt, or not safe at home, Talk will point them to help straight away — whether or not this form is finished.",
];

/** Two name parts at least: a signature, not an initial or a nickname. */
function looksLikeFullName(value: string): boolean {
  return value.trim().split(/\s+/).filter((part) => part.length >= 2).length >= 2;
}

export default function GuardianConsentModal({
  open,
  onClose,
  language,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  /** The language the young person chose, for read-aloud and the ledger. */
  language: Language | null;
  onRecorded?: () => void;
}) {
  const { user, profile } = useAuth();
  const { read, stop, speakingId } = useReadAloud(language);
  const [relationship, setRelationship] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(relationship) && agreed && looksLikeFullName(signature);

  function close() {
    stop();
    onClose();
  }

  async function sign() {
    if (!user || !ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await recordConsent(user.uid, "guardianConsent", true, "therapy/guardian", {
        relationship,
        signature: signature.trim(),
        signedFor: profile?.intake?.preferredName ?? profile?.displayName ?? null,
        language: language ?? "english",
        termsVersion: TERMS_VERSION,
        agreedToUnderageTerms: true,
      });
      // The ledger entry above is the evidence; this is only the convenience
      // copy the app reads to decide whether to ask again.
      await updateUserProfile(user.uid, {
        consents: {
          ...DEFAULT_CONSENTS,
          ...profile?.consents,
          guardianConsent: true,
          guardianConsentAt: Date.now(),
        },
      });
      stop();
      onRecorded?.();
      onClose();
    } catch {
      setError("That did not save. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const spoken = [
    "Because you are under 18, a parent or guardian needs to fill this in with you.",
    ...TERMS,
    "If you are in danger right now, call 117 for the police or 116 for an ambulance.",
  ].join(" ");
  const reading = speakingId === "guardian-terms";

  return (
    <Modal
      open={open}
      onClose={close}
      variant="dialog"
      title="A parent or guardian, please"
      description="Because you are under 18, a parent or guardian needs to fill this in with you before your first session with a provider. You can keep talking to Talk while you wait."
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" withArrow={false} onClick={close}>
            Not now
          </Button>
          <Button onClick={() => void sign()} disabled={!ready} loading={saving}>
            Sign and continue
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => void read("guardian-terms", spoken)}
          aria-pressed={reading}
          className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[12px] tracking-wide transition-colors ${
            reading
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--border)] hover:bg-black/5"
          }`}
        >
          <IconSpeaker size={15} />
          {reading ? "Stop reading" : "Read this to me"}
        </button>

        {/* Before any field: this form never stands between a child and help. */}
        <Alert tone="crisis" title="In danger right now?">
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <a
              href="tel:117"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-[var(--accent)]"
            >
              <IconPhone size={14} /> 117 Police
            </a>
            <a
              href="tel:116"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-[var(--accent)]"
            >
              <IconPhone size={14} /> 116 Ambulance
            </a>
            <Link href="/crisis#under-18" className="underline underline-offset-2">
              More help for young people
            </Link>
          </span>
        </Alert>

        <Alert tone="warning" title="What this is, and what it is not">
          <ul className="mt-1 list-disc space-y-1.5 pl-4">
            {TERMS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Alert>

        <Select
          label="Your relationship to them"
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
          options={GUARDIAN_RELATIONSHIPS}
          required
        />

        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          label="I am their parent or guardian, and I agree to these terms for someone under 18"
          description="Talk is for welcoming, triage and flagging only. The provider will ask for consent to treatment separately."
        />

        <Input
          label="Your full name"
          hint="Typing your full name here is your signature."
          autoComplete="name"
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
          error={
            signature && !looksLikeFullName(signature) ? "Your first and last name, please." : null
          }
          required
        />

        {error ? <Alert tone="crisis">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
