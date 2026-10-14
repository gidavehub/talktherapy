import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";
import MotionProvider from "./components/MotionProvider";
import VoiceUnlock from "./components/VoiceUnlock";

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

export const metadata: Metadata = {
  // The template brands every page that sets its own title, so page titles
  // should name the page only ("Pricing", not "Pricing — TALK").
  title: {
    default: "TALK — listen, support, heal, grow",
    template: "%s · TALK",
  },
  description:
    "Private conversations with TALK and qualified providers, in English, Wolof, Mandinka or Pulaar. Culturally rooted mental wellbeing support for The Gambia.",
  icons: {
    icon: "/brand/icon.png",
    shortcut: "/brand/icon.png",
    apple: "/brand/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
    >
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
      </body>
    </html>
  );
}
