import { redirect } from "next/navigation";

// /settings on its own has no content of its own — send people to the first tab.
export default function SettingsIndexPage() {
  redirect("/settings/profile");
}
