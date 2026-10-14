"use client";

import { createContext, useContext } from "react";
import type { SiteMedia } from "@/lib/content/schema";

/**
 * What every control in the content form shares, without threading it
 * through each level of groups and lists: the problems to show, and the
 * media library for the picture fields.
 */
export type FormContextValue = {
  /**
   * The problem to show under a field now, by its key ("faq.items.2.a"), or
   * null. A field's problems show once it has been left, or once publishing
   * has been tried; `always` shows it straight away — for a list that has
   * just lost or gained an item.
   */
  problem: (key: string, always?: boolean) => string | null;
  /** How many problems are showing at a key and everything inside it — for a folded card's badge. */
  problemsUnder: (key: string) => number;
  /** A field has been left: its problems may show from now on. */
  touch: (key: string) => void;
  /** The uploaded pictures, newest first. Null while they load. */
  media: SiteMedia[] | null;
  /** A picture just uploaded from a field, so it can be chosen before the library catches up. */
  addMedia: (media: SiteMedia) => void;
};

export const FormContext = createContext<FormContextValue>({
  problem: () => null,
  problemsUnder: () => 0,
  touch: () => {},
  media: null,
  addMedia: () => {},
});

export function useForm(): FormContextValue {
  return useContext(FormContext);
}
