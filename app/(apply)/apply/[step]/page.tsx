import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ApplyWizard from "@/components/apply/ApplyWizard";
import { STEPS, isStepId } from "@/lib/providerApplication";

/**
 * One step of the application: /apply/personal, /apply/documents, …
 *
 * Next 16: `params` is a Promise. An unknown step is a 404 rather than a
 * redirect — a mistyped address should say so.
 */
export async function generateMetadata(props: PageProps<"/apply/[step]">): Promise<Metadata> {
  const { step } = await props.params;
  return { title: STEPS.find((s) => s.id === step)?.label ?? "Apply" };
}

export default async function ApplyStepPage(props: PageProps<"/apply/[step]">) {
  const { step } = await props.params;
  if (!isStepId(step)) notFound();
  return <ApplyWizard step={step} />;
}
