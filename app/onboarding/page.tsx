import { redirect } from "next/navigation";

/**
 * Onboarding is no longer a form. A new person meets Talk, who learns what
 * they need by conversation, in their own language — see app/therapy.
 *
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function OnboardingPage() {
  redirect("/therapy");
}
