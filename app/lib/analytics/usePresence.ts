"use client";

import { useEffect } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../firebase";
import { HEARTBEAT_MS, presenceKeys, type PresenceArea } from "../adminStatsCore";
import { ANALYTICS_ON } from "./shared";

/**
 * "Signed in and here now", for the staff numbers.
 *
 * While a signed-in page is on screen it writes presence/{uid} every minute:
 * the server's time and which part of the app they are in, and nothing else
 * (firestore.rules holds it to exactly those two fields, and lets nobody read
 * it back — the adminStats function only counts).
 *
 * Once a day, a week and a month it also leaves a marker —
 * presence/{uid}/presenceDays/{yyyy-mm-dd}, presenceWeeks/{monday},
 * presenceMonths/{yyyy-mm} — so daily, weekly and monthly actives are each a
 * single count of one kind of marker, never a scan of who came when. The
 * rules only accept a marker for the period the server's clock is in.
 *
 * Staff are not counted, so the numbers are about the people TALK serves.
 */

type Marker = { collection: string; field: "day" | "week" | "month"; key: string };

/** Markers this tab has already left, so a minute's beat writes one document, not four. */
const left = new Set<string>();

const markerId = (uid: string, marker: Marker) => `${uid}/${marker.collection}/${marker.key}`;
const storageKey = (uid: string) => `talk:presence:${uid}`;

/** What this device last left for `uid`, by kind. Survives a reload; never relied on. */
function stored(uid: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function store(uid: string, marker: Marker) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify({ ...stored(uid), [marker.field]: marker.key }));
  } catch {
    // Storage refused: this tab's memory is enough.
  }
}

async function beat(uid: string, area: PresenceArea) {
  const db = firestore();
  await setDoc(doc(db, "presence", uid), { lastSeenAt: serverTimestamp(), area });

  const keys = presenceKeys(Date.now());
  const markers: Marker[] = [
    { collection: "presenceDays", field: "day", key: keys.day },
    { collection: "presenceWeeks", field: "week", key: keys.week },
    { collection: "presenceMonths", field: "month", key: keys.month },
  ];
  for (const marker of markers) {
    if (left.has(markerId(uid, marker)) || stored(uid)[marker.field] === marker.key) continue;
    // Tried once per tab whatever happens: a device whose clock is a day out
    // is refused by the rules, and should not be refused every minute.
    left.add(markerId(uid, marker));
    await setDoc(doc(db, "presence", uid, marker.collection, marker.key), {
      [marker.field]: marker.key,
      at: serverTimestamp(),
    });
    store(uid, marker);
  }
}

/**
 * Beat for `uid` while the page is visible. `role` must be known before
 * anything is written, so a member of staff is never counted while their
 * profile is still loading.
 */
export function usePresence({
  uid,
  role,
  area,
}: {
  uid: string | null;
  role: string | null;
  area: PresenceArea;
}) {
  useEffect(() => {
    if (!ANALYTICS_ON || !uid || !role || role === "admin") return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      // Being counted must never get in anybody's way.
      beat(uid, area).catch(() => {});
    };
    tick();
    const timer = setInterval(tick, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [uid, role, area]);
}
