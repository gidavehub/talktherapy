import Link from "next/link";
import Logo from "@/components/Logo";
import { ArchPortrait } from "@/components/ui/Arch";

/**
 * Sign in and sign up, standing alone: the TALK mark, the card in the middle,
 * and — on a wide screen — somebody in an arch either side, as on the home
 * page's "What's on your mind?".
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--cream)]">
      <header className="absolute left-0 right-0 top-0 z-10">
        <div className="mx-auto flex h-[84px] max-w-[1200px] items-center justify-between px-5 md:h-[92px] md:px-10">
          <Link href="/" aria-label="TALK — home">
            <Logo height={38} priority />
          </Link>
          <Link
            href="/"
            className="flex h-11 items-center rounded-full border-[1.5px] border-[var(--dark)] px-6 text-[14px] font-medium transition-colors hover:bg-[var(--dark)] hover:text-[var(--cream)]"
          >
            Back
          </Link>
        </div>
        <div className="zigzag bg-[var(--cream)]" aria-hidden />
      </header>

      <div className="pointer-events-none absolute bottom-0 left-[3%] hidden h-[340px] w-[200px] xl:block">
        <ArchPortrait src="/people/mind-man.webp" alt="" tone="var(--sage-soft)" className="h-full w-full" sizes="200px" scale={1.35} />
      </div>
      <div className="pointer-events-none absolute bottom-0 right-[3%] hidden h-[340px] w-[200px] xl:block">
        <ArchPortrait src="/people/mind-woman.webp" alt="" tone="var(--peach)" className="h-full w-full" sizes="200px" scale={1.35} />
      </div>

      <main className="relative z-[1] flex min-h-screen items-center justify-center px-4 py-28 sm:px-6">{children}</main>
    </div>
  );
}
