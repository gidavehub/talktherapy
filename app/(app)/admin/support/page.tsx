import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import SupportInbox from "@/components/admin/ops/SupportInbox";

/** Staff: messages from the contact form. */
export const metadata: Metadata = {
  title: "Support",
};

/** `?request=` opens one request, from a link in the audit log. Next 16 — `searchParams` is a Promise. */
export default async function AdminSupportPage(props: PageProps<"/admin/support">) {
  const { request } = await props.searchParams;
  const requestId = typeof request === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(request) ? request : undefined;
  return (
    <div>
      <PageHeader
        eyebrow="Support"
        lines={["Messages", "from the contact form."]}
        lede="Newest first. Take one so the others know it is being dealt with, reply by email, and keep notes for the rest of the staff."
      />
      <SupportInbox key={requestId ?? "inbox"} requestId={requestId} />
    </div>
  );
}
