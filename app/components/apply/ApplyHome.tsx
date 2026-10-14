"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import AuthCard from "../AuthCard";
import Button from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { ProgressBar } from "../ui/Stepper";
import LogoLoader from "../ui/LogoLoader";
import { ArchPortrait } from "../ui/Arch";
import { IconCheck } from "../ui/icons";
import { SPRING_SOFT } from "../motion/primitives";
import { useApplicant } from "./useApplicant";
import { useNow } from "@/lib/useNow";
import { startApplication } from "@/lib/providerApplication-client";
import { signOutToHome } from "@/lib/signOutFlow";
import {
  STEPS,
  completion,
  incompleteSteps,
  isEditable,
  stepComplete,
  type SectionId,
} from "@/lib/providerApplication";
import { formatDalasi, PLATFORM_FEE_RATE, providerPayoutMinor } from "@/lib/money";
import { HUMAN_RATE_MAX_MINOR, HUMAN_RATE_MIN_MINOR } from "@/lib/models";

/**
 * /apply — the front door for providers.
 *
 * Signed out, it is a short page about joining with the sign-up beside it.
 * Signed in, it becomes the applicant's own overview: start, carry on where
 * they left off, or — once sent — the status page instead.
 */

const FEE_EXAMPLE = 1_000_00;

const READY = [
  { title: "Your ID", body: "A national ID card or passport — a clear photo or a scan." },
  { title: "Your certificates", body: "For each qualification you list, and your licence if you have one." },
  { title: "A photo of you", body: "Face to the camera, eyes open, plain background. Phones are fine." },
  { title: "A mobile-money wallet", body: "Wave, Afrimoney, QMoney or APS, in your own name." },
];

const HOW = [
  {
    title: "Apply",
    body: "About twenty minutes. Everything saves as you go, so you can stop and come back whenever you like.",
  },
  {
    title: "We check it",
    body: "A person on our team checks your identity and qualifications, usually within three working days. If something needs fixing, we say what.",
  },
  {
    title: "Go live",
    body: "Your profile joins the directory, the hours you gave us open for booking, and TALK can suggest you to people who need what you offer.",
  },
  {
    title: "Get paid",
    body: "People pay before each session. A day after it ends, your share can go straight to your wallet.",
  },
];

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid min-h-[60vh] max-w-[560px] place-items-center px-5 py-16">{children}</div>;
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING_SOFT}
      className="w-full rounded-[28px] bg-[var(--surface)] p-7 shadow-[var(--shadow-floating)] md:p-10"
    >
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-display mt-3 text-[30px] font-medium leading-[1.08] md:text-[36px]">{title}</h1>
      <div className="mt-4 text-[14.5px] leading-relaxed text-[var(--muted)]">{children}</div>
    </motion.div>
  );
}

