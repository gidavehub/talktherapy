"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DescriptionList, { type DescriptionItem } from "../../ui/DescriptionList";
import Button from "../../ui/Button";
import { Alert } from "../../ui/Feedback";
import { IconCheck } from "../../ui/icons";
import { SummaryValue } from "../fields";
import { AREA_LABELS, SERVICE_LABELS, SPECIALIZATION_LABELS, townLabel } from "@/lib/matching";
import {
  AGE_GROUP_LABELS,
  AGREEMENTS,
  APPLICANT_GENDER_LABELS,
  APPLICATION_FORMAT_LABELS,
  DAYS,
  DOC_TYPE_LABELS,
  LOCALE_LABELS,
  STEPS,
  formatPhone,
  gambianPhone,
  incompleteSteps,
  qualificationLine,
  takeHomeMinor,
  weeklySessions,
  type ApplicationSections,
  type SectionId,
} from "@/lib/providerApplication";
import { PAYOUT_NETWORK_LABELS } from "@/lib/payouts";
import { formatDalasi } from "@/lib/money";
import { privateFileUrl } from "@/lib/providerApplication-client";

function dob(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const list = (items: string[]) => (items.length ? items.join(", ") : "");

function Section({
  id,
  incomplete,
  children,
}: {
  id: SectionId;
  incomplete: boolean;
  children: React.ReactNode;
}) {
  const step = STEPS.find((s) => s.id === id);
  return (
    <section
      className={`rounded-[24px] border bg-[var(--surface)] p-5 md:p-6 ${
        incomplete ? "border-[var(--accent)]/60" : "border-[var(--dark)]/[0.07]"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              incomplete ? "bg-[var(--accent-soft)] text-[var(--accent-deep)]" : "bg-[var(--sage)] text-white"
            }`}
          >
            {incomplete ? <span className="text-[12px] font-medium">!</span> : <IconCheck size={12} />}
          </span>
          <h3 className="font-display text-[20px] font-medium">{step?.label}</h3>
          {incomplete ? <span className="text-[12px] text-[var(--accent-deep)]">Needs something</span> : null}
        </div>
        <Link
          href={`/apply/${id}`}
          className="flex h-9 items-center rounded-full border border-[var(--border)] px-4 text-[12.5px] font-medium transition-colors hover:bg-[var(--sand)]"
        >
          Edit
        </Link>
      </div>
      {children}
    </section>
  );
}

function PhotoThumb({ path }: { path: string | null }) {
  const [shown, setShown] = useState<{ path: string; src: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    privateFileUrl(path)
      .then((src) => {
        if (!cancelled) setShown({ path, src });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);
  const src = path && shown?.path === path ? shown.src : null;
  return (
    <span className="arch relative block h-[120px] w-[100px] overflow-hidden rounded-b-2xl bg-[var(--peach)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private blob, which next/image cannot fetch
        <img src={src} alt="Your photo" className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : null}
    </span>
  );
}

export default function ReviewStep({
  uid,
  draft,
  now,
  onSubmit,
  submitting,
  submitError,
  resubmitting,
}: {
  uid: string;
  draft: ApplicationSections;
  now: number;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  resubmitting: boolean;
}) {
  const left = incompleteSteps({ ...draft, uid }, now);
  const missing = (id: SectionId) => left.includes(id);
  const { personal, professional, qualifications, practice, fee, documents, availability, payout, agreements } = draft;
  const phone = gambianPhone(personal.phone);

  const personalItems: DescriptionItem[] = [
    { label: "Legal name", value: <SummaryValue>{personal.legalName}</SummaryValue> },
    { label: "Name people see", value: <SummaryValue>{personal.displayName}</SummaryValue> },
    { label: "You are", value: <SummaryValue>{personal.gender ? APPLICANT_GENDER_LABELS[personal.gender] : ""}</SummaryValue> },
    { label: "Date of birth", value: <SummaryValue>{dob(personal.dateOfBirth)}</SummaryValue> },
    { label: "Mobile", value: <SummaryValue>{phone ? formatPhone(phone) : ""}</SummaryValue> },
    {
      label: "Based in",
      value: (
        <SummaryValue>
          {[personal.town ? townLabel(personal.town) : "", personal.area ? AREA_LABELS[personal.area] : ""].filter(Boolean).join(", ")}
        </SummaryValue>
      ),
    },
  ];

  const professionalItems: DescriptionItem[] = [
    { label: "Support you offer", value: <SummaryValue>{list(professional.services.map((s) => SERVICE_LABELS[s]))}</SummaryValue>, wide: true },
    { label: "Experience", value: <SummaryValue>{professional.yearsExperience != null ? `${professional.yearsExperience} years` : ""}</SummaryValue> },
    { label: "Works at", value: <SummaryValue>{professional.workplace}</SummaryValue> },
    {
      label: "Registration",
      value: (
        <SummaryValue>
          {[professional.registrationBody, professional.registrationNumber].filter(Boolean).join(" · ") || "None given"}
        </SummaryValue>
      ),
    },
    { label: "Works with", value: <SummaryValue>{list(professional.specializations.map((s) => SPECIALIZATION_LABELS[s]))}</SummaryValue>, wide: true },
    { label: "Age groups", value: <SummaryValue>{list(professional.ageGroups.map((g) => AGE_GROUP_LABELS[g]))}</SummaryValue> },
    { label: "Sessions by", value: <SummaryValue>{list(professional.formats.map((f) => APPLICATION_FORMAT_LABELS[f]))}</SummaryValue> },
    {
      label: "Languages",
      value: (
        <SummaryValue>
          {list([...professional.languages.map((l) => LOCALE_LABELS[l]), ...(professional.otherLanguages.trim() ? [professional.otherLanguages.trim()] : [])])}
        </SummaryValue>
      ),
      wide: true,
    },
  ];

  return (
    <div className="space-y-5">
      {left.length > 0 ? (
        <Alert tone="warning" title={`${left.length} part${left.length === 1 ? "" : "s"} still need${left.length === 1 ? "s" : ""} something`}>
          <span className="flex flex-wrap gap-2 pt-1">
            {left.map((id) => (
              <Link
                key={id}
                href={`/apply/${id}`}
                className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                {STEPS.find((s) => s.id === id)?.label}
              </Link>
            ))}
          </span>
        </Alert>
      ) : (
        <Alert tone="success" title="Everything is here">
          Read it through once more. When you send it, a person on our team will check it — usually within three working
          days.
        </Alert>
      )}

      <Section id="personal" incomplete={missing("personal")}>
        <DescriptionList items={personalItems} columns={2} />
      </Section>

      <Section id="professional" incomplete={missing("professional")}>
        <DescriptionList items={professionalItems} columns={2} />
      </Section>

      <Section id="qualifications" incomplete={missing("qualifications")}>
        {qualifications.length ? (
          <ul className="space-y-2 text-[14px]">
            {qualifications.map((q) => (
              <li key={q.id} className="flex gap-2.5">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {qualificationLine(q) || "An unfinished entry"}
                {q.country ? <span className="text-[var(--muted)]">· {q.country}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <SummaryValue>{""}</SummaryValue>
        )}
      </Section>

      <Section id="practice" incomplete={missing("practice")}>
        <DescriptionList
          columns={1}
          items={[
            { label: "One line", value: <SummaryValue>{practice.headline}</SummaryValue> },
            { label: "About you", value: <SummaryValue><span className="whitespace-pre-line">{practice.bio}</span></SummaryValue> },
            { label: "How you work", value: <SummaryValue><span className="whitespace-pre-line">{practice.approach}</span></SummaryValue> },
            { label: "A first session", value: <SummaryValue><span className="whitespace-pre-line">{practice.firstSession}</span></SummaryValue> },
          ]}
        />
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section id="fee" incomplete={missing("fee")}>
          {fee.sessionRateMinor ? (
            <p className="text-[14px]">
              <span className="font-display text-[28px]">{formatDalasi(fee.sessionRateMinor)}</span> a session — you receive{" "}
              {formatDalasi(takeHomeMinor(fee.sessionRateMinor))}.
            </p>
          ) : (
            <SummaryValue>{""}</SummaryValue>
          )}
        </Section>
        <Section id="photo" incomplete={missing("photo")}>
          {draft.photo.path ? <PhotoThumb path={draft.photo.path} /> : <SummaryValue>{""}</SummaryValue>}
        </Section>
      </div>

      <Section id="documents" incomplete={missing("documents")}>
        {documents.length ? (
          <ul className="space-y-2 text-[14px]">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{DOC_TYPE_LABELS[d.type]}</span>
                <span className="truncate text-[var(--muted)]">{d.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <SummaryValue>{""}</SummaryValue>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section id="availability" incomplete={missing("availability")}>
          {availability.ranges.length ? (
            <>
              <ul className="space-y-1.5 text-[14px]">
                {DAYS.filter((d) => availability.ranges.some((r) => r.day === d.value)).map((d) => (
                  <li key={d.value} className="flex gap-3">
                    <span className="w-[42px] font-medium">{d.short}</span>
                    <span className="text-[var(--muted)]">
                      {availability.ranges
                        .filter((r) => r.day === d.value)
                        .map((r) => `${r.start}–${r.end}`)
                        .join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-[var(--muted)]">{weeklySessions(availability.ranges)} sessions a week</p>
            </>
          ) : (
            <SummaryValue>{""}</SummaryValue>
          )}
        </Section>
        <Section id="payout" incomplete={missing("payout")}>
          {payout.network ? (
            <p className="text-[14px]">
              {PAYOUT_NETWORK_LABELS[payout.network]} {payout.accountHint}
              <span className="block text-[13px] text-[var(--muted)]">In the name of {payout.beneficiaryName}</span>
            </p>
          ) : (
            <SummaryValue>{""}</SummaryValue>
          )}
        </Section>
      </div>

      <Section id="agreements" incomplete={missing("agreements")}>
        <ul className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
          {AGREEMENTS.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  agreements.accepted[a.id] ? "bg-[var(--sage)] text-white" : "bg-[var(--sand)]"
                }`}
              >
                {agreements.accepted[a.id] ? <IconCheck size={11} /> : null}
              </span>
              {a.title}
            </li>
          ))}
        </ul>
        {agreements.signedAt ? (
          <p className="mt-4 font-display text-[19px] italic text-[var(--sage-deep)]">Signed, {agreements.signature}</p>
        ) : null}
      </Section>

      {submitError ? (
        <Alert tone="warning" title="It did not send">
          {submitError}
        </Alert>
      ) : null}

      <div className="rounded-[26px] bg-[var(--dark)] p-6 text-[var(--cream)] md:p-8">
        <p className="font-display text-[24px] leading-snug md:text-[28px]">
          {resubmitting ? "Send it back to us." : "Ready when you are."}
        </p>
        <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-[var(--cream)]/75">
          Once it is sent you cannot change it while it is being checked. If anything needs fixing, we will send it back to
          you with a note saying what.
        </p>
        <div className="mt-6">
          <Button size="lg" onClick={onSubmit} loading={submitting} disabled={left.length > 0}>
            {resubmitting ? "Send my changes" : "Send my application"}
          </Button>
        </div>
      </div>
    </div>
  );
}
