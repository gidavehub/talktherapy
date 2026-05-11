"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import StatCard from "./StatCard";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";

function Star({ delay = 0 }: { delay?: number }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#FF5A1F"
      initial={{ scale: 0, rotate: -90, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ ...SPRING_SNAP, delay }}
    >
      <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.897l-7.334 3.868 1.4-8.168L.132 9.21l8.2-1.192z" />
    </motion.svg>
  );
}

function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF7A45" strokeWidth="1.6">
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.66A3 3 0 0 0 6 18a3 3 0 0 0 3 3 3 3 0 0 0 3-3V4a3 3 0 0 0-3 0z" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5.66A3 3 0 0 1 18 18a3 3 0 0 1-3 3 3 3 0 0 1-3-3V4a3 3 0 0 1 3 0z" />
    </svg>
  );
}

function StarRow() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} delay={0.95 + i * 0.06} />
        ))}
      </div>
      <p className="text-[13px] text-[var(--muted)]">Trusted By 3,000+ Users</p>
    </div>
  );
}

function CTAButton() {
  return (
    <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
      <Link
        href="/sign-up"
        className="inline-flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white pl-6 pr-2 text-[13px] uppercase tracking-[0.12em] font-medium shadow-[0_10px_30px_-10px_rgba(255,90,31,0.6)]"
      >
        Book Session
        <motion.span
          className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center"
          whileHover={{ x: 4 }}
          transition={SPRING_SNAP}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </motion.span>
      </Link>
    </motion.div>
  );
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Desktop-only parallax (no harm on mobile but the layout flows there)
  const stampY = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const stampScale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[var(--background)] pt-[88px] md:pt-0 md:min-h-[1040px]"
    >
      {/*
        MOBILE: stacked flow — header → headline → image → stats → CTA → stamp
        DESKTOP (md+): switches to the layered absolute layout.
      */}

      {/* Headline block */}
      <motion.div
        className="relative z-20 px-5 md:px-10 pt-6 md:pt-36 max-w-[640px]"
      >
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.15 }}
          className="h-px bg-[var(--foreground)]/25 origin-left"
        />
        <motion.p
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.25 }}
          className="mt-3 text-[11px] md:text-[12px] uppercase tracking-[0.18em] text-[var(--foreground)]/80"
        >
          AI-Guided Therapy Matching
        </motion.p>

        <motion.h1
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
          }}
          className="mt-5 md:mt-6 text-[36px] sm:text-[44px] md:text-[60px] lg:text-[68px] leading-[0.98] tracking-[-0.025em] font-medium"
        >
          {["Calm Your", "Mind. Elevate", "Your Clarity."].map((line, i) => (
            <motion.span
              key={i}
              variants={{
                hidden: { y: 70, opacity: 0, clipPath: "inset(0 0 100% 0)" },
                show: {
                  y: 0,
                  opacity: 1,
                  clipPath: "inset(0 0 0% 0)",
                  transition: SPRING_SOFT,
                },
              }}
              className="block"
            >
              {line}
            </motion.span>
          ))}
        </motion.h1>

        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.85 }}
          className="mt-6 md:mt-7"
        >
          <StarRow />
        </motion.div>
      </motion.div>

      {/* Central image — flows in normal order on mobile, absolutely overlaps on desktop */}
      <motion.div
        initial={{ y: 140, opacity: 0, scale: 0.94 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.5, mass: 1.1 }}
        className="
          relative z-10 md:absolute md:inset-x-0 md:top-[40px]
          mt-6 md:mt-0
          flex justify-center md:items-start
          pointer-events-none
        "
      >
        <div className="relative w-[88vw] max-w-[420px] sm:max-w-[480px] md:w-[760px] md:max-w-[760px] lg:w-[860px] lg:max-w-[860px] xl:w-[960px] xl:max-w-[960px]">
          <Image
            src="/heroimage.png"
            alt="A person wearing the Talk Therapy guided-listening device"
            width={1033}
            height={1024}
            priority
            quality={95}
            sizes="(max-width: 640px) 88vw, (max-width: 1024px) 760px, 960px"
            className="w-full h-auto select-none"
            draggable={false}
          />
        </div>
      </motion.div>

      {/* Stat cards — stacked below image on mobile, absolute right column on desktop */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.65 } },
        }}
        className="
          relative z-20
          px-5 md:px-0
          mt-8 md:mt-0
          md:absolute md:right-10 md:top-[220px] md:w-[360px]
        "
      >
        <motion.div
          variants={{
            hidden: { x: 120, opacity: 0, rotate: 2 },
            show: { x: 0, opacity: 1, rotate: 0, transition: SPRING_SOFT },
          }}
          whileHover={{ y: -4, scale: 1.02 }}
          transition={SPRING_SNAP}
          className="mb-3"
        >
          <StatCard
            label="Stress Reduction"
            value="96"
            suffix="%"
            caption="Feel More Relaxed"
            icon={<BrainIcon />}
          />
        </motion.div>
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            variants={{
              hidden: { x: 120, y: 20, opacity: 0, rotate: -1.5 },
              show: { x: 0, y: 0, opacity: 1, rotate: 0, transition: SPRING_SOFT },
            }}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={SPRING_SNAP}
          >
            <StatCard label="Mental Clarity" value="92" caption="Improvement" />
          </motion.div>
          <motion.div
            variants={{
              hidden: { x: 140, y: 30, opacity: 0, rotate: 2 },
              show: { x: 0, y: 0, opacity: 1, rotate: 0, transition: SPRING_SOFT },
            }}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={SPRING_SNAP}
          >
            <StatCard label="Sleep Quality" value="84" caption="Better Rest" />
          </motion.div>
        </div>
      </motion.div>

      {/* CTA — flows after stats on mobile, absolutely centered on desktop */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 1.05 }}
        className="
          relative z-20
          mt-10 md:mt-0
          flex justify-center
          md:absolute md:left-1/2 md:-translate-x-1/2 md:bottom-[200px]
        "
      >
        <CTAButton />
      </motion.div>

      {/* Giant italic stamp — sits behind everything as a watermark on both
          mobile and desktop. On mobile it sits behind the image (top-[42%]);
          on desktop it pins to the bottom and the image overlaps it from
          above, same as the reference design. */}
      <motion.div
        style={{ y: stampY, scale: stampScale }}
        className="absolute inset-x-0 top-[42%] md:top-auto md:bottom-0 z-0 select-none overflow-hidden pointer-events-none"
      >
        <motion.div
          initial={{ x: "-12%", opacity: 0 }}
          animate={{ x: "0%", opacity: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.2, mass: 1.4 }}
          className="stamp text-[var(--foreground)] text-[26vw] md:text-[22vw] whitespace-nowrap text-center px-2"
        >
          TALK THERAPY
        </motion.div>
      </motion.div>
    </section>
  );
}
