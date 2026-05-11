"use client";

import { useEffect, useRef } from "react";

type OrbProps = {
  size?: number;
  reactive?: boolean;
  className?: string;
};

/**
 * Animated AI orb. If reactive=true, asks for microphone permission and
 * grows the inner glow with input volume — the "voice UI" avatar.
 */
export default function Orb({ size = 320, reactive = false, className = "" }: OrbProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactive) return;

    let raf = 0;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new Ctx();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length / 255;
          const scale = 1 + Math.min(0.35, avg * 1.8);
          if (innerRef.current) {
            innerRef.current.style.transform = `scale(${scale})`;
          }
          if (haloRef.current) {
            haloRef.current.style.opacity = `${0.55 + avg * 0.8}`;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // microphone denied — fall back to passive animation
      }
    }
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
    };
  }, [reactive]);

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* outer halo */}
      <div
        ref={haloRef}
        className="orb-breath absolute inset-[-18%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,122,69,0.55) 0%, rgba(255,90,31,0.35) 35%, rgba(255,90,31,0) 70%)",
        }}
      />

      {/* slow rotating ring */}
      <div className="orb-rotate absolute inset-[6%] rounded-full opacity-60"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(255,255,255,0.0), rgba(255,255,255,0.45), rgba(255,90,31,0.55), rgba(255,255,255,0.0))",
          mask: "radial-gradient(circle, transparent 56%, black 58%, black 64%, transparent 66%)",
          WebkitMask:
            "radial-gradient(circle, transparent 56%, black 58%, black 64%, transparent 66%)",
        }}
      />

      {/* main orb body */}
      <div
        ref={innerRef}
        className="orb-pulse absolute inset-[16%] rounded-full shadow-2xl transition-transform duration-100"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #ffd1b8 0%, #ff8a5a 22%, #ff5a1f 55%, #b73a10 88%)",
          boxShadow:
            "0 24px 80px -10px rgba(255,90,31,0.55), inset 0 0 60px rgba(255,255,255,0.25), inset 0 -30px 60px rgba(0,0,0,0.35)",
        }}
      >
        {/* highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: "10%",
            left: "18%",
            width: "38%",
            height: "30%",
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0))",
            filter: "blur(4px)",
          }}
        />
      </div>

      {/* tiny floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full bg-white/70 orb-pulse"
            style={{
              width: 4,
              height: 4,
              top: `${20 + i * 11}%`,
              left: `${15 + (i * 13) % 70}%`,
              animationDelay: `${i * 0.4}s`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}
