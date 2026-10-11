import { redirect } from "next/navigation";
import { talkHref } from "@/lib/talkDoorway";
import { safeNext } from "@/lib/routing";

/**
 * Signing in is Talk's to do now: she brings the sign-in up on her own
 * screen, and somebody new carries straight on into the onboarding there.
 * This address stays so old links and bookmarks still arrive — with where
 * they were heading.
 *
 * Next 16: `searchParams` is a Promise and has to be awaited.
 */
export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next } = await props.searchParams;
  redirect(talkHref({ signIn: true, next: safeNext(typeof next === "string" ? next : null) }));
}
