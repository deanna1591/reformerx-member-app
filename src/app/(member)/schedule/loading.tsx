/**
 * Schedule-shaped skeleton. This also fires when only `?d=` changes, so tapping
 * a different day gives immediate feedback instead of a frozen list — the day
 * strip keeps its exact height so nothing jumps when the real rows arrive.
 */
export default function ScheduleLoading() {
  return (
    <div className="pb-28" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading classes</span>

      <header className="rounded-b-[26px] bg-ink px-5 pb-5 pt-[max(1.2rem,env(safe-area-inset-top))]">
        <div className="skeleton-dark h-7 w-40" />
        <div className="skeleton-dark mt-2 h-3 w-52" />

        <div className="mt-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-dark h-[62px] min-w-[52px] flex-1 rounded-2xl" />
          ))}
        </div>
      </header>

      <div className="px-5 pt-5">
        <div className="flex gap-2">
          <div className="skeleton h-8 w-24 rounded-full" />
          <div className="skeleton h-8 w-28 rounded-full" />
        </div>

        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl2 bg-card p-4 shadow-card">
              <div className="skeleton h-11 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-3/5" />
                <div className="skeleton mt-2 h-3 w-2/5" />
              </div>
              <div className="skeleton h-9 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
