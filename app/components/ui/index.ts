/**
 * UI kit barrel.
 *
 * Import screens' primitives from `@/components/ui` so the surface stays one
 * named thing. If you need a style that is not here, add a variant rather than
 * hand-rolling classes in a screen — that drift is what this kit prevents.
 */

export { default as Button } from "./Button";
export type { ButtonProps } from "./Button";

export { default as Card, StatTile, DarkPanel } from "./Card";

export { Field, Input, Textarea, Select, ChipGroup, Checkbox } from "./Input";

export {
  Eyebrow,
  RevealHeading,
  Lede,
  SectionHeading,
  Stamp,
} from "./Typography";

export {
  Badge,
  Pill,
  Avatar,
  Spinner,
  EmptyState,
  BulletItem,
  CheckItem,
  Alert,
} from "./Feedback";

export { default as Modal } from "./Modal";
export { default as Tabs, NavTabs } from "./Tabs";
export type { TabItem } from "./Tabs";

export { ToastProvider, useToast } from "./Toast";

export { default as AppShell } from "./AppShell";
export type { NavItem } from "./AppShell";

export * from "./icons";
