import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UserDetail from "@/components/admin/ops/UserDetail";

/** Staff: one person's account. Next 16 — `params` is a Promise. */
export const metadata: Metadata = {
  title: "Account",
};

export default async function AdminUserPage(props: PageProps<"/admin/users/[uid]">) {
  const { uid } = await props.params;
  // A sign-in id is letters, digits, "_" and "-". Anything else (a "/" above
  // all) is not an account, and would only make a broken database path.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) notFound();
  return <UserDetail uid={uid} />;
}
