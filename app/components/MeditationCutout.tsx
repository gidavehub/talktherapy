"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "motion/react";
import { SPRING_SOFT } from "./motion/primitives";

/**
 * "Deep valley" cutout: the image fills a wide rectangle, but the top edge
 * dips inward in a smooth U-shape that hugs the section title. We use an
 * SVG <clipPath> so the curve scales perfectly and stays sharp.
 *
 * Two animations make this feel alive:
 *   1. On enter: the clipPath path animates from a flat rounded rectangle
 *      into the full valley — the valley literally carves itself out.
 *   2. On scroll: the image inside the cutout drifts upward with parallax.
 */

// Flat starting path — same shape as the final but with the valley dip
// collapsed up to the top edge. The path morphs into FULL_PATH on enter.
const FLAT_PATH = `
  M 40,40
  L 500,40
  Q 560,40 560,40
  L 560,40
  Q 560,40 620,40
  L 780,40
  Q 840,40 840,40
  L 840,40
  Q 840,40 900,40
  L 1360,40
  Q 1400,40 1400,80
  L 1400,760
  Q 1400,800 1360,800
  L 40,800
  Q 0,800 0,760
  L 0,80
  Q 0,40 40,40
  Z
`;

const FULL_PATH = `
  M 40,40
  L 500,40
  Q 560,40 560,100
  L 560,340
  Q 560,400 620,400
  L 780,400
  Q 840,400 840,340
  L 840,100
  Q 840,40 900,40
  L 1360,40
  Q 1400,40 1400,80
  L 1400,760
  Q 1400,800 1360,800
  L 40,800
  Q 0,800 0,760
  L 0,80
  Q 0,40 40,40
  Z
`;

export default function MeditationCutout() {
  const sectionRef = useRef<HTMLElement>(null);
  const cutoutRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cutoutRef, { once: true, amount: 0.3 });

  // Parallax: image drifts up as you scroll past the section
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [60, -100]);

  return (
    <section
      ref={sectionRef}
      className="relative bg-[var(--background)] px-4 sm:px-6 md:px-10 py-16 md:py-24 overflow-hidden"
    >
      {/* Title sits ABOVE the image, visually nesting into the valley dip below */}
      <div className="relative z-10 max-w-[1200px] mx-auto text-center">
        <motion.p
          initial={{ y: 24, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ ...SPRING_SOFT, delay: 0.05 }}
          className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
        >
          For your mind
        </motion.p>
        <motion.h2
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
          }}
          className="mt-3 text-[36px] sm:text-[48px] md:text-[64px] leading-[1.02] tracking-[-0.025em] font-medium max-w-[860px] mx-auto"
        >
          {["Quiet the noise.", "Make room for clarity."].map((line, i) => (
            <motion.span
              key={i}
              variants={{
                hidden: { y: 60, opacity: 0, clipPath: "inset(0 0 100% 0)" },
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
        </motion.h2>
        <motion.p
          initial={{ y: 24, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ ...SPRING_SOFT, delay: 0.45 }}
          className="mt-5 text-[14px] md:text-[16px] text-[var(--muted)] max-w-[560px] mx-auto leading-relaxed"
        >
          A few minutes between sessions to land back in your body. Guided
          breath, gentle prompts, no chimes that yell at you.
        </motion.p>
      </div>

      {/* Image with the valley clip-path */}
      <motion.div
        ref={cutoutRef}
        initial={{ y: 100, opacity: 0, scale: 0.94 }}
        whileInView={{ y: 0, opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ ...SPRING_SOFT, mass: 1.3, delay: 0.1 }}
        className="relative z-0 mt-10 md:mt-14 max-w-[1400px] mx-auto"
      >
        <svg
          viewBox="0 0 1400 800"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-auto block"
          role="img"
          aria-label="A person meditating in a valley at sunrise"
        >
          <defs>
            <clipPath id="valley-clip" clipPathUnits="userSpaceOnUse">
              {/*
                The valley path morphs from a flat rounded rect into the full
                U-shape. Motion animates the `d` attribute over ~1.4s with a
                soft spring, giving the impression of the valley carving in.
              */}
              <motion.path
                initial={{ d: FLAT_PATH }}
                animate={inView ? { d: FULL_PATH } : { d: FLAT_PATH }}
                transition={{
                  type: "spring",
                  stiffness: 70,
                  damping: 20,
                  mass: 1.4,
                  delay: 0.25,
                }}
              />
            </clipPath>
            <linearGradient id="meditation-tint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
            </linearGradient>
          </defs>

          {/* Parallax-translated group holding the image */}
          <motion.g style={{ y: imageY }}>
            <image
              href="/meditating.png"
              x="0"
              y="-60"
              width="1400"
              height="900"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#valley-clip)"
            />
            <rect
              x="0"
              y="0"
              width="1400"
              height="800"
              fill="url(#meditation-tint)"
              clipPath="url(#valley-clip)"
            />
          </motion.g>
        </svg>

        {/* Stamp-style overlay text — sits inside the valley, talks about peace.
            Note: avoid combining style.y (scroll MotionValue) with animate.y on
            the SAME node — motion overrides one with the other and the entrance
            silently breaks. */}
        <div className="absolute inset-x-0 bottom-[8%] md:bottom-[10%] px-6 md:px-12 text-center pointer-events-none">
          <motion.p
            initial={{ y: 60, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ ...SPRING_SOFT, delay: 0.55, mass: 1.1 }}
            className="stamp text-white leading-[0.88] tracking-[-0.03em] text-[40px] sm:text-[58px] md:text-[80px] lg:text-[96px] drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          >
            Find your peace.
          </motion.p>
          <motion.p
            initial={{ y: 24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ ...SPRING_SOFT, delay: 0.85 }}
            className="mt-4 md:mt-6 text-white/85 text-[13px] md:text-[15px] leading-relaxed max-w-[560px] mx-auto"
          >
            Between sessions, take a moment to land back in your body. Guided
            breath for the racing nights, gentle prompts for the heavy mornings,
            quiet practices for the days you just need somewhere soft to be.
          </motion.p>
        </div>
      </motion.div>
    </section>
  );
}
