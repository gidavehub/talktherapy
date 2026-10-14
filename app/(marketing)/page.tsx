import HomeHero from "@/components/home/HomeHero";
import MindPicker from "@/components/home/MindPicker";
import MeetProviders from "@/components/home/MeetProviders";
import HowSteps from "@/components/home/HowSteps";
import PricingPlans from "@/components/home/PricingPlans";
import Faq from "@/components/home/Faq";
import CtaBand from "@/components/home/CtaBand";
import { getContent } from "@/lib/content/server";

// Header and Footer live in (marketing)/layout.tsx so the other public pages
// get them for free. The words and pictures are the site content (home, and
// the price cards from plans), read here on the server and handed down: the
// sections themselves are client components. The title is the root layout's
// default, from the seo section.
export default async function Home() {
  const [home, plans] = await Promise.all([getContent("home"), getContent("plans")]);
  return (
    <>
      <HomeHero content={home.hero} />
      <MindPicker content={home.mind} />
      <MeetProviders content={home.providers} />
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
      <HowSteps content={home.how} />
      <PricingPlans heading={home.pricing} cards={{ first: plans.first, provider: plans.provider, longer: plans.longer }} />
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
      <Faq content={home.faq} />
      <CtaBand content={home.cta} />
    </>
  );
}
