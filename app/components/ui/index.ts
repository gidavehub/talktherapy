/**
 * UI kit barrel.
 *
 * Import screens' primitives from `@/components/ui` so the surface stays one
 * named thing. If you need a style that is not here, add a variant rather than
 * hand-rolling classes in a screen — that drift is what this kit prevents.
 */

export { default as Button } from "./Button";
export type { ButtonProps } from "./Button";

export { default as Card, StatTile, DarkPanel, ArchStack } from "./Card";

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
  Skeleton,
  SkeletonList,
  EmptyState,
  BulletItem,
  CheckItem,
  Alert,
} from "./Feedback";

export { ArchFrame, ArchPortrait, ARCH_TONES, archTone } from "./Arch";
export { default as SearchField } from "./SearchField";
export { default as LogoLoader } from "./LogoLoader";

export { default as Modal } from "./Modal";
export { default as MinorFlag } from "./MinorFlag";
export { default as Tabs, NavTabs } from "./Tabs";
export type { TabItem } from "./Tabs";

export { ToastProvider, useToast } from "./Toast";

export { default as AppShell, PageBar } from "./AppShell";
export type { NavItem } from "./AppShell";

export * from "./icons";

// Data and layout: tables, drawers, confirmations, records and page tops.
export { default as DataTable, Pagination } from "./DataTable";
export type { DataColumn, DataSort, DataTableProps, CsvRecord } from "./DataTable";
export { default as Drawer } from "./Drawer";
export { default as ConfirmDialog } from "./ConfirmDialog";
export { default as DescriptionList } from "./DescriptionList";
export type { DescriptionItem } from "./DescriptionList";
export { default as Timeline } from "./Timeline";
export type { TimelineItem, TimelineTone } from "./Timeline";
export { default as Stepper, ProgressBar } from "./Stepper";
export type { StepperStep, StepStatus } from "./Stepper";
export { default as PageHeader } from "./PageHeader";
export { default as Breadcrumbs } from "./Breadcrumbs";
export type { BreadcrumbItem } from "./Breadcrumbs";

// Media and colour: drop areas, image uploads, the image picker, colours.
export { default as FileDropzone, validateFiles, describeAccept, formatBytes } from "./FileDropzone";
export { default as ImageUploader } from "./ImageUploader";
export type { ImageValue } from "./ImageUploader";
export { default as MediaLibrary } from "./MediaLibrary";
export type { MediaItem } from "./MediaLibrary";
export { default as ColorPicker, BRAND_SWATCHES, BRAND_BACKGROUNDS } from "./ColorPicker";
export type { Swatch, ContrastTarget } from "./ColorPicker";

// Form controls drawn by hand: dropdowns, action menus, switches, segments, tooltips.
export { Dropdown, MultiDropdown } from "./Dropdown";
export type { DropdownOption } from "./Dropdown";
export { default as Menu } from "./Menu";
export type { MenuItem, MenuTriggerProps } from "./Menu";
export { default as Switch } from "./Switch";
export { default as SegmentedControl } from "./SegmentedControl";
export { default as Tooltip } from "./Tooltip";

// Dashboards: figures with deltas, the date range, and the SVG chart kit.
export { default as StatCard } from "./StatCard";
export { default as DateRangePicker, resolveDateRange } from "./DateRangePicker";
export type { DateRangePreset, DateRangeValue } from "./DateRangePicker";
export * from "./charts";
