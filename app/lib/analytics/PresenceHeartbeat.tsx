"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import type { PresenceArea } from "../adminStatsCore";
import { usePresence } from "./usePresence";

/** Messages and session calls are told apart; everywhere else in the app is "the app". */
function areaOf(pathname: string): PresenceArea {
  if (pathname === "/chats" || pathname.startsWith("/chats/")) return "chat";
  if (pathname.startsWith("/call/")) return "call";
  return "app";
}

/** Mounted once, in the signed-in app's layout: see usePresence. */
export default function PresenceHeartbeat() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  usePresence({ uid: user?.uid ?? null, role: profile?.role ?? null, area: areaOf(pathname ?? "") });
  return null;
}
