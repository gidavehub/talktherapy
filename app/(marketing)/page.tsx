import Hero from "@/components/Hero";
import ConsultationBanner from "@/components/ConsultationBanner";
import TherapySession from "@/components/TherapySession";
import MeditationCutout from "@/components/MeditationCutout";
import Pricing from "@/components/Pricing";

// Header and Footer now live in (marketing)/layout.tsx so the other public
// pages get them for free.
export default function Home() {
  return (
    <>
      <Hero />
      <ConsultationBanner />
      <TherapySession />
      <MeditationCutout />
      <Pricing />
    </>
  );
}
