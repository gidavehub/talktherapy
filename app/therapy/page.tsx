"use client";

import { useState } from "react";
import Link from "next/link";
import Orb from "../components/Orb";

export default function TherapyPage() {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Tap the orb to begin your session.");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--dark)] text-white">
      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 sm:px-6 md:px-10 pt-5 md:pt-6 flex items-center justify-between">
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <Link
          href="/"
          className="h-10 px-4 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] flex items-center hover:bg-white/10 transition-colors"
        >
          End Session
        </Link>
      </div>

      {/* ambient bg */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 55%, rgba(255,90,31,0.35) 0%, rgba(255,90,31,0) 55%), radial-gradient(circle at 80% 20%, rgba(255,90,31,0.18), transparent 50%)",
        }}
      />

      <section className="relative z-[1] flex flex-col items-center justify-center min-h-screen px-4 sm:px-6">
        <p className="text-[12px] uppercase tracking-[0.22em] text-white/65 mb-10">
          Session in progress
        </p>

        <button
          type="button"
          onClick={() => {
            setListening((v) => !v);
            setStatus(
              listening ? "Paused. Tap to resume." : "Listening… speak naturally.",
            );
          }}
          className="group"
          aria-label={listening ? "Pause session" : "Start session"}
        >
          <Orb size={320} reactive={listening} />
        </button>

        <p className="mt-12 text-center text-[18px] md:text-[20px] max-w-[520px] text-white/90">
          {status}
        </p>

        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setListening((v) => !v)}
            className={`h-12 px-6 rounded-full text-[12px] uppercase tracking-[0.14em] font-medium transition-colors ${
              listening
                ? "bg-white text-[var(--dark)] hover:bg-white/90"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent-soft)]"
            }`}
          >
            {listening ? "Pause" : "Begin"}
          </button>
          <Link
            href="/"
            className="h-12 px-6 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
          >
            Exit
          </Link>
        </div>

        <p className="mt-16 text-[11px] uppercase tracking-[0.18em] text-white/45 text-center max-w-[380px]">
          If you are in crisis, please call your local emergency line or a
          suicide-prevention hotline immediately.
        </p>
      </section>
    </main>
  );
}
