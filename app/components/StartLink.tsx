"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAuth } from "./AuthProvider";
import { homeFor } from "../lib/routing";
import { TALK, beginDoorway, isTalk } from "../lib/talkDoorway";

/**
 * Where "get started" goes for whoever is looking at it.
 *
 * Signed out → Talk, who brings sign-in up as she asks for it. Signed in →
 * their dashboard, or Talk if they have not finished onboarding. Every
 * call to action goes through this, so a signed-in person is never asked to
 * log in again — and a new one always meets Talk first (lib/talkDoorway).
 */
export function useStartHref(): string {
  const { user, profile } = useAuth();
  if (!user) return TALK;
  // Signed in but the profile is still loading: the app gate routes onward.
  return profile ? homeFor(profile) : "/dashboard";
}

export default function StartLink({ onClick, ...props }: Omit<ComponentProps<typeof Link>, "href">) {
  const href = useStartHref();
  const { user, ready } = useAuth();
  return (
    <Link
      {...props}
      href={href}
      onClick={(e) => {
        // Inside the tap: that is what lets her be heard on the next screen.
        // Not before the session is known: a returning person must not be
        // greeted with "please sign in" while their sign-in is restoring.
        if (ready && isTalk(href)) beginDoorway(Boolean(user), e);
        onClick?.(e);
      }}
    />
  );
}
