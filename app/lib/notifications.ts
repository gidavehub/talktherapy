/**
 * Things the app has to tell somebody: an application received, a decision
 * made. Written only by the functions (firestore.rules); the recipient may
 * mark one read, and that is all.
 *
 * `to` is a uid, or "staff" for everyone on the staff side. A notice for one
 * person is read once, so it carries `readAt`. A notice for staff is shared,
 * and one member of staff reading it must not clear it for the rest, so each
 * adds their own uid to `readBy` instead.
 */

import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";

/** The `to` of a notice for every member of staff. */
export const STAFF_NOTICES = "staff";

export type AppNotification = {
  id: string;
  to: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: number;
  readAt: number | null;
  /** On a staff notice: the staff who have read it. */
  readBy: string[];
};

const NOTIFICATIONS = "notifications";

/**
 * The latest notifications for `to`, newest first. Without `onError`, a
 * missing index or a refused read leaves the list empty rather than breaking
 * the page it sits on.
 */
export function watchNotifications(
  to: string,
  onChange: (items: AppNotification[]) => void,
  max = 20,
  onError?: () => void,
): () => void {
  if (!firebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(firestore(), NOTIFICATIONS), where("to", "==", to), orderBy("createdAt", "desc"), limit(max)),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            to: String(data.to ?? ""),
            title: String(data.title ?? ""),
            body: String(data.body ?? ""),
            href: typeof data.href === "string" ? data.href : null,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            readAt: typeof data.readAt === "number" ? data.readAt : null,
            readBy: Array.isArray(data.readBy) ? data.readBy.filter((r): r is string => typeof r === "string") : [],
          };
        }),
      ),
    () => (onError ? onError() : onChange([])),
  );
}

/** Whether `reader` has still to see this notice. */
export function isUnread(item: AppNotification, reader: string): boolean {
  return item.to === STAFF_NOTICES ? !item.readBy.includes(reader) : item.readAt === null;
}

/** The change that marks one notice read by `reader` — the only one the rules allow. */
function readChange(item: AppNotification, reader: string) {
  return item.to === STAFF_NOTICES ? { readBy: arrayUnion(reader) } : { readAt: Date.now() };
}

export async function markNotificationRead(item: AppNotification, reader: string): Promise<void> {
  await updateDoc(doc(firestore(), NOTIFICATIONS, item.id), readChange(item, reader));
}

/** Every notice in `items` that `reader` has not read, in one write. */
export async function markAllNotificationsRead(items: AppNotification[], reader: string): Promise<void> {
  const unread = items.filter((item) => isUnread(item, reader));
  if (unread.length === 0) return;
  const batch = writeBatch(firestore());
  for (const item of unread) batch.update(doc(firestore(), NOTIFICATIONS, item.id), readChange(item, reader));
  await batch.commit();
}

/** "14 Oct, 12:30" — Banjul time, which is UTC. */
export function noticeTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
