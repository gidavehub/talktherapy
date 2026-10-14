"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Button from "../ui/Button";
import Timeline, { type TimelineItem, type TimelineTone } from "../ui/Timeline";
import { Alert } from "../ui/Feedback";
import LogoLoader from "../ui/LogoLoader";
import { ArchPortrait } from "../ui/Arch";
import { SPRING_SOFT } from "../motion/primitives";
import { useApplicant } from "./useApplicant";
import { useNow } from "@/lib/useNow";
import { markNotificationRead, watchNotifications, type AppNotification } from "@/lib/notifications";
import { incompleteSteps, type ApplicationStatus as Status, type HistoryEvent } from "@/lib/providerApplication";

/**
 * /apply/status — where a sent application stands, in plain words: what
 * happens next, anything staff have asked for, and everything that has
 * happened to it so far.
 */

const COPY: Record<Status, { eyebrow: string; title: [string, string]; body: string }> = {
  draft: {
    eyebrow: "Not sent yet",
    title: ["Your application", "is still a draft."],
    body: "Nobody has seen it yet. Finish the steps and send it when you are ready.",
  },
  submitted: {
    eyebrow: "Received",
    title: ["Thank you.", "It is with us."],
    body: "A person on our team will check your identity, qualifications and documents — usually within three working days. You do not need to do anything; we will tell you here as soon as anything changes.",
  },
  in_review: {
    eyebrow: "Being checked",
    title: ["Your application", "is being reviewed."],
    body: "A member of our team is checking it now. If they need anything from you, it will appear here with a note saying what.",
  },
  changes_requested: {
    eyebrow: "Over to you",
    title: ["A few changes,", "please."],
    body: "Read the note below, make the changes, and send it back. Everything else you gave us is kept.",
  },
  approved: {
    eyebrow: "Approved",
    title: ["Welcome to TALK.", "You are live."],
    body: "Your profile is in the directory, and the hours you gave us are open for booking.",
  },
  rejected: {
    eyebrow: "Not approved",
    title: ["We could not approve", "your application."],
    body: "We know this is disappointing. The reason is below. If you think we have made a mistake, or your situation changes, write to us.",
  },
  suspended: {
    eyebrow: "Paused",
    title: ["Your profile", "is paused."],
    body: "It has been taken out of the directory for now. The reason is below. Write to us if you have questions.",
  },
};

const EVENT: Record<HistoryEvent["type"], { title: string; tone: TimelineTone }> = {
  created: { title: "Application started", tone: "neutral" },
  submitted: { title: "Application sent", tone: "accent" },
  resubmitted: { title: "Changes sent back", tone: "accent" },
  review_started: { title: "Review started", tone: "neutral" },
  changes_requested: { title: "Changes asked for", tone: "warning" },
  approved: { title: "Approved", tone: "positive" },
  rejected: { title: "Not approved", tone: "danger" },
  suspended: { title: "Profile paused", tone: "danger" },
  reinstated: { title: "Profile live again", tone: "positive" },
};

