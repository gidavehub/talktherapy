import type { Metadata } from "next";
import ApplyHome from "@/components/apply/ApplyHome";

export const metadata: Metadata = {
  title: { absolute: "Apply to join · TALK" },
  description:
    "Join TALK as a provider. Set your own fee, choose your hours, and support people across The Gambia in English, Wolof, Mandinka or Pulaar.",
};

export default function ApplyPage() {
  return <ApplyHome />;
}
