import type { Metadata } from "next";
import ProviderDirectory from "@/components/marketing/ProviderDirectory";
import CtaBand from "@/components/home/CtaBand";

export const metadata: Metadata = {
  title: "Find a provider",
  description:
    "Browse credential-verified providers and psychosocial support professionals in The Gambia. Filter by language, specialty and who you feel most comfortable with.",
};

export default function ProvidersPage() {
  return (
    <>
      <ProviderDirectory />
      <CtaBand
        tone="sage"
        lines={["Not sure who to choose?", "Let TALK match you."]}
        text="A short conversation — in English, Wolof, Mandinka or Pulaar — then providers who fit what you need."
      />
    </>
  );
}
