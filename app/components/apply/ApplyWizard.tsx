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
 * Moving to another step sends anything still waiting first, so nothing is
 * lost between steps, and leaving the page with something unsaved asks first.
 *
 * How the writes stay right:
 *  - Every write is sent the moment it is due, never queued behind the one
 *    before. Firestore applies one browser's writes in the order they were
 *    sent, and a sent write is already in this tab's copy of the application,
 *    so the next step opens with it even on a connection that has dropped.
 *  - A write that is refused does not put its old values back. The sections
 *    it carried are marked unsaved again, and whatever goes next carries
 *    their LATEST values — so a retry can never undo a newer change.
 */

type SaveState = "saved" | "waiting" | "saving" | "error";

/** How long moving to another step waits for the server before going anyway. */
const MOVE_WAIT_MS = 4_000;
/** How long sending waits for the last changes to land. */
const SUBMIT_WAIT_MS = 15_000;

/** Resolves with `fallback` if `promise` takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function sectionsOf(app: ProviderApplication): ApplicationSections {
  const { personal, professional, qualifications, practice, fee, photo, documents, availability, payout, agreements } = app;
  return { personal, professional, qualifications, practice, fee, photo, documents, availability, payout, agreements };
}

/** Where saving has got to. `compact` is the phone's bottom bar, where it sits between two buttons. */
function SaveIndicator({ state, onRetry, compact = false }: { state: SaveState; onRetry: () => void; compact?: boolean }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center text-[12.5px] font-medium text-[var(--danger)] underline underline-offset-4">
        {compact ? "Not saved — retry" : "Not saved — try again"}
      </button>
    );
  }
  const words =
    state === "saved" ? (compact ? "Saved" : "All changes saved") : state === "saving" ? "Saving…" : compact ? "Saving soon" : "Saving shortly";
  return (
    <span aria-live="polite" className="inline-flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--muted)]">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          state === "saved" ? "bg-[var(--sage)]" : state === "saving" ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--peach)]"
        }`}
      />
      <span className="truncate">{words}</span>
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
  // The step being left, while its changes are sent. Kept by step, so it
  // means nothing once the next one is open.
  const [movingFrom, setMovingFrom] = useState<StepId | null>(null);
  const moving = movingFrom === step;
  const topRef = useRef<HTMLDivElement>(null);

  // The application as it now stands (the draft, without waiting for a
  // render), the sections changed since they were last sent, the timer that
  // will send them, the writes on their way, and whether the last one was
  // refused.
  const latest = useRef<ApplicationSections>(draft);
  const dirty = useRef<Set<SectionId>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writes = useRef<Set<Promise<boolean>>>(new Set());
  const failing = useRef(false);
  const stepRef = useRef(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  /** True once every write sent so far has landed and nothing is left unsent. */
  async function settled(): Promise<boolean> {
    let ok = true;
    while (writes.current.size > 0) {
      if ((await Promise.all([...writes.current])).includes(false)) ok = false;
    }
    return ok && dirty.current.size === 0;
  }

  /** Send every unsaved section now, with its latest value. */
  function flush(): Promise<boolean> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const keys = [...dirty.current];
    if (keys.length > 0) {
      dirty.current.clear();
      const batch = Object.fromEntries(keys.map((key) => [key, latest.current[key]])) as Partial<ApplicationSections>;
      setSave("saving");
      const write = saveSections(uid, batch, stepRef.current).then(
        () => true,
        () => {
          // Unsaved again. The next write sends them as they are by then.
          for (const key of keys) dirty.current.add(key);
          return false;
        },
      );
      writes.current.add(write);
      void write.then((ok) => {
        writes.current.delete(write);
        if (!ok) failing.current = true;
        else if (dirty.current.size === 0) failing.current = false;
        if (failing.current) setSave("error");
        else if (writes.current.size > 0) setSave("saving");
        else setSave(dirty.current.size > 0 ? "waiting" : "saved");
      });
    }
    return settled();
  }

  /**
   * A step's change. With `immediate` it is sent at once, and the promise
   * says whether it landed — so a step can, say, delete an old file only
   * once nothing points at it any more.
   */
  function change<K extends SectionId>(
    key: K,
    next: ApplicationSections[K],
    options?: { immediate?: boolean },
  ): Promise<boolean> {
    latest.current = { ...latest.current, [key]: next };
    setDraft(latest.current);
    dirty.current.add(key);
    setSave("waiting");
    if (timer.current) clearTimeout(timer.current);
    if (options?.immediate) return flush();
    timer.current = setTimeout(() => void flush(), 800);
    return Promise.resolve(true);
  }

  // Remember the step they are on, so "continue" brings them back here.
  useEffect(() => {
    void saveLastStep(uid, step).catch(() => {});
  }, [uid, step]);

  // Leaving with something unsaved: send it on the way out, and ask the
  // browser to hold the page while it goes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0 || writes.current.size > 0) {
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
    setMovingFrom(step);
    // Sent before leaving, so the next step opens with it. Waiting for the
    // server is only to hear a refusal: on a slow connection the write is
    // already on its way, and they should not be held here for it.
    const saved = await within(flush(), MOVE_WAIT_MS, true);
    if (!saved) {
      // Refused (the indicator says so, with a way to try again). Staying
      // keeps the change on screen rather than leaving it behind.
      setMovingFrom(null);
      return;
    }
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
    const saved = await within(flush(), SUBMIT_WAIT_MS, false);
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
                className="flex h-11 items-center rounded-full border border-[var(--border)] px-4 text-[12.5px] font-medium"
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
              {next ? (
                <Button loading={moving} onClick={() => void onContinue()}>
                  Save and continue
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Phone: the way on is always under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--dark)]/10 bg-[var(--surface)]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2">
          {prev ? (
            <Button variant="ghost" onClick={() => void go(prev.id)}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" href="/apply">
              Overview
            </Button>
          )}
          <span className="flex min-w-0 flex-1 justify-center">
            <SaveIndicator state={save} onRetry={() => void flush()} compact />
          </span>
          {next ? (
            <Button loading={moving} onClick={() => void onContinue()}>
              Continue
            </Button>
          ) : (
            <span aria-hidden className="w-[72px]" />
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
