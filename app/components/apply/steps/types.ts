import type { ApplicationSections, Problems, SectionId } from "@/lib/providerApplication";

/**
 * What every step of the application is given. A step owns one section of
 * the application; it shows it, edits it, and hands every change back through
 * `onChange` — the wizard saves it (after a short pause while typing, or at
 * once with `immediate`, for things like an upload that has just landed).
 * With `immediate`, the promise says whether it was saved.
 */
export type StepProps<K extends SectionId> = {
  uid: string;
  value: ApplicationSections[K];
  onChange: (next: ApplicationSections[K], options?: { immediate?: boolean }) => Promise<boolean>;
  /** What is wrong with this section — empty until they have tried to move on. */
  problems: Problems;
  /** The whole application as it stands, for steps that need another part of it. */
  draft: ApplicationSections;
  now: number;
};
