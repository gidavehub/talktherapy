"use client";

import { useEffect, useState } from "react";
import { adminListUsers } from "@/lib/adminOps-client";
import type { PersonRef } from "@/lib/adminOps";

/**
 * Everyone on the staff side, for "assign to" and "changes made by".
 *
 * Asked for once per page load and shared: the support inbox and the audit
 * log both want it, and it changes about as often as somebody is hired. A
 * failed ask is forgotten, so the next page to want it asks again.
 */

let staffAsk: Promise<PersonRef[] | null> | null = null;

/** Pages of the people list read at most, looking for staff. */
const MAX_PAGES = 20;

/**
 * Every member of staff. The role filter is applied as the server reads, so
 * one page can come back short of them all, with a cursor: follow it to the
 * end of the list.
 */
async function readStaff(): Promise<PersonRef[] | null> {
  const found: PersonRef[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await adminListUsers({ role: "admin", limit: 100, cursor });
    if (!result.ok) return null;
    for (const row of result.data.items) found.push({ uid: row.uid, name: row.displayName ?? row.email });
    cursor = result.data.nextCursor;
    if (!cursor) break;
  }
  return found.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "en-GB"));
}

function askForStaff(): Promise<PersonRef[] | null> {
  staffAsk ??= readStaff().then((list) => {
    if (!list) staffAsk = null;
    return list;
  });
  return staffAsk;
}

/** Null while it loads, and when it could not be loaded (the pickers then offer only "Nobody"). */
export function useStaff(): PersonRef[] | null {
  const [staff, setStaff] = useState<PersonRef[] | null>(null);
  useEffect(() => {
    let live = true;
    void askForStaff().then((list) => {
      if (live) setStaff(list);
    });
    return () => {
      live = false;
    };
  }, []);
  return staff;
}
