import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";
import MotionProvider from "./components/MotionProvider";
import VoiceUnlock from "./components/VoiceUnlock";
import TrafficBeacon from "./lib/analytics/TrafficBeacon";
import { getThemeCss, siteMetadata } from "./lib/content/server";

/** Text: a soft geometric sans. */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Headlines: a warm serif, with the italic the second lines are set in. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/**
 * The title and description staff set for the front page (the seo section of
 * the site content), which every page without its own falls back to. The
 * template brands every page that sets its own title, so page titles name the
 * page only ("Pricing", not "Pricing — TALK").
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await siteMetadata()),
    icons: {
      icon: "/brand/icon.png",
      shortcut: "/brand/icon.png",
      apple: "/brand/icon.png",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The published palette, as overrides of the tokens in globals.css. Empty
  // while it is the original — and only ever validated hex values, built by
  // themeCss, never a string from the database.
  const themeCss = await getThemeCss();
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
    >
      <head>{themeCss ? <style id="site-theme">{themeCss}</style> : null}</head>
      <body
        className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        // Browser extensions (e.g. NewVT, Grammarly, password managers) inject
        // attributes onto <body> before React hydrates, causing a benign
        // hydration mismatch. This is the React-recommended way to silence it.
        suppressHydrationWarning
      >
        <MotionProvider>
          <AuthProvider>
            <VoiceUnlock />
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </MotionProvider>
        <TrafficBeacon />
      </body>
    </html>
  );
}
