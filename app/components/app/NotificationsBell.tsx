"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SPRING_SNAP } from "../motion/primitives";
import { useAuth } from "../AuthProvider";
import Button from "../ui/Button";
import Drawer from "../ui/Drawer";
import { Alert, EmptyState, Skeleton, SkeletonList } from "../ui/Feedback";
import { IconBell } from "../ui/icons";
import { useToast } from "../ui/Toast";
import {
  STAFF_NOTICES,
  isUnread,
  markAllNotificationsRead,
  markNotificationRead,
  noticeTime,
  watchNotifications,
  type AppNotification,
} from "../../lib/notifications";

/**
 * The bell, and the panel it opens: what the app has had to tell this person.
 *
 * Staff see the notices addressed to all of staff — a new application, one
 * sent back with changes — and each of them marks those read for themselves
 * alone. Everybody else sees their own: a provider learns here that they have
 * been approved, on the screens they use from then on, rather than on the
 * application pages they have left behind.
 *
 * AppShell reads the feed once (useNotificationFeed) and hands it to two
 * bells, one in the phone's top bar and one at the top of the computer's
 * rail. Only one of them is ever on screen.
 */

const MAX = 20;

export type NotificationFeed = {
  /** Null while the first answer is on its way. */
  items: AppNotification[] | null;
  error: boolean;
  unread: number;
  /** Who is reading: read state is theirs, even on a notice staff share. */
  reader: string | null;
  staff: boolean;
  retry: () => void;
};

type FeedState = { to: string | null; items: AppNotification[] | null; error: boolean };
const WAITING: FeedState = { to: null, items: null, error: false };

export function useNotificationFeed(): NotificationFeed {
  const { user, profile } = useAuth();
  const reader = user?.uid ?? null;
  const staff = profile?.role === "admin";
  const to = reader ? (staff ? STAFF_NOTICES : reader) : null;
  const [state, setState] = useState<FeedState>(WAITING);
  /** Bumped by "Try again": the listener starts over. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!to) return;
    return watchNotifications(
      to,
      (items) => setState({ to, items, error: false }),
      MAX,
      () => setState({ to, items: null, error: true }),
    );
  }, [to, attempt]);

  // What arrived for somebody else — before a sign-out, or before the
  // profile said this is staff — is never shown as theirs.
  const current = state.to === to ? state : WAITING;
  const items = current.items;
  return {
    items,
    error: current.error,
    unread: items && reader ? items.filter((item) => isUnread(item, reader)).length : 0,
    reader,
    staff,
    retry: () => {
      setState(WAITING);
      setAttempt((n) => n + 1);
    },
  };
}

function NoticeRow({
  item,
  unread,
  onRead,
  onNavigate,
}: {
  item: AppNotification;
  unread: boolean;
  onRead: () => void;
  onNavigate: () => void;
}) {
  const words = (
    <>
      <p className="text-[14.5px] font-medium leading-snug">
        {item.title}
        {unread ? <span className="sr-only"> (new)</span> : null}
      </p>
      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--muted)]">{item.body}</p>
      <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">{noticeTime(item.createdAt)} · Banjul time</p>
    </>
  );

  return (
    <li className="flex items-start gap-3 py-4">
      <span
        aria-hidden
        className={`mt-[9px] h-2 w-2 shrink-0 rounded-full ${unread ? "bg-[var(--accent)]" : "bg-[var(--sand)]"}`}
      />
      {item.href ? (
        <Link
          href={item.href}
          onClick={() => {
            if (unread) onRead();
            onNavigate();
          }}
          className="-mx-2 -my-1.5 min-w-0 flex-1 rounded-2xl px-2 py-1.5 outline-none transition-colors hover:bg-[var(--sand)]/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
        >
          {words}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{words}</div>
      )}
      {unread ? (
        <button
          type="button"
          onClick={onRead}
          aria-label={`Mark "${item.title}" read`}
          className="h-11 shrink-0 rounded-full px-3 text-[12px] text-[var(--muted)] outline-none transition-colors hover:bg-[var(--sand)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Mark read
        </button>
      ) : null}
    </li>
  );
}

function NoticeList({
  feed,
  onRead,
  onNavigate,
}: {
  feed: NotificationFeed;
  onRead: (item: AppNotification) => void;
  onNavigate: () => void;
}) {
  const { items, reader } = feed;

  if (feed.error) {
    return (
      <Alert
        tone="warning"
        title="Your notifications did not load"
        action={
          <Button variant="ghost" onClick={feed.retry}>
            Try again
          </Button>
        }
      >
        Check your connection, then try again.
      </Alert>
    );
  }

  if (!items || !reader) {
    return (
      <SkeletonList count={3} label="Loading notifications" className="space-y-6">
        <div className="flex gap-3">
          <Skeleton className="mt-1 h-2 w-2" rounded="rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </SkeletonList>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconBell size={20} />}
        title="Nothing new"
        description={
          feed.staff
            ? "New provider applications, and ones sent back with changes, will appear here."
            : "When TALK has something to tell you, it will appear here."
        }
      />
    );
  }

  return (
    <ul className="-mt-4 divide-y divide-[var(--dark)]/8">
      {items.map((item) => (
        <NoticeRow
          key={item.id}
          item={item}
          unread={isUnread(item, reader)}
          onRead={() => onRead(item)}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

export default function NotificationsBell({
  feed,
  tone,
}: {
  feed: NotificationFeed;
  /** "dark" on the rail, "light" in the top bar. */
  tone: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const { error: toastError } = useToast();
  const { items, reader, unread } = feed;

  // Marking read is a small write that rarely fails; when it does, the dot
  // simply stays, and a toast says why.
  const failed = () => toastError("That did not go through", "Check your connection, then try again.");
  const markRead = (item: AppNotification) => {
    if (reader) void markNotificationRead(item, reader).catch(failed);
  };
  const markAll = () => {
    if (reader && items) void markAllNotificationsRead(items, reader).catch(failed);
  };

  return (
    <>
      <motion.button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.94 }}
        transition={SPRING_SNAP}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 ${
          tone === "dark"
            ? "border border-white/15 text-[var(--cream)]/75 hover:bg-white/5 hover:text-[var(--cream)] focus-visible:ring-[var(--cream)]/60"
            : "border-[1.5px] border-[var(--dark)]/70 text-[var(--foreground)] focus-visible:ring-[var(--accent)]"
        }`}
      >
        <IconBell size={18} />
        {unread > 0 ? (
          <motion.span
            key={unread}
            aria-hidden
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_SNAP}
            className={`absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-medium leading-none text-white tabular-nums ring-2 ${
              tone === "dark" ? "ring-[var(--dark)]" : "ring-[var(--background)]"
            }`}
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        ) : null}
      </motion.button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={feed.staff ? "For the team" : undefined}
        title="Notifications"
        width="440px"
        footer={
          unread > 0 ? (
            <Button variant="ghost" fullWidth onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        <NoticeList feed={feed} onRead={markRead} onNavigate={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
