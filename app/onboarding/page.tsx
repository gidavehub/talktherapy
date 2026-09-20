"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import Orb from "@/components/Orb";
import Button from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Input";
import { Alert, Pill } from "@/components/ui/Feedback";
import { useAuth } from "@/components/AuthProvider";
import { completeOnboarding } from "@/lib/wellbeing";
import { INTAKE_GOALS, LOCALE_LABELS, type Locale } from "@/lib/models";

/**
 * Intake.
 *
 * Four steps in one route rather than four routes: the flow is short, state is
 * transient until the final write, and keeping it in one component lets the
 * steps animate as a continuous surface instead of remounting.
 *
 * Nothing is persisted until the last step. Someone who abandons halfway has
 * left no trace beyond the account they already had.
 */

type Step = "welcome" | "goals" | "language" | "consent";
const STEPS: Step[] = ["welcome", "goals", "language", "consent"];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, ready } = useAuth();

  const [step, setStep] = useState<Step>("welcome");
  const [goals, setGoals] = useState<string[]>([]);
  const [locale, setLocale] = useState<Locale>("en");
  const [dataProcessing, setDataProcessing] = useState(false);
  const [aiDisclosure, setAiDisclosure] = useState(false);
  const [personalInsights, setPersonalInsights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/sign-in?next=%2Fonboarding");
      return;
    }
    // Already done — don't make someone re-consent every visit.
    if (profile?.onboarded) router.replace("/dashboard");
  }, [ready, user, profile, router]);

  const index = STEPS.indexOf(step);

  function next() {
    const nextStep = STEPS[index + 1];
    if (nextStep) setStep(nextStep);
  }

  function back() {
    const prevStep = STEPS[index - 1];
    if (prevStep) setStep(prevStep);
  }

  function toggleGoal(id: string) {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding(user.uid, {
        locale,
        goals,
        consents: {
          dataProcessing,
          aiDisclosure,
          personalInsights,
          marketing: false,
          acceptedTermsAt: Date.now(),
        },
      });
      router.replace("/dashboard");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We could not save that. Please try again.",
      );
      setSaving(false);
    }
  }

  // Both required consents must be explicit. Neither is pre-ticked.
  const canFinish = dataProcessing && aiDisclosure && !saving;

  if (!ready || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--background)]">
        <Orb size={110} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="px-4 sm:px-6 md:px-10 pt-5 md:pt-8 flex items-center justify-between">
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Step {index + 1} of {STEPS.length}
        </span>
      </header>

      {/* Progress */}
      <div className="px-4 sm:px-6 md:px-10 mt-6">
        <div className="h-px bg-[var(--foreground)]/10 relative">
          <motion.div
            className="absolute inset-y-0 left-0 bg-[var(--accent)]"
            animate={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
            transition={SPRING_SOFT}
          />
        </div>
      </div>

      <main className="flex-1 px-4 sm:px-6 md:px-10 py-12 md:py-16">
        <div className="max-w-[640px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={SPRING_SOFT}
            >
              {step === "welcome" ? (
                <div>
                  <div className="flex justify-center mb-10">
                    <Orb size={160} />
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    Welcome
                  </p>
                  <h1 className="mt-4 text-[32px] sm:text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.02em] font-medium">
                    {profile?.displayName || user.displayName
                      ? `Hello, ${(profile?.displayName || user.displayName)?.split(" ")[0]}.`
                      : "Hello."}
                  </h1>
                  <p className="mt-5 text-[15px] md:text-[16px] leading-relaxed text-[var(--muted)]">
                    A few quick questions so Talk is useful to you from the
                    start. It takes about a minute, none of it is shared with
                    anyone, and you can change all of it later.
                  </p>
                </div>
              ) : null}

              {step === "goals" ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    About you
                  </p>
                  <h1 className="mt-4 text-[28px] sm:text-[36px] md:text-[42px] leading-[1.08] tracking-[-0.02em] font-medium">
                    What brings you here?
                  </h1>
                  <p className="mt-4 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
                    Pick as many as fit, or none. This only shapes what we
                    suggest — it is never shown to anyone else.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-2">
                    {INTAKE_GOALS.map((goal) => (
                      <Pill
                        key={goal.id}
                        active={goals.includes(goal.id)}
                        onClick={() => toggleGoal(goal.id)}
                      >
                        {goal.label}
                      </Pill>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === "language" ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    Language
                  </p>
                  <h1 className="mt-4 text-[28px] sm:text-[36px] md:text-[42px] leading-[1.08] tracking-[-0.02em] font-medium">
                    How would you rather talk?
                  </h1>
                  <p className="mt-4 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
                    We use this to suggest counsellors who work in your
                    language.
                  </p>

                  <div className="mt-8 space-y-3">
                    {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
                      <motion.button
                        key={code}
                        type="button"
                        onClick={() => setLocale(code)}
                        whileTap={{ scale: 0.99 }}
                        transition={SPRING_SNAP}
                        aria-pressed={locale === code}
                        className={`w-full text-left rounded-2xl border px-5 py-4 transition-colors ${
                          locale === code
                            ? "bg-[var(--dark)] text-white border-[var(--dark)]"
                            : "bg-white border-[var(--border)] hover:bg-black/[.03]"
                        }`}
                      >
                        <span className="text-[15px] font-medium">
                          {LOCALE_LABELS[code]}
                        </span>
                        {code !== "en" ? (
                          <span
                            className={`mt-1 block text-[12px] ${
                              locale === code ? "text-white/60" : "text-[var(--muted)]"
                            }`}
                          >
                            Counsellors available. AI companion is English-only
                            for now.
                          </span>
                        ) : null}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === "consent" ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    Before you start
                  </p>
                  <h1 className="mt-4 text-[28px] sm:text-[36px] md:text-[42px] leading-[1.08] tracking-[-0.02em] font-medium">
                    Two things to agree to.
                  </h1>
                  <p className="mt-4 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)]">
                    Please read these rather than ticking past them. They are
                    short because they matter.
                  </p>

                  <div className="mt-8 space-y-6">
                    <Checkbox
                      checked={dataProcessing}
                      onChange={setDataProcessing}
                      label="I understand how my information is handled"
                      description="My journal and mood entries are private to me. Conversations are encrypted in transit and at rest, but not end-to-end — our infrastructure provider holds the keys. Nothing is sold or used for advertising."
                    />

                    <Checkbox
                      checked={aiDisclosure}
                      onChange={setAiDisclosure}
                      label="I understand the AI companion is not a therapist"
                      description="It does not diagnose, prescribe, or replace a qualified professional, and it cannot respond to an emergency. It is clearly labelled as AI whenever I use it."
                    />

                    <div className="pt-6 border-t border-[var(--border)]">
                      <Checkbox
                        checked={personalInsights}
                        onChange={setPersonalInsights}
                        label="Personal insights (optional)"
                        description="Let Talk show general patterns based on my own mood check-ins and activity. No clinical interpretation. I can turn this off at any time."
                      />
                    </div>
                  </div>

                  <Alert tone="warning" className="mt-8">
                    Talk is not an emergency service. If you are in immediate
                    danger, call 117 for police or 116 for an ambulance —{" "}
                    <Link href="/crisis" className="underline underline-offset-4">
                      crisis contacts
                    </Link>
                    .
                  </Alert>

                  <p className="mt-6 text-[12px] text-[var(--muted)] leading-relaxed">
                    By continuing you agree to our{" "}
                    <Link href="/terms" className="underline underline-offset-4">
                      terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline underline-offset-4">
                      privacy policy
                    </Link>
                    .
                  </p>

                  {error ? (
                    <Alert tone="warning" className="mt-6">
                      {error}
                    </Alert>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className="mt-12 flex items-center gap-3">
            {index > 0 ? (
              <Button variant="ghost" withArrow={false} onClick={back}>
                Back
              </Button>
            ) : null}

            {step === "consent" ? (
              <Button onClick={finish} disabled={!canFinish} loading={saving}>
                Finish
              </Button>
            ) : (
              <Button onClick={next}>
                {step === "welcome" ? "Get started" : "Continue"}
              </Button>
            )}

            {step === "goals" || step === "language" ? (
              <button
                type="button"
                onClick={next}
                className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Skip
              </button>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
