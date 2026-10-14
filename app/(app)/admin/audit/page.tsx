import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import AuditLog from "@/components/admin/ops/AuditLog";

/** Staff: every change made by staff, and by scripts acting for them. */
export const metadata: Metadata = {
  title: "Audit log",
};

/**
 * `?target=users/<uid>` narrows it to one thing, `?actor=<uid>` to one
 * person — links from an account page. Next 16 — `searchParams` is a Promise.
 */
export default async function AdminAuditPage(props: PageProps<"/admin/audit">) {
  const { target, actor } = await props.searchParams;
  const initialTarget = typeof target === "string" && /^[A-Za-z]+\/[A-Za-z0-9_-]{1,128}$/.test(target) ? target : undefined;
  const initialActor = typeof actor === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(actor) ? actor : undefined;
  return (
    <div>
      <PageHeader
        eyebrow="Audit log"
        lines={["Every change,", "and who made it."]}
        lede="Roles, sign-ins, applications, support and the site — what was done, by whom, and when. Nothing here can be edited."
      />
      <AuditLog key={`${initialTarget ?? ""}|${initialActor ?? ""}`} initialTarget={initialTarget} initialActor={initialActor} />
    </div>
  );
}
