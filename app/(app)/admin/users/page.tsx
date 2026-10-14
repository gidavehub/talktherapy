import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import UsersList from "@/components/admin/ops/UsersList";

/** Staff: everyone with a TALK account. */
export const metadata: Metadata = {
  title: "Users",
};

export default function AdminUsersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Users"
        lines={["Everyone", "with a TALK account."]}
        lede="Patients, providers and staff, newest first. Open someone to see their sessions and payments, change their role, or turn off their sign-in."
      />
      <UsersList />
    </div>
  );
}
