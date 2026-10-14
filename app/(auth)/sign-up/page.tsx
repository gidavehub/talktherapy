import { redirect } from "next/navigation";
import { talkHref } from "@/lib/talkDoorway";

/**
 * Creating an account is TALK's to do: she welcomes them, brings the sign-up
 * up as she asks for it, and the onboarding carries on from there.
 *
 * Except for a provider applying to join, whose account is made on /apply,
 * beside everything they need to know about applying. `?role=provider` is
 * still honoured — old links and bookmarks say it — by sending them there.
 *
 * Next 16: `searchParams` is a Promise and has to be awaited.
 */
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { role } = await props.searchParams;
  redirect(role === "provider" ? "/apply" : talkHref());
}
