"use client";

import StartLink from "../StartLink";
import { ArchStack } from "../ui/Card";
import type { HomeContent } from "../../lib/content/schema";
import Reveal from "./Reveal";

/**
 * The closing band, in two moods: terracotta ("Whatever you're carrying…",
 * the home page) and sage ("Not sure who to choose?", the providers page).
 * Its words are the site content's (home.cta, providers.cta); where the
 * button leads is StartLink's to decide.
 */
export default function CtaBand({
  tone = "terracotta",
  content,
}: {
  tone?: "terracotta" | "sage";
  /** Two heading lines, a sentence, the button's words. */
  content: HomeContent["cta"];
}) {
  const { lines, text, button } = content;
  const terracotta = tone === "terracotta";
  return (
    <section
      className={`relative overflow-hidden ${terracotta ? "bg-[var(--accent)]" : "bg-[var(--sage)]"} text-[var(--cream)]`}
    >
      <ArchStack
        className="absolute bottom-0 right-[4%] hidden h-[88%] lg:block"
        colors={terracotta ? ["#D9906C", "#E9B193", "#F4EADD"] : ["#8FA582", "#B9C8AC", "#F4EADD"]}
      />
      <div className="relative mx-auto max-w-[1200px] px-5 py-16 md:px-10 md:py-20">
        <Reveal>
          <h2 className="font-display max-w-[640px] text-[34px] font-medium leading-[1.12] md:text-[46px]">
            {lines[0]}
            <span className="block italic text-[var(--cream)]/90">{lines[1]}</span>
          </h2>
          <p className="mt-5 max-w-[520px] text-[15.5px] text-[var(--cream)]/85">{text}</p>
          <StartLink
            className={`mt-8 inline-flex h-12 items-center rounded-full px-8 text-[14.5px] font-medium transition-colors ${
              terracotta
                ? "bg-[var(--cream)] text-[var(--foreground)] hover:bg-[var(--surface)]"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent-deep)]"
            }`}
          >
            {button}
          </StartLink>
        </Reveal>
      </div>
    </section>
  );
}
