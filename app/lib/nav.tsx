import type { NavItem } from "../components/ui/AppShell";
import {
  IconHome,
  IconMood,
  IconJournal,
  IconPeople,
  IconSettings,
  IconResources,
  IconMic,
  IconChat,
  IconCalendar,
  IconClock,
  IconWallet,
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
  // The providers picked for this person — the point of the whole product.
  { href: "/matches", label: "Providers", icon: <IconPeople />, primary: true },
  // Sits next to Providers because it is the step straight after finding one.
  // This takes the bottom bar to exactly five; anything added later has to
  // take a slot rather than extend the row.
  { href: "/chats", label: "Messages", icon: <IconChat />, primary: true },
  { href: "/therapy", label: "Talk", icon: <IconMic />, primary: true },
  // Took the fifth slot from Settings. A session you have booked is something
  // you will check; settings is something you change once.
  { href: "/sessions", label: "Sessions", icon: <IconCalendar />, primary: true },
  // Useful, but not what the MVP is for — reachable from the menu.
  { href: "/settings/profile", label: "Settings", icon: <IconSettings /> },
  { href: "/mood", label: "Mood", icon: <IconMood /> },
  { href: "/journal", label: "Journal", icon: <IconJournal /> },
  { href: "/resources", label: "Resources", icon: <IconResources /> },
];

/**
 * A provider's side of the app.
 *
 * Short: answer the people who have written to them, keep the listing that
 * lets those people find them, and be paid for the work. Messages comes first
 * — it is the one thing that is waiting on them, and the one thing that is
 * urgent.
 *
 * Mood, journal and the companion are deliberately absent. They are a
 * patient's tools, and putting a provider's own notes in the same place as the
 * people they treat is how records end up in the wrong file.
 */
export const PROVIDER_NAV: NavItem[] = [
  { href: "/chats", label: "Messages", icon: <IconChat />, primary: true },
  { href: "/sessions", label: "Sessions", icon: <IconCalendar />, primary: true },
  { href: "/pro/availability", label: "Hours", icon: <IconClock />, primary: true },
  { href: "/pro/earnings", label: "Earnings", icon: <IconWallet />, primary: true },
  { href: "/pro/profile", label: "Profile", icon: <IconPeople />, primary: true },
  // Off the bottom bar (five fit), still in the menu.
  { href: "/settings", label: "Settings", icon: <IconSettings /> },
];
