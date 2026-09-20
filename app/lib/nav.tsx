import type { NavItem } from "../components/ui/AppShell";
import {
  IconHome,
  IconMood,
  IconJournal,
  IconPeople,
  IconSettings,
  IconResources,
} from "../components/ui/icons";

/**
 * Navigation per role.
 *
 * `primary` marks the items that appear in the mobile bottom bar. Five is a
 * hard ceiling — beyond that the targets get too small to hit reliably, and
 * phone is the default device here rather than the exception. Everything else
 * stays reachable through the menu.
 *
 * Only routes that actually exist are listed. The AI companion and bookings
 * land in later phases and get added here then; a nav item that 404s is worse
 * than one that is not there yet.
 */

export const PATIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <IconHome />, primary: true },
  { href: "/mood", label: "Mood", icon: <IconMood />, primary: true },
  { href: "/journal", label: "Journal", icon: <IconJournal />, primary: true },
  { href: "/therapists", label: "Counsellors", icon: <IconPeople />, primary: true },
  { href: "/resources", label: "Resources", icon: <IconResources />, primary: true },
  { href: "/settings/profile", label: "Settings", icon: <IconSettings /> },
];
