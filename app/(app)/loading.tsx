import { Skeleton } from "@/components/ui/Feedback";

/**
 * Shown while a signed-in screen's server part resolves.
 *
 * The shape every screen in the app opens with — an eyebrow, a heading, a
 * line of explanation, then rows — so moving between them never flashes a
 * blank page or a lone spinner. Each screen draws its own detailed skeleton
 * once its client part is running; this only covers the moment before that.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-[420px]" />
        <Skeleton className="h-3.5 w-full max-w-[520px]" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5">
            <Skeleton rounded="rounded-full" className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
