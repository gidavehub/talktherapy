"use client";

import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, where, type Query } from "firebase/firestore";
import { firebaseConfigured, firestore } from "./firebase";
import { COLLECTIONS } from "./models";
import type { SupportStatus } from "./adminOps";
import { countApplicationsAwaitingStaff } from "./providerApplication-client";

/**
 * How much work is waiting on staff: the numbers beside Providers, Support
 * and Review in the staff menu. A new application, a new support request or
 * a parked payment is then seen from whichever staff page somebody is on —
 * and on a phone, from the dot on the menu button.
 *
 * Counted by the server (getCountFromServer), which downloads none of the
 * documents it counts; a listener would pull every waiting one into every
 * staff tab. A count is not live, so it is asked again when staff move to
 * another page, when the tab comes back into view, and once a minute while
 * it is in view.
 */

export type StaffQueues = { providers: number; support: number; review: number };

const NONE: StaffQueues = { providers: 0, support: 0, review: 0 };
const EVERY_MS = 60_000;

/**
 * One count that fails is shown as no number at all rather than as an
 * error: the page it belongs to says what is wrong when staff open it.
 */
async function orZero(read: Promise<number>): Promise<number> {
  try {
    return await read;
  } catch {
    return 0;
  }
}

const countOf = async (q: Query) => (await getCountFromServer(q)).data().count;

async function readQueues(): Promise<StaffQueues> {
  const db = firestore();
  const flagged = (name: string, field: string) => orZero(countOf(query(collection(db, name), where(field, "==", true))));
  const [providers, support, payments, payouts, disputed] = await Promise.all([
    orZero(countApplicationsAwaitingStaff()),
    orZero(countOf(query(collection(db, COLLECTIONS.supportRequests), where("status", "==", "new" satisfies SupportStatus)))),
    // The three queues on /admin/review, flagged as ReviewQueue reads them.
    flagged(COLLECTIONS.payments, "needsReview"),
    flagged(COLLECTIONS.payouts, "needsReview"),
    flagged(COLLECTIONS.bookings, "disputed"),
  ]);
  return { providers, support, review: payments + payouts + disputed };
}

/** The waiting counts while `staff` is true; nothing is read for anyone else. */
export function useStaffQueues(staff: boolean, pathname: string): StaffQueues {
  const [queues, setQueues] = useState<StaffQueues>(NONE);

  useEffect(() => {
    if (!staff || !firebaseConfigured()) return;
    let live = true;
    function refresh() {
      if (document.visibilityState !== "visible") return;
      void readQueues().then((next) => {
        if (live) setQueues(next);
      });
    }
    refresh();
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
    // The page is a dependency on purpose: moving to another staff page —
    // usually from deciding something — asks again.
  }, [staff, pathname]);

  return staff ? queues : NONE;
}
