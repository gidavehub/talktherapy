import { redirect } from "next/navigation";
import AuthCard from "../../components/AuthCard";
import { talkHref } from "@/lib/talkDoorway";

/**
 * Creating an account is Talk's to do: she welcomes them, brings the sign-up
 * up as she asks for it, and the onboarding carries on from there.
 *
 * Except for a provider applying to join. Talk's sign-up makes PATIENT
 * accounts, and an account's role is fixed when it is made (firestore.rules),
 * so `?role=provider` stays here, on its own card. It is read HERE, on the
 * server: reading it in the client renders one heading on the server and
 * another in the browser, which is a hydration mismatch.
 *
 * Next 16: `searchParams` is a Promise and has to be awaited.
 */
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { role } = await props.searchParams;
  if (role !== "provider") redirect(talkHref());

  return <AuthCard mode="sign-up" role="provider" />;
}
