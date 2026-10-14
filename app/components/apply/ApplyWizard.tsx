"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Button from "../ui/Button";
import Drawer from "../ui/Drawer";
import Stepper, { ProgressBar, type StepperStep } from "../ui/Stepper";
import { Alert } from "../ui/Feedback";
import LogoLoader from "../ui/LogoLoader";
import { SPRING_SOFT } from "../motion/primitives";
import { useApplicant } from "./useApplicant";
import { useNow } from "@/lib/useNow";
import { saveLastStep, saveSections, submitApplication } from "@/lib/providerApplication-client";
import {
  STEPS,
  checkStep,
  completion,
  isEditable,
  stepComplete,
  stepIndex,
  type ApplicationSections,
  type ProviderApplication,
  type SectionId,
  type StepId,
} from "@/lib/providerApplication";
import PersonalStep from "./steps/PersonalStep";
import ProfessionalStep from "./steps/ProfessionalStep";
import QualificationsStep from "./steps/QualificationsStep";
import PracticeStep from "./steps/PracticeStep";
import FeeStep from "./steps/FeeStep";
import PhotoStep from "./steps/PhotoStep";
import DocumentsStep from "./steps/DocumentsStep";
import AvailabilityStep from "./steps/AvailabilityStep";
import PayoutStep from "./steps/PayoutStep";
import AgreementsStep from "./steps/AgreementsStep";
import ReviewStep from "./steps/ReviewStep";

/**
 * One step of the application, with everything around it: where they are in
 * the whole, a way to any other step, and saving.
 *
 * Saving is automatic. A change is kept on screen at once and written a
 * moment after they stop typing — or straight away for things that have
 * already happened elsewhere, like a file that has just finished uploading.
 * Moving to another step writes anything still waiting first, so nothing is
 * lost between steps, and leaving the page with something unsaved asks first.
 */

type SaveState = "saved" | "waiting" | "saving" | "error";

