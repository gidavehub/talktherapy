import type { NavItem } from "../components/ui/AppShell";
import {
  IconHome,
  IconMood,
  IconJournal,
  IconPeople,
  IconSettings,
  IconResources,
  IconMic,
} from "../components/ui/icons";

/**
 * Navigation per role.
 *
 * `primary` marks the items that appear in the mobile bottom bar. Five is a
 * hard ceiling — beyond that the targets get too small to hit reliably, and
 * phone is the default device here rather than the exception. Everything else
 * stays reachable through the menu.
 *
 * Only routes that actually exist are listed. Bookings land in a later phase
 * and get added here then; a nav item that 404s is worse than one that is not
 * there yet.
 */

export const PATIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <IconHome />, primary: true },
  // The counsellors picked for this person — the point of the whole product.
  { href: "/counsellors", label: "Counsellors", icon: <IconPeople />, primary: true },
  { href: "/therapy", label: "Talk", icon: <IconMic />, primary: true },
  { href: "/settings/profile", label: "Settings", icon: <IconSettings />, primary: true },
  // Useful, but not what the MVP is for — reachable from the menu.
  { href: "/mood", label: "Mood", icon: <IconMood /> },
  { href: "/journal", label: "Journal", icon: <IconJournal /> },
  { href: "/resources", label: "Resources", icon: <IconResources /> },
];
