/**
 * Shown instantly on any member-page navigation while the server renders.
 * Every member page is `force-dynamic` and awaits ensureDB(), which can hit
 * Supabase — without a boundary here the old page just sits there and the tap
 * feels like it did nothing.
 */
export default function MemberLoading() {
  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-3 h-8 w-48" />
        </div>
        <div className="skeleton h-[52px] w-[46px] rounded-full" />
      </div>

      <div className="skeleton mt-5 h-[210px] rounded-[150px_150px_22px_22px]" />

      <div className="mt-5 space-y-3">
        <div className="skeleton h-[74px] rounded-xl2" />
        <div className="skeleton h-[74px] rounded-xl2" />
        <div className="skeleton h-[74px] rounded-xl2" />
      </div>
    </main>
  );
}