function when(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function Notifications({ uid }: { uid: string }) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  useEffect(() => watchNotifications(uid, setItems, 10), [uid]);
  if (!items || items.length === 0) return null;
  return (
    <section className="rounded-[26px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-7">
      <h2 className="font-display text-[22px] font-medium">Messages from TALK</h2>
      <ul className="mt-4 divide-y divide-[var(--dark)]/8">
        {items.map((n) => (
          <li key={n.id} className="flex gap-3 py-4 first:pt-1 last:pb-0">
            <span
              aria-hidden
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-[var(--sand)]" : "bg-[var(--accent)]"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">
                {n.title}
                {n.readAt ? null : <span className="sr-only"> (new)</span>}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--muted)]">{n.body}</p>
              <p className="mt-1 text-[11.5px] text-[var(--muted)]">{when(n.createdAt)} · Banjul time</p>
            </div>
            {n.readAt ? null : (
              <button
                type="button"
                onClick={() => void markNotificationRead(n.id).catch(() => {})}
                className="h-9 shrink-0 self-start rounded-full px-3 text-[12px] text-[var(--muted)] hover:bg-[var(--sand)]"
              >
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ApplicationStatus() {
  const applicant = useApplicant();
  const router = useRouter();
  const now = useNow(60_000);

  const away =
    applicant.kind === "signed-out" || applicant.kind === "none" || applicant.kind === "wrong-role"
      ? "/apply"
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
  if (applicant.kind === "approved") {
    return (
      <div className="mx-auto max-w-[760px] px-5 py-12 md:px-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
          <p className="eyebrow">{COPY.approved.eyebrow}</p>
          <h1 className="font-display mt-3 text-[38px] font-medium leading-[1.04] md:text-[54px]">
            {COPY.approved.title[0]}
            <br />
            <span className="display-accent">{COPY.approved.title[1]}</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-[var(--muted)]">{COPY.approved.body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" href="/chats">
              Go to my messages
            </Button>
            <Button size="lg" variant="secondary" href="/pro/availability">
              Check my hours
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }
  if (applicant.kind !== "ready") {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LogoLoader label="Opening your status" />
      </div>
    );
  }

  const { app, uid } = applicant;
  const copy = COPY[app.status];
  const firstFix = incompleteSteps(app, now)[0] ?? "review";
  const timeline: TimelineItem[] = [...app.history]
    .sort((a, b) => b.at - a.at)
    .map((event, i) => ({
      id: `${event.at}-${i}`,
      at: event.at,
      title: EVENT[event.type].title,
      tone: EVENT[event.type].tone,
      body: event.message ? <span className="whitespace-pre-line">{event.message}</span> : undefined,
    }));
  if (app.createdAt) {
    timeline.push({ id: "created", at: app.createdAt, title: EVENT.created.title, tone: "neutral" });
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-6 md:px-10 md:pt-10">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.4fr_1fr]">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_SOFT}>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display mt-3 text-[38px] font-medium leading-[1.04] md:text-[54px]">
            {copy.title[0]}
            <br />
            <span className="display-accent">{copy.title[1]}</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-[var(--muted)]">{copy.body}</p>

          {app.message && (app.status === "changes_requested" || app.status === "rejected" || app.status === "suspended") ? (
            <div className="mt-7 rounded-[24px] border-l-4 border-[var(--accent)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">From our team</p>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{app.message}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {app.status === "changes_requested" ? (
              <Button size="lg" href={`/apply/${firstFix}`}>
                Make the changes
              </Button>
            ) : null}
            {app.status === "draft" ? (
              <Button size="lg" href="/apply">
                Finish my application
              </Button>
            ) : null}
            {app.status === "rejected" || app.status === "suspended" ? (
              <Button size="lg" href="/support">
                Write to us
              </Button>
            ) : null}
            {app.status === "submitted" || app.status === "in_review" ? (
              <Button size="lg" variant="secondary" href="/for-providers">
                While you wait: working with TALK
              </Button>
            ) : null}
          </div>
        </motion.div>

        <div className="relative mx-auto hidden h-[300px] w-[240px] lg:block">
          <ArchPortrait
            src={app.status === "approved" ? "/people/hero-chat.webp" : "/people/mind-tea.webp"}
            alt=""
            tone={app.status === "changes_requested" ? "var(--peach)" : "var(--sage-soft)"}
            className="h-full w-full"
            sizes="260px"
            scale={1.12}
            aspect={4 / 3}
          />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-[26px] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-7">
          <h2 className="font-display text-[22px] font-medium">What has happened</h2>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">Times are Banjul time.</p>
          <Timeline items={timeline} className="mt-5" emptyText="Nothing yet." />
        </section>
        <Notifications uid={uid} />
      </div>

      <p className="mt-10 text-center text-[13px] text-[var(--muted)]">
        Questions about your application?{" "}
        <Link href="/support" className="text-[var(--foreground)] underline underline-offset-4">
          Write to us
        </Link>
        .
      </p>
    </div>
  );
}
