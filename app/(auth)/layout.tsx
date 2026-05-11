import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] relative overflow-hidden">
      <header className="absolute top-0 left-0 right-0 z-10 px-4 sm:px-6 md:px-10 pt-5 md:pt-8 flex items-start justify-between">
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        <Link
          href="/"
          className="h-11 px-5 rounded-full border border-[var(--border)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-black/5 transition-colors"
        >
          Back
        </Link>
      </header>

      <main className="relative z-[1] flex items-center justify-center min-h-screen px-4 sm:px-6 py-24 sm:py-28">
        {children}
      </main>

      <div className="stamp absolute left-0 right-0 -bottom-6 text-center text-[var(--foreground)]/10 text-[28vw] leading-[0.85] select-none pointer-events-none whitespace-nowrap">
        TALK THERAPY
      </div>
    </div>
  );
}
