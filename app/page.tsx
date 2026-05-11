import Header from "./components/Header";
import Hero from "./components/Hero";
import ConsultationBanner from "./components/ConsultationBanner";
import TherapySession from "./components/TherapySession";
import MeditationCutout from "./components/MeditationCutout";
import Pricing from "./components/Pricing";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <div className="relative">
      <Header />
      <Hero />
      <ConsultationBanner />
      <TherapySession />
      <MeditationCutout />
      <Pricing />
      <Footer />
    </div>
  );
}
