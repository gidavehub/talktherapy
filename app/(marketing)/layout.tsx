import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * Public site chrome.
 *
 * `Header` is absolutely positioned by design (it floats over the hero art),
 * so this wrapper has to be `relative` or it escapes to the viewport. Pages
 * inside this group are responsible for their own top padding — the landing
 * page gets it from `Hero`'s `pt-[88px] md:pt-0`, everything else should use
 * `<PageIntro>`, which bakes the same offset in.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
