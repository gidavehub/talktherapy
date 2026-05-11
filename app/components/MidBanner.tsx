"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import MidBannerVisual from "./MidBannerVisual";
import { SPRING_SOFT } from "./motion/primitives";

const marqueeItems = [
  "BOOK NOW",
  "FREE CONSULTATION",
  "TALK NOW",
  "MATCH WITH A THERAPIST",
  "PRIVATE & SECURE",
];

function Dot() {
  return <span className="inline-block h-3 w-3 rounded-full bg-[var(--accent)]" aria-hidden />;
}

export default function MidBanner() {
  const items = [...marqueeItems, ...marqueeItems];
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Scene rises into frame as you scroll toward it, drifts past as you scroll away.
  const sceneY = useTransform(scrollYProgress, [0, 0.5, 1], [80, 0, -80]);
  const titleY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section ref={sectionRef} className="bg-[var(--dark)] px-4 sm:px-6 md:px-10 pt-8 md:pt-14 pb-12 md:pb-16">
      <motion.div
        initial={{ y: 120, scale: 0.96, opacity: 0 }}
        whileInView={{ y: 0, scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ ...SPRING_SOFT, mass: 1.2 }}
        className="relative overflow-hidden rounded-[28px] md:rounded-[36px]"
      >
        <motion.div style={{ y: sceneY }}>
          <MidBannerVisual className="w-full h-[280px] sm:h-[360px] md:h-[520px] block" />
        </motion.div>

        {/* Top label */}
        <motion.div
          style={{ y: titleY }}
          className="absolute top-7 md:top-10 left-0 right-0 text-center"
        >
          <motion.p
            initial={{ y: 24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ ...SPRING_SOFT, delay: 0.2 }}
            className="text-white text-[14px] md:text-[16px] tracking-wide"
          >
            Calm Your Mind In Minutes
          </motion.p>
        </motion.div>

        {/* Marquee pill — slides in from off-screen */}
        <motion.div
          initial={{ x: "-30%", opacity: 0 }}
          whileInView={{ x: "-50%", opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ ...SPRING_SOFT, delay: 0.35, mass: 1.4 }}
          className="absolute left-1/2 top-[42%] md:top-[40%] -translate-y-1/2 w-[92%] max-w-[820px]"
          style={{ x: "-50%" }}
        >
          <div className="rounded-full bg-black/55 backdrop-blur-md overflow-hidden">
            <div className="flex items-center marquee-track py-3 md:py-5">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-4 sm:gap-6 md:gap-10 px-4 sm:px-6 md:px-10 shrink-0">
                  <span className="text-white text-[20px] sm:text-[28px] md:text-[44px] leading-none font-medium tracking-tight whitespace-nowrap">
                    {item}
                  </span>
                  <Dot />
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Subtitle */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ ...SPRING_SOFT, delay: 0.55 }}
          className="absolute bottom-7 md:bottom-12 left-0 right-0 text-center px-6"
        >
          <p className="text-white/85 text-[12px] md:text-[14px] leading-relaxed max-w-[520px] mx-auto">
            Engineered to reduce mental stress and enhance clarity,
            <br className="hidden md:block" />
            helping you stay balanced, focused, and in control.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
