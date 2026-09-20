import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Talk Therapy — AI-guided therapy matching",
  description:
    "Calm your mind. Elevate your clarity. Talk Therapy uses conversational AI to match you with the right therapist in minutes.",
  icons: {
    icon: "/tablogo.png",
    shortcut: "/tablogo.png",
    apple: "/tablogo.png",
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
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
    >
      <body
        className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        // Browser extensions (e.g. NewVT, Grammarly, password managers) inject
        // attributes onto <body> before React hydrates, causing a benign
        // hydration mismatch. This is the React-recommended way to silence it.
        suppressHydrationWarning
      >
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
