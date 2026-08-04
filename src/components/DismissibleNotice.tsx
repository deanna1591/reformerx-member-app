import Link from "next/link";

/**
 * A notice with a close button.
 *
 * Two kinds of dismissal, because they mean different things:
 *
 *  - `clearTo` — the notice comes from the URL (a send result, an error). The X
 *    is a link back to the clean path, so it clears on click and stays cleared
 *    on reload. No state, nothing stored.
 *
 *  - `action` — the notice reflects stored state. The X submits a form so the
 *    dismissal persists, otherwise it would reappear on the next visit.
 *
 * Kept as one component so every admin notice closes the same way.
 */
export default function DismissibleNotice({
  children,
  clearTo,
  action,
  hiddenFields,
  tone = "info",
  label = "Dismiss",
}: {
  children: React.ReactNode;
  clearTo?: string;
  action?: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
  tone?: "info" | "good" | "warn";
  label?: string;
}) {
  const toneClass =
    tone === "good"
      ? "bg-sage-soft"
      : tone === "warn"
        ? "border border-line bg-white"
        : "bg-card shadow-card";

  // 32px tap target, and pr-10 on the body so long text never runs under it.
  const closeClass =
    "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-[15px] leading-none text-smoke transition hover:bg-ink/5 active:scale-95";

  return (
    <div className={`relative mt-4 rounded-xl2 p-4 pr-10 ${toneClass}`}>
      {children}
      {clearTo ? (
        <Link href={clearTo} aria-label={label} title={label} className={closeClass}>
          ✕
        </Link>
      ) : action ? (
        <form action={action} className="contents">
          {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button aria-label={label} title={label} className={closeClass}>
            ✕
          </button>
        </form>
      ) : null}
    </div>
  );
}
