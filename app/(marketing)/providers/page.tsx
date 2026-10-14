import type { Metadata } from "next";
import ProviderDirectory from "@/components/marketing/ProviderDirectory";
import CtaBand from "@/components/home/CtaBand";
import { getContent, pageMetadata } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("providers");
}

export default async function ProvidersPage() {
  const content = await getContent("providers");
  return (
    <>
      <ProviderDirectory intro={content.intro} />
      <CtaBand tone="sage" content={content.cta} />
    </>
  );
}
