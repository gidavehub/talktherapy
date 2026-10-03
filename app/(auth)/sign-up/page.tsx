import AuthCard from "../../components/AuthCard";

/**
 * `?role=provider` is read HERE, on the server, and handed to the card as a
 * prop.
 *
 * The obvious alternative — reading window.location inside the client
 * component — renders "Create your account" on the server and "Join as a
 * provider" on the client, which is a hydration mismatch: React throws, the
 * tree is thrown away and rebuilt, and a provider watches the heading change
 * under them. Reading it where the URL actually lives costs this page its
 * static prerender and nothing else.
 *
 * Next 16: `searchParams` is a Promise and has to be awaited.
 */
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { role } = await props.searchParams;

  return <AuthCard mode="sign-up" role={role === "provider" ? "provider" : "patient"} />;
}
