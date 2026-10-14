import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import SessionsList from "@/components/admin/ops/SessionsList";

/** Staff: every session booked through TALK. */
export const metadata: Metadata = {
  title: "Sessions",
};

/** One provider's sessions, from a link on their account page. Next 16 — `searchParams` is a Promise. */
export default async function AdminSessionsPage(props: PageProps<"/admin/sessions">) {
  const { provider } = await props.searchParams;
  const providerUid = typeof provider === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(provider) ? provider : undefined;
  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        lines={["Every session,", "booked and paid."]}
        lede="Who meets whom, when, and where the money stands. Patients are named by first name, and nothing either side wrote is shown."
      />
      {/* Keyed by the provider, so following a link to another provider's
          sessions starts the page fresh. */}
      <SessionsList key={providerUid ?? "everyone"} providerUid={providerUid} />
    </div>
  );
}
