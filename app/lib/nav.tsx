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
  IconShield,
  IconGrid,
  IconChart,
  IconHeart,
  IconBadge,
  IconLifebuoy,
  IconPen,
  IconImage,
  IconPalette,
  IconHistory,
} from "../components/ui/icons";

/**
 * Navigation per role.
 *
 * `primary` marks the items that appear in the mobile bottom bar. Five is a
 * hard ceiling — beyond that the targets get too small to hit reliably, and
 * phone is the default device here rather than the exception. Everything else
 * stays reachable through the menu.
 *
 * Only routes that actually exist are listed; a nav item that 404s is worse
 * than one that is not there yet. The staff rail is the one exception while
 * it is being built: it is laid out in full up front so that the pages behind
 * it can be added side by side without each one editing this list.
 */

export const PATIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <IconHome />, primary: true },
  // The providers picked for this person — the point of the whole product.
  { href: "/matches", label: "Providers", icon: <IconPeople />, primary: true },
  // Sits next to Providers because it is the step straight after finding one.
  // This takes the bottom bar to exactly five; anything added later has to
  // take a slot rather than extend the row.
  { href: "/chats", label: "Messages", icon: <IconChat />, primary: true },
  { href: "/talk", label: "TALK", icon: <IconMic />, primary: true },
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

/**
 * Staff. Fifteen places, so the rail is grouped: how the service is doing,
 * the people in it, the day-to-day work that waits for a person, the public
 * site, and the staff member's own messages and settings.
 *
 * The bottom bar takes the five a person on a phone reaches for: the overview,
 * the numbers, providers waiting to be approved, the review queue, and the
 * site's words. Everything else is one tap away in the menu.
 *
 * Overview is `exact` because every staff page starts with "/admin" — without
 * it, Overview would be lit on all of them.
 *
 * Audit log sits with the day-to-day work rather than on its own: it is where
 * a decision made in Review or Payments is checked afterwards.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: <IconGrid />, primary: true, exact: true, section: "At a glance" },
  { href: "/admin/insights", label: "Insights", icon: <IconChart />, primary: true, section: "At a glance" },
  { href: "/admin/insights/wellbeing", label: "Wellbeing", icon: <IconHeart />, section: "At a glance" },

  { href: "/admin/users", label: "Users", icon: <IconPeople />, section: "People" },
  { href: "/admin/providers", label: "Providers", icon: <IconBadge />, primary: true, section: "People" },
  { href: "/admin/review", label: "Review", icon: <IconShield />, primary: true, section: "People" },

  { href: "/admin/sessions", label: "Sessions", icon: <IconCalendar />, section: "Operations" },
  { href: "/admin/payments", label: "Payments", icon: <IconWallet />, section: "Operations" },
  { href: "/admin/support", label: "Support", icon: <IconLifebuoy />, section: "Operations" },
  { href: "/admin/audit", label: "Audit log", icon: <IconHistory />, section: "Operations" },

  { href: "/admin/content", label: "Content", icon: <IconPen />, primary: true, section: "Site" },
  { href: "/admin/content/media", label: "Media", icon: <IconImage />, section: "Site" },
  { href: "/admin/content/theme", label: "Theme", icon: <IconPalette />, section: "Site" },

  { href: "/chats", label: "Messages", icon: <IconChat />, section: "You" },
  { href: "/settings", label: "Settings", icon: <IconSettings />, section: "You" },
];
