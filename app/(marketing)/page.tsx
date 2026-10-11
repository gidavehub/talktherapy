import HomeHero from "@/components/home/HomeHero";
import MindPicker from "@/components/home/MindPicker";
import MeetProviders from "@/components/home/MeetProviders";
import HowSteps from "@/components/home/HowSteps";
import PricingPlans from "@/components/home/PricingPlans";
import Faq from "@/components/home/Faq";
import CtaBand from "@/components/home/CtaBand";

// Header and Footer live in (marketing)/layout.tsx so the other public pages
// get them for free.
export default function Home() {
  return (
    <>
      <HomeHero />
      <MindPicker />
      <MeetProviders />
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
      <HowSteps />
      <PricingPlans />
      <div className="zigzag bg-[var(--cream)]" aria-hidden />
      <Faq />
      <CtaBand
        lines={["Whatever you're carrying,", "you don't have to carry it alone."]}
        text="Start with a private conversation, in your own language."
      />
    </>
  );
}