function sectionsOf(app: ProviderApplication): ApplicationSections {
  const { personal, professional, qualifications, practice, fee, photo, documents, availability, payout, agreements } = app;
  return { personal, professional, qualifications, practice, fee, photo, documents, availability, payout, agreements };
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="text-[12.5px] font-medium text-[var(--danger)] underline underline-offset-4">
        Not saved — try again
      </button>
    );
  }
  return (
    <span aria-live="polite" className="inline-flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          state === "saved" ? "bg-[var(--sage)]" : state === "saving" ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--peach)]"
        }`}
      />
      {state === "saved" ? "All changes saved" : state === "saving" ? "Saving…" : "Saving shortly"}
    </span>
  );
}

function WizardBody({ uid, app, step }: { uid: string; app: ProviderApplication; step: StepId }) {
  const router = useRouter();
  const now = useNow(60_000);
  const [draft, setDraft] = useState<ApplicationSections>(() => sectionsOf(app));
  const [save, setSave] = useState<SaveState>("saved");
  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set());
  const [stepsOpen, setStepsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // What is waiting to be written, the timer that will write it, and the
  // write in flight — so two writes never race and none is dropped.
  const pending = useRef<Partial<ApplicationSections>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const stepRef = useRef(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  async function flush(): Promise<boolean> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inflight.current) await inflight.current;
    const batch = pending.current;
    if (Object.keys(batch).length === 0) return true;
    pending.current = {};
    setSave("saving");
    const write = saveSections(uid, batch, stepRef.current)
      .then(() => {
        setSave(Object.keys(pending.current).length ? "waiting" : "saved");
        return true;
      })
      .catch(() => {
        // Put it back underneath anything newer, so "try again" sends it.
        pending.current = { ...batch, ...pending.current };
        setSave("error");
        return false;
      });
    inflight.current = write;
    const ok = await write;
    inflight.current = null;
    return ok;
  }

  function change<K extends SectionId>(key: K, next: ApplicationSections[K], options?: { immediate?: boolean }) {
    setDraft((d) => ({ ...d, [key]: next }));
    pending.current = { ...pending.current, [key]: next };
    setSave("waiting");
    if (timer.current) clearTimeout(timer.current);
    if (options?.immediate) void flush();
    else timer.current = setTimeout(() => void flush(), 800);
  }

  // Remember the step they are on, so "continue" brings them back here.
  useEffect(() => {
    void saveLastStep(uid, step).catch(() => {});
  }, [uid, step]);

  // Leaving with something unsaved: write it on the way out, and ask the
  // browser to hold the page while that happens.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inflight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
    // flush only reads refs and the uid, which this body is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const index = stepIndex(step);
  const meta = STEPS[index];
  const prev = STEPS[index - 1];
  const next = STEPS[index + 1];
  const full = { ...draft, uid };
  const problems = step !== "review" && tried.has(step) ? checkStep(step, full, now) : {};
  const hasProblems = Object.keys(problems).length > 0;

  const stepperSteps: StepperStep[] = STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status:
      s.id === step
        ? "current"
        : s.id !== "review" && stepComplete(s.id, full, now)
          ? "done"
          : tried.has(s.id)
            ? "error"
            : "todo",
  }));

  async function go(to: StepId) {
    setStepsOpen(false);
    await flush();
    router.push(`/apply/${to}`);
  }

  async function onContinue() {
    if (step !== "review" && Object.keys(checkStep(step, full, now)).length > 0) {
      setTried((t) => new Set(t).add(step));
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (next) await go(next.id);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const saved = await flush();
    if (!saved) {
      setSubmitError("Your latest changes have not saved yet. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const result = await submitApplication();
    if (result.ok) {
      router.replace("/apply/status");
      return;
    }
    setSubmitError(result.error);
    setSubmitting(false);
  }

  const common = { uid, draft, now };
  let body: React.ReactNode;
  switch (step) {
    case "personal":
      body = <PersonalStep {...common} value={draft.personal} onChange={(next, o) => change("personal", next, o)} problems={problems} />;
      break;
    case "professional":
      body = <ProfessionalStep {...common} value={draft.professional} onChange={(next, o) => change("professional", next, o)} problems={problems} />;
      break;
    case "qualifications":
      body = <QualificationsStep {...common} value={draft.qualifications} onChange={(next, o) => change("qualifications", next, o)} problems={problems} />;
      break;
    case "practice":
      body = <PracticeStep {...common} value={draft.practice} onChange={(next, o) => change("practice", next, o)} problems={problems} />;
      break;
    case "fee":
      body = <FeeStep {...common} value={draft.fee} onChange={(next, o) => change("fee", next, o)} problems={problems} />;
      break;
    case "photo":
      body = <PhotoStep {...common} value={draft.photo} onChange={(next, o) => change("photo", next, o)} problems={problems} />;
      break;
    case "documents":
      body = <DocumentsStep {...common} value={draft.documents} onChange={(next, o) => change("documents", next, o)} problems={problems} />;
      break;
    case "availability":
      body = <AvailabilityStep {...common} value={draft.availability} onChange={(next, o) => change("availability", next, o)} problems={problems} />;
      break;
    case "payout":
      body = <PayoutStep {...common} value={draft.payout} onChange={(next, o) => change("payout", next, o)} problems={problems} />;
      break;
    case "agreements":
      body = <AgreementsStep {...common} value={draft.agreements} onChange={(next, o) => change("agreements", next, o)} problems={problems} />;
      break;
    case "review":
      body = (
        <ReviewStep
          uid={uid}
          draft={draft}
          now={now}
          onSubmit={() => void submit()}
          submitting={submitting}
          submitError={submitError}
          resubmitting={app.status === "changes_requested"}
        />
      );
      break;
  }

  return (
    <>
      <div className="mx-auto max-w-[1200px] px-5 pb-36 pt-4 md:px-10 md:pb-20 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:pt-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-7">
            <ProgressBar value={completion(full, now)} label="Your application" />
            <Stepper steps={stepperSteps} orientation="vertical" onStepClick={(id) => void go(id as StepId)} />
            <div className="space-y-3 border-t border-[var(--dark)]/10 pt-5">
              <SaveIndicator state={save} onRetry={() => void flush()} />
              <Link href="/apply" className="block text-[13px] font-medium text-[var(--foreground)] underline-offset-4 hover:underline">
                Save and exit
              </Link>
            </div>
          </div>
        </aside>

        <div ref={topRef} className="min-w-0 scroll-mt-4">
          <div className="mb-6 lg:hidden">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-[var(--muted)]">
                Step {index + 1} of {STEPS.length}
              </p>
              <button
                type="button"
                onClick={() => setStepsOpen(true)}
                className="flex h-9 items-center rounded-full border border-[var(--border)] px-4 text-[12.5px] font-medium"
              >
                All steps
              </button>
            </div>
            <ProgressBar value={(index + 1) / STEPS.length} />
          </div>

          {app.status === "changes_requested" && app.message ? (
            <Alert tone="warning" title="What we asked you to change" className="mb-6">
              <p className="whitespace-pre-line">{app.message}</p>
            </Alert>
          ) : null}

          <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SOFT}>
            <p className="eyebrow hidden lg:block">
              Step {index + 1} of {STEPS.length} · {meta.label}
            </p>
            <h1 className="font-display mt-1 text-[32px] font-medium leading-[1.06] md:text-[44px] lg:mt-3">{meta.title}</h1>
            <p className="mt-3 max-w-[620px] text-[14.5px] leading-relaxed text-[var(--muted)]">{meta.lede}</p>

            {hasProblems ? (
              <Alert tone="warning" className="mt-6">
                A few things need attention before you move on — they are marked below.{" "}
                {next ? (
                  <button type="button" onClick={() => void go(next.id)} className="font-medium underline underline-offset-4">
                    Skip for now
                  </button>
                ) : null}
              </Alert>
            ) : null}

            <div className={step === "review" ? "mt-8" : "mt-8 rounded-[28px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-8"}>
              {body}
            </div>
          </motion.div>

          <div className="mt-8 hidden items-center justify-between gap-4 md:flex">
            {prev ? (
              <Button variant="ghost" onClick={() => void go(prev.id)}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" href="/apply">
                Overview
              </Button>
            )}
            <div className="flex items-center gap-5">
              <span className="lg:hidden">
                <SaveIndicator state={save} onRetry={() => void flush()} />
              </span>
              {next ? <Button onClick={() => void onContinue()}>Save and continue</Button> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Phone: the way on is always under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--dark)]/10 bg-[var(--surface)]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <Button variant="ghost" size="sm" onClick={() => void go(prev.id)}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" href="/apply">
              Overview
            </Button>
          )}
          <SaveIndicator state={save} onRetry={() => void flush()} />
          {next ? (
            <Button size="sm" onClick={() => void onContinue()}>
              Continue
            </Button>
          ) : (
            <span className="w-[72px]" />
          )}
        </div>
      </div>

      <Drawer open={stepsOpen} onClose={() => setStepsOpen(false)} title="Your application" eyebrow="All steps">
        <div className="space-y-6">
          <ProgressBar value={completion(full, now)} label="Done so far" />
          <Stepper steps={stepperSteps} orientation="vertical" onStepClick={(id) => void go(id as StepId)} />
          <Link href="/apply" className="block text-[13.5px] font-medium underline underline-offset-4">
            Save and exit
          </Link>
        </div>
      </Drawer>
    </>
  );
}

export default function ApplyWizard({ step }: { step: StepId }) {
  const applicant = useApplicant();
  const router = useRouter();

  const away =
    applicant.kind === "signed-out" || applicant.kind === "none" || applicant.kind === "wrong-role" || applicant.kind === "approved"
      ? "/apply"
      : applicant.kind === "ready" && !isEditable(applicant.app.status)
        ? "/apply/status"
        : null;

  useEffect(() => {
    if (away) router.replace(away);
  }, [away, router]);

  if (applicant.kind === "error") {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-16">
        <Alert tone="warning" title="Something went wrong">
          {applicant.message}
        </Alert>
      </div>
    );
  }
  if (applicant.kind !== "ready" || away) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LogoLoader label="Opening your application" />
      </div>
    );
  }
  return <WizardBody key={applicant.uid} uid={applicant.uid} app={applicant.app} step={step} />;
}
