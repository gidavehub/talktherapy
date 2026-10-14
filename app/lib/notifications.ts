/**
 * Things the app has to tell somebody: an application received, a decision
 * made. Written only by the functions (firestore.rules); the recipient may
 * mark one read, and that is all.
 *
 * `to` is a uid, or "staff" for everyone on the staff side.
 */

import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: number;
  readAt: number | null;
};

const NOTIFICATIONS = "notifications";

/** The latest notifications for `to`, newest first. */
export function watchNotifications(
  to: string,
  onChange: (items: AppNotification[]) => void,
  max = 20,
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
            title: String(data.title ?? ""),
            body: String(data.body ?? ""),
            href: typeof data.href === "string" ? data.href : null,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            readAt: typeof data.readAt === "number" ? data.readAt : null,
          };
        }),
      ),
    // A missing index or a refused read leaves the list empty rather than
    // breaking the page it sits on.
    () => onChange([]),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(firestore(), NOTIFICATIONS, id), { readAt: Date.now() });
}
