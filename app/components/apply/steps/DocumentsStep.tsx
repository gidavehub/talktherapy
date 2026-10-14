"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import FileDropzone, { formatBytes } from "../../ui/FileDropzone";
import { Dropdown } from "../../ui/Dropdown";
import { ProgressBar } from "../../ui/Stepper";
import { IconCheck, IconClose, IconFile, IconTrash } from "../../ui/icons";
import { SPRING_SOFT } from "../../motion/primitives";
import { deleteStoredFile, privateFileUrl, uploadDocument } from "@/lib/providerApplication-client";
import {
  DOC_ACCEPT,
  DOC_MAX_BYTES,
  DOC_TYPES,
  DOC_TYPE_HINTS,
  DOC_TYPE_LABELS,
  MAX_DOCUMENTS,
  type ApplicationDocument,
  type DocType,
} from "@/lib/providerApplication";
import type { StepProps } from "./types";

type Uploading = { key: string; name: string; progress: number; failed: boolean };

const TYPE_OPTIONS = DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t], description: DOC_TYPE_HINTS[t] }));

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 text-[14px]">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          met ? "bg-[var(--sage)] text-white" : "bg-[var(--sand)] text-[var(--muted)]"
        }`}
      >
        {met ? <IconCheck size={13} /> : <IconClose size={12} />}
      </span>
      <span className={met ? "" : "text-[var(--muted)]"}>{label}</span>
      <span className="sr-only">{met ? "— done" : "— still needed"}</span>
    </li>
  );
}

export default function DocumentsStep({ uid, value, onChange, problems }: StepProps<"documents">) {
  const hasId = value.some((d) => d.type === "id");
  const hasQualification = value.some((d) => d.type === "degree" || d.type === "licence");
  // What the next file is: the first thing still missing, by default.
  const [type, setType] = useState<DocType | null>(null);
  const nextType: DocType = type ?? (hasId ? (hasQualification ? "reference" : "degree") : "id");
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const room = MAX_DOCUMENTS - value.length - uploading.filter((u) => !u.failed).length;

  // Finished uploads are added to whatever the list is BY THEN — a type
  // changed or a file removed while they were uploading must not be undone.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  async function take(files: File[]) {
    setNotice(null);
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > accepted.length) setNotice(`Only ${MAX_DOCUMENTS} documents fit — some were left out.`);
    const docs: ApplicationDocument[] = [];
    await Promise.all(
      accepted.map(async (file, i) => {
        const key = `${file.name}-${file.size}-${i}`;
        setUploading((list) => [...list, { key, name: file.name, progress: 0, failed: false }]);
        try {
          const doc = await uploadDocument(uid, file, nextType, (progress) =>
            setUploading((list) => list.map((u) => (u.key === key ? { ...u, progress } : u))),
          );
          docs.push(doc);
          setUploading((list) => list.filter((u) => u.key !== key));
        } catch {
          setUploading((list) => list.map((u) => (u.key === key ? { ...u, failed: true } : u)));
        }
      }),
    );
    if (docs.length) onChange([...latest.current, ...docs], { immediate: true });
    setType(null);
  }

  function remove(doc: ApplicationDocument) {
    onChange(
      value.filter((d) => d.id !== doc.id),
      { immediate: true },
    );
    void deleteStoredFile(doc.path);
  }

  async function open(doc: ApplicationDocument) {
    setOpening(doc.id);
    // Opened first, filled in after: a window opened once the file has
    // downloaded is no longer "in response to a tap" and gets blocked.
    const tab = window.open("", "_blank");
    try {
      const url = await privateFileUrl(doc.path);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setNotice("That document could not be opened. Check your connection and try again.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="space-y-7">
      <div className="rounded-[22px] bg-[var(--background)] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Needed</p>
        <ul className="mt-3 space-y-2.5">
          <Requirement met={hasId} label="Your national ID card or passport" />
          <Requirement met={hasQualification} label="A certificate, or your professional licence" />
        </ul>
        <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Add a certificate for each qualification you listed, and a reference letter or CV if you have them — they make the
          check quicker. Only you and the staff member reviewing your application can see these.
        </p>
      </div>

      {room > 0 ? (
        <div className="space-y-3">
          <Dropdown<DocType>
            label="What are you adding?"
            value={nextType}
            onChange={setType}
            options={TYPE_OPTIONS}
          />
          <FileDropzone
            accept={DOC_ACCEPT}
            maxBytes={DOC_MAX_BYTES}
            multiple
            onFiles={(files) => void take(files)}
            onReject={(errors) => setNotice(errors.join(" "))}
            label={`Add your ${DOC_TYPE_LABELS[nextType].toLowerCase()}`}
            hint="PDF, JPG, PNG or WebP, up to 10 MB each. A clear photo from your phone is fine."
          />
        </div>
      ) : null}

      {notice ? (
        <p role="alert" className="text-[13px] text-[var(--accent)]">
          {notice}
        </p>
      ) : null}
      {problems.list ? (
        <p role="alert" className="text-[13px] text-[var(--accent)]">
          {problems.list}
        </p>
      ) : null}

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {uploading.map((u) => (
            <motion.li
              key={u.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-[var(--dark)]/10 bg-[var(--surface)] p-4"
            >
              <div className="flex items-center gap-3">
                <IconFile size={18} />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{u.name}</span>
                {u.failed ? (
                  <button
                    type="button"
                    className="text-[12.5px] text-[var(--danger)] underline"
                    onClick={() => setUploading((list) => list.filter((x) => x.key !== u.key))}
                  >
                    Did not upload — dismiss
                  </button>
                ) : null}
              </div>
              {u.failed ? null : <ProgressBar value={u.progress} className="mt-3" />}
            </motion.li>
          ))}
          {value.map((doc, i) => (
            <motion.li
              key={doc.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_SOFT}
              className={`rounded-2xl border bg-[var(--surface)] p-4 ${problems[`${i}`] ? "border-[var(--accent)]" : "border-[var(--dark)]/10"}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sand)]">
                    <IconFile size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{doc.name}</span>
                    <span className="block text-[12px] text-[var(--muted)]">{formatBytes(doc.bytes)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Dropdown<DocType>
                    label="Type"
                    hideLabel
                    size="sm"
                    value={doc.type}
                    onChange={(t) => onChange(value.map((d) => (d.id === doc.id ? { ...d, type: t } : d)), { immediate: true })}
                    options={TYPE_OPTIONS}
                    className="w-[200px]"
                  />
                  <button
                    type="button"
                    onClick={() => void open(doc)}
                    disabled={opening === doc.id}
                    className="h-10 rounded-full px-4 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--sand)] disabled:opacity-50"
                  >
                    {opening === doc.id ? "Opening…" : "View"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    aria-label={`Remove ${doc.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--sand)] hover:text-[var(--danger)]"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
              {problems[`${i}`] ? <p className="mt-2 text-[12.5px] text-[var(--accent)]">{problems[`${i}`]}</p> : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {problems.id || problems.qualification ? (
        <p role="alert" className="text-[13px] text-[var(--accent)]">
          {[problems.id, problems.qualification].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </div>
  );
}
