/**
 * Segment-level loading shell for the public site.
 *
 * Covers the server render and the route's JS chunk only — it will not cover
 * data a client component fetches in an effect. Those screens own their own
 * skeletons (see `CounsellorDirectory`), which is why this stays a light
 * placeholder rather than trying to mimic any particular page.
 */
export default function MarketingLoading() {
  return (
    <div className="min-h-[70vh] px-4 sm:px-6 md:px-10 pt-[120px] md:pt-[180px]">
      <div className="max-w-[1400px] mx-auto animate-pulse">
        <div className="h-px bg-[var(--foreground)]/10" />
        <div className="mt-6 h-3 w-32 rounded-full bg-[var(--foreground)]/10" />
        <div className="mt-8 h-12 md:h-16 w-[80%] max-w-[700px] rounded-2xl bg-[var(--foreground)]/10" />
        <div className="mt-4 h-12 md:h-16 w-[55%] max-w-[500px] rounded-2xl bg-[var(--foreground)]/10" />
        <div className="mt-10 h-4 w-[70%] max-w-[560px] rounded-full bg-[var(--foreground)]/[0.07]" />
        <div className="mt-3 h-4 w-[50%] max-w-[420px] rounded-full bg-[var(--foreground)]/[0.07]" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