function SignedOut() {
  return (
    <>
      <section className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 pb-16 pt-6 md:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-10">
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
          <p className="eyebrow">Join TALK as a provider</p>
          <h1 className="font-display mt-4 text-[42px] font-medium leading-[1.02] md:text-[60px]">
            Your practice,
            <br />
            <span className="display-accent">further reach.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[16px] leading-relaxed text-[var(--muted)]">
            TALK connects qualified providers with people across The Gambia who need support and cannot easily get
            to it — in English, Wolof, Mandinka or Pulaar.
          </p>
          <ul className="mt-8 space-y-3 text-[14.5px]">
            {[
              `Set your own fee, between ${formatDalasi(HUMAN_RATE_MIN_MINOR)} and ${formatDalasi(HUMAN_RATE_MAX_MINOR)} a session`,
              "Choose the hours you work",
              "Paid to your mobile-money wallet",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-white">
                  <IconCheck size={13} />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <div className="relative mt-10 hidden h-[220px] w-[180px] lg:block">
            <ArchPortrait
              src="/people/hero-chat.webp"
              alt=""
              tone="var(--peach)"
              className="h-full w-full"
              sizes="200px"
              scale={1.15}
              aspect={4 / 3}
            />
          </div>
        </motion.div>
        <div className="flex justify-center lg:justify-end">
          <AuthCard mode="sign-up" role="provider" />
        </div>
      </section>

      <section className="bg-[var(--surface)] py-16 md:py-20">
        <div className="mx-auto max-w-[1100px] px-5 md:px-10">
          <p className="eyebrow">Before you start</p>
          <h2 className="font-display mt-3 text-[32px] font-medium leading-tight md:text-[40px]">
            Have these <span className="display-accent">to hand.</span>
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {READY.map((item, i) => (
              <div key={item.title} className="rounded-[24px] bg-[var(--background)] p-6">
                <span className="arch flex h-11 w-10 items-center justify-center rounded-b-xl bg-[var(--sage)] text-[14px] font-medium text-white">
                  {i + 1}
                </span>
                <h3 className="font-display mt-4 text-[20px] font-medium">{item.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-12 px-5 md:px-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="font-display mt-3 text-[32px] font-medium leading-tight md:text-[40px]">
              Four steps to <span className="display-accent">your first client.</span>
            </h2>
            <ol className="mt-10 space-y-7">
              {HOW.map((step, i) => (
                <li key={step.title} className="flex gap-5">
                  <span className="arch flex h-12 w-11 shrink-0 items-center justify-center rounded-b-xl bg-[var(--accent)] text-[15px] font-medium text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-[21px] font-medium">{step.title}</h3>
                    <p className="mt-1.5 max-w-[480px] text-[14px] leading-relaxed text-[var(--muted)]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="self-start rounded-[28px] bg-[var(--dark)] p-8 text-[var(--cream)] shadow-[var(--shadow-floating)]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--cream)]/70">An example</p>
            <p className="font-display mt-4 text-[22px] leading-snug">
              At a fee of {formatDalasi(FEE_EXAMPLE)} a session, you receive
            </p>
            <p className="font-display mt-2 text-[54px] font-medium leading-none text-[var(--peach)]">
              {formatDalasi(providerPayoutMinor(FEE_EXAMPLE))}
            </p>
            <p className="mt-5 text-[13.5px] leading-relaxed text-[var(--cream)]/75">
              TALK keeps {Math.round(PLATFORM_FEE_RATE * 100)}% to cover payments, the platform, checks and support.
              You practise independently, set your own hours and keep your own registration.
            </p>
            <Link href="/for-providers" className="mt-6 inline-block text-[13.5px] text-[var(--peach)] underline underline-offset-4">
              More about working with TALK
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function WrongRole({ role }: { role: string }) {
  const router = useRouter();
  if (role === "admin") {
    return (
      <Centered>
        <Panel eyebrow="Staff account" title="Applications are reviewed here, not made.">
          <p>You are signed in as staff. Applications waiting for a decision are on the providers page.</p>
          <div className="mt-6">
            <Button href="/admin/providers">Review applications</Button>
          </div>
        </Panel>
      </Centered>
    );
  }
  return (
    <Centered>
      <Panel eyebrow="This account" title="This account is for getting support.">
        <p>
          You are signed in with an account made for talking to TALK and booking providers. To apply as a provider,
          sign out and create a provider account — with a different email address.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => void signOutToHome(router)}>Sign out</Button>
          <Button href="/dashboard" variant="secondary">
            Back to my dashboard
          </Button>
        </div>
      </Panel>
    </Centered>
  );
}

function Start({ uid, name }: { uid: string; name: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name?.split(" ")[0];

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      await startApplication(uid, name);
      router.push("/apply/personal");
    } catch {
      setError("Your application could not be started. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[880px] px-5 py-10 md:px-10 md:py-16">
      <Panel eyebrow="Your application" title={first ? `Welcome, ${first}.` : "Welcome."}>
        <p>
          The application has ten short parts and a final check. It takes about twenty minutes, and everything saves
          as you go — stop whenever you like and carry on later from here.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {READY.map((item) => (
            <li key={item.title} className="flex gap-3 rounded-2xl bg-[var(--background)] p-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-white">
                <IconCheck size={13} />
              </span>
              <span>
                <span className="block text-[14px] font-medium text-[var(--foreground)]">{item.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>
        {error ? (
          <Alert tone="warning" className="mt-6">
            {error}
          </Alert>
        ) : null}
        <div className="mt-8">
          <Button size="lg" loading={busy} onClick={() => void begin()}>
            Start my application
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Overview({ applicant }: { applicant: Extract<ReturnType<typeof useApplicant>, { kind: "ready" }> }) {
  const now = useNow(60_000);
  const { app } = applicant;
  const left = incompleteSteps(app, now);
  const next: string = left[0] ?? "review";
  const resume = app.lastStep && app.lastStep !== "personal" ? app.lastStep : next;
  const first = (app.personal.displayName || applicant.name || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-[960px] px-5 py-10 md:px-10 md:py-14">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
        <p className="eyebrow">Your application</p>
        <h1 className="font-display mt-3 text-[34px] font-medium leading-[1.06] md:text-[46px]">
          {first ? `Welcome back, ${first}.` : "Welcome back."}
          <br />
          <span className="display-accent">{left.length === 0 ? "Ready to send." : "Let us carry on."}</span>
        </h1>
      </motion.div>

      {app.status === "changes_requested" ? (
        <Alert tone="warning" title="We asked for a few changes" className="mt-8">
          <p className="whitespace-pre-line">{app.message}</p>
        </Alert>
      ) : null}

      <div className="mt-8 rounded-[28px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
        <ProgressBar value={completion(app, now)} label={`${STEPS.length - 1 - left.length} of ${STEPS.length - 1} parts done`} />
        <ol className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {STEPS.map((step, i) => {
            const done = step.id !== "review" && stepComplete(step.id as SectionId, app, now);
            return (
              <li key={step.id}>
                <Link
                  href={`/apply/${step.id}`}
                  className="flex min-h-[56px] items-center gap-3.5 rounded-2xl border border-[var(--dark)]/8 bg-[var(--background)] px-4 py-3 transition-colors hover:border-[var(--dark)]/25"
                >
                  <span
                    aria-hidden
                    className={`arch flex h-9 w-8 shrink-0 items-center justify-center rounded-b-lg text-[12.5px] font-medium ${
                      done ? "bg-[var(--sage)] text-white" : "bg-[var(--sand)] text-[var(--muted)]"
                    }`}
                  >
                    {done ? <IconCheck size={13} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{step.label}</span>
                    <span className={`block text-[12px] ${done ? "text-[var(--sage-deep)]" : "text-[var(--muted)]"}`}>
                      {step.id === "review" ? (left.length ? `${left.length} to finish first` : "Ready") : done ? "Done" : "To do"}
                    </span>
                  </span>
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)]">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" href={`/apply/${left.length === 0 ? "review" : resume}`}>
            {left.length === 0 ? "Check and send" : "Continue where I left off"}
          </Button>
          {app.status !== "draft" ? (
            <Button size="lg" variant="secondary" href="/apply/status">
              Application status
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ApplyHome() {
  const applicant = useApplicant();
  const router = useRouter();

  const sent = applicant.kind === "ready" && !isEditable(applicant.app.status);
  useEffect(() => {
    if (sent) router.replace("/apply/status");
  }, [sent, router]);

  switch (applicant.kind) {
    case "loading":
      return (
        <Centered>
          <LogoLoader label="Opening your application" />
        </Centered>
      );
    case "signed-out":
      return <SignedOut />;
    case "wrong-role":
      return <WrongRole role={applicant.role} />;
    case "approved":
      return (
        <Centered>
          <Panel eyebrow="You are approved" title="You are already on TALK.">
            <p>Your profile is live. People can find you, and TALK can suggest you to someone who needs what you offer.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button href="/chats">Go to my messages</Button>
              <Button href="/pro/profile" variant="secondary">
                My profile
              </Button>
            </div>
          </Panel>
        </Centered>
      );
    case "none":
      return <Start uid={applicant.uid} name={applicant.name} />;
    case "error":
      return (
        <Centered>
          <Alert tone="warning" title="Something went wrong">
            {applicant.message}
          </Alert>
        </Centered>
      );
    case "ready":
      return sent ? (
        <Centered>
          <LogoLoader label="Opening your status" />
        </Centered>
      ) : (
        <Overview applicant={applicant} />
      );
  }
}
