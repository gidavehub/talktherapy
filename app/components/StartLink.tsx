"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAuth } from "./AuthProvider";
import { homeFor } from "../lib/routing";

/**
 * Where "get started" goes for whoever is looking at it.
 *
 * Signed out → sign up. Signed in → their dashboard, or Talk if they have not
 * finished onboarding. Every landing-page call to action goes through this so
 * a signed-in person is never asked to log in again.
 */
export function useStartHref(): string {
  const { user, profile } = useAuth();
  if (!user) return "/sign-up";
  // Signed in but the profile is still loading: the app gate routes onward.
  return profile ? homeFor(profile) : "/dashboard";
}

export default function StartLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const href = useStartHref();
  return <Link {...props} href={href} />;
}
