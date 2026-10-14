"use client";

import { useId, useState } from "react";
import Button from "./Button";
import { Input } from "./Input";
import Modal from "./Modal";

/**
 * "Are you sure?", in one shape for every screen.
 *
 * Built on Modal, so it is a centred dialog on a computer and a sheet on a
 * phone. For the irreversible ones — removing a provider, refunding a
 * payment — `requireText` makes the person type a word or a name before the
 * button wakes up, which is slow on purpose.
 *
 * While `busy`, nothing closes it: an Escape halfway through a refund would
 * hide the one place that says whether it worked. When `onConfirm` returns a
 * promise the dialog counts as busy until it settles, whether or not the
 * caller passes `busy`, so a double tap cannot refund twice.
 */

const STAY_OPEN = () => {};

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  requireText,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Typed exactly (surrounding spaces aside) before confirm is enabled. */
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const working = busy || pending;

  function confirm() {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setPending(true);
    // A failure is the caller's to report, and still reaches the console
    // through the promise `finally` returns; all this does is let go.
    void result.finally(() => setPending(false));
  }

  return (
    <Modal open={open} onClose={working ? STAY_OPEN : onClose} title={title}>
      {/* Its own component so the typed text lives and dies with the
          dialog: closing it unmounts this, and the next opening starts
          blank without an effect having to clear it. */}
      <ConfirmBody
        body={body}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        danger={danger}
        requireText={requireText}
        busy={working}
        onConfirm={confirm}
        onClose={onClose}
      />
    </Modal>
  );
}

function ConfirmBody({
  body,
  confirmLabel,
  cancelLabel,
  danger,
  requireText,
  busy,
  onConfirm,
  onClose,
}: {
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  requireText?: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const hintId = useId();
  const expected = requireText?.trim() ?? "";
  const ready = !expected || typed.trim() === expected;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    onConfirm();
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="text-[14px] leading-relaxed text-[var(--muted)]">{body}</div>

      {expected ? (
        <div className="mt-6">
          {/* The instruction is ordinary text rather than the field label,
              because Field sets labels in capitals and the word to type may
              be a name whose case matters. */}
          <p id={hintId} className="text-[13px] leading-relaxed text-[var(--muted)]">
            To confirm, type{" "}
            <span className="select-all font-medium text-[var(--foreground)]">{expected}</span> below.
          </p>
          <Input
            label={`Type ${expected} to confirm`}
            hideLabel
            className="mt-3"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={hintId}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          variant={danger ? "danger" : "primary"}
          loading={busy}
          disabled={!ready}
          className="w-full sm:w-auto"
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
