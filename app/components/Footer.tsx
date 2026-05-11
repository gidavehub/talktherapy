"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";

const navLinks = [
  { href: "/therapists", label: "Therapists" },
  { href: "/technology", label: "Technology" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/plans", label: "Plans" },
  { href: "/support", label: "Support" },
];

const socialLinks = [
  { href: "https://instagram.com", label: "Instagram" },
  { href: "https://x.com", label: "X" },
  { href: "https://linkedin.com", label: "Linkedin" },
  { href: "https://youtube.com", label: "Youtube" },
];

export default function Footer() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const stampX = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  return (
    <motion.footer ref={ref} className="bg-[var(--dark)] text-white">
      {/* Top content row */}
      <div className="px-4 sm:px-6 md:px-10 pt-6 md:pt-2 pb-10 md:pb-14 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
        <motion.h2
          initial={{ x: -60, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={SPRING_SOFT}
          className="text-[28px] md:text-[40px] leading-[1.05] tracking-tight font-medium"
        >
          Next-Generation
          <br />
          Cognitive Wellness
        </motion.h2>

        <motion.nav
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
          }}
          className="flex flex-col gap-3 text-[18px] md:text-[20px]"
        >
          {navLinks.map((link) => (
            <motion.div
              key={link.href}
              variants={{
                hidden: { x: -30, opacity: 0 },
                show: { x: 0, opacity: 1, transition: SPRING_SOFT },
              }}
            >
              <Link
                href={link.href}
                className="hover:text-[var(--accent-soft)] transition-colors w-fit inline-block"
              >
                <motion.span
                  whileHover={{ x: 6 }}
                  transition={SPRING_SNAP}
                  className="inline-block"
                >
                  {link.label}
                </motion.span>
              </Link>
            </motion.div>
          ))}
        </motion.nav>

        <motion.div
          initial={{ x: 60, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ ...SPRING_SOFT, delay: 0.1 }}
        >
          <p className="text-[14px] text-white/75 leading-relaxed max-w-[260px]">
            Subscribe for the latest
            <br />
            Talk Therapy updates
          </p>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAP}>
            <Link
              href="/community"
              className="mt-5 inline-flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors text-white pl-6 pr-2 text-[12px] uppercase tracking-[0.14em] font-medium"
            >
              Join Community
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
        </motion.div>
      </div>

      <div className="px-4 sm:px-6 md:px-10">
        <motion.div
          initial={{ scaleX: 0, transformOrigin: "left" }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ ...SPRING_SOFT, mass: 1.2 }}
          className="border-t border-dashed border-white/25 origin-left"
        />
      </div>

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ ...SPRING_SOFT, delay: 0.1 }}
        className="px-4 sm:px-6 md:px-10 py-5 md:py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[10px] md:text-[11px] tracking-[0.16em] uppercase"
      >
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-white/75">
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms &amp; Condition
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-3 sm:gap-x-6 gap-y-2 text-white/75">
          {socialLinks.map((s, i) => (
            <span key={s.href} className="flex items-center gap-3 sm:gap-6">
              {i > 0 ? <span className="text-white/35">•</span> : null}
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors underline-offset-4 underline decoration-white/40"
              >
                {s.label}
              </a>
            </span>
          ))}
        </div>
      </motion.div>

      <div className="relative overflow-hidden pb-6">
        <motion.div
          style={{ x: stampX }}
          className="stamp text-white text-[26vw] md:text-[22vw] leading-[0.85] whitespace-nowrap text-center select-none"
        >
          TALK THERAPY
        </motion.div>
      </div>
    </motion.footer>
  );
}
