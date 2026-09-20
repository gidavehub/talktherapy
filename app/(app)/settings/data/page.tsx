"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { deleteAccount } from "@/lib/auth";
import { deleteWellbeingData, exportUserData } from "@/lib/wellbeing";

/**
 * Data rights.
 *
 * The concept note commits to access, export and deletion, so these are real
 * and self-service — not a "contact us" form that quietly never gets actioned.
 *
 * Deletion asks the user to type DELETE. A single confirm button on an
 * irreversible action that destroys someone's journal is not enough friction.
 */
export default function DataSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [exporting, setExporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!user) return;
    setExporting(true);
    setError(null);
    try {
      const bundle = await exportUserData(user.uid);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `talk-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      // Revoking immediately can cancel the download in some browsers; a tick
      // is enough for the navigation to have started.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export downloaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build your export.");
    } finally {
      setExporting(false);
    }
  }

  async function clearWellbeing() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWellbeingData(user.uid);
      setClearOpen(false);
      toast.success("Mood and journal entries deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that data.");
    } finally {
      setBusy(false);
    }
  }

  async function closeAccount() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(deleteWellbeingData);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[640px] space-y-6">
      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Export
        </p>
        <h2 className="mt-3 text-[20px] leading-tight font-medium">
          Download everything we hold
        </h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
          Your profile, every mood check-in and every journal entry, as a single
          JSON file. Nothing is truncated.
        </p>
        <div className="mt-6">
          <Button onClick={download} loading={exporting} disabled={exporting} withArrow={false}>
            Download my data
          </Button>
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Delete
        </p>
        <h2 className="mt-3 text-[20px] leading-tight font-medium">
          Clear your wellbeing data
        </h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
          Removes every mood check-in and journal entry, permanently, and keeps
          your account open. Consider downloading an export first.
        </p>
        <div className="mt-6">
          <Button variant="danger" withArrow={false} onClick={() => setClearOpen(true)}>
            Delete mood &amp; journal
          </Button>
        </div>
      </Card>

      <Card radius="md" padding="p-6 md:p-8" reveal={false}>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Close account
        </p>
        <h2 className="mt-3 text-[20px] leading-tight font-medium">
          Delete my account
        </h2>
        <p className="mt-2 text-[13px] text-[var(--muted)] leading-relaxed">
          Deletes your profile, mood history, journal entries and sign-in
          permanently. This cannot be undone and we cannot recover it for you.
        </p>
        <p className="mt-3 text-[12px] text-[var(--muted)] leading-relaxed">
          Records we are legally obliged to keep, such as payment records for
          completed sessions, are retained for the required period and then
          deleted.
        </p>
        <div className="mt-6">
          <Button variant="danger" withArrow={false} onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </div>
      </Card>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Delete mood and journal data?"
        description="Every check-in and entry is removed permanently. Your account stays open."
        footer={
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="danger"
              withArrow={false}
              onClick={clearWellbeing}
              loading={busy}
              disabled={busy}
            >
              Delete permanently
            </Button>
            <Button variant="ghost" withArrow={false} onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <Alert tone="warning">
          This cannot be undone. If you might want this later, download an
          export first.
        </Alert>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setConfirmText("");
        }}
        title="Delete your account?"
        description="Everything is removed permanently — profile, mood history, journal, and your sign-in."
        footer={
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="danger"
              withArrow={false}
              onClick={closeAccount}
              loading={busy}
              disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
            >
              Delete everything
            </Button>
            <Button
              variant="ghost"
              withArrow={false}
              onClick={() => {
                setDeleteOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Alert tone="warning">
            This is irreversible. We cannot restore your account or your journal
            afterwards.
          </Alert>
          <Input
            label="Type DELETE to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
