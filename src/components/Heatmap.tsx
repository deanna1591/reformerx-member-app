import type { HeatmapData } from "@/lib/streaks";
import { getT, getLocale, intlLocale } from "@/lib/i18n";

const ROW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** 0 = rest day, 3 = a big day. Studio members rarely exceed two classes. */
function level(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * Ramp through real tokens, not opacity. `sage` (#c5c3ae) sits almost exactly
 * on top of `line` in luminance, so `bg-sage/45` over the card composites to
 * rgb(228,226,215) against `line`'s rgb(228,225,215) — one value apart, in one
 * channel. A one-class day was invisible, which is most days at a studio.
 */
const FILL: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-line",
  1: "bg-sage",
  2: "bg-sage-deep",
  3: "bg-ink",
};

export default function Heatmap({ data }: { data: HeatmapData }) {
  const t = getT();
  const intl = intlLocale(getLocale());

  const monthFmt = new Intl.DateTimeFormat(intl, { month: "short", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", timeZone: "UTC" });
  const asDate = (key: string) => new Date(`${key}T12:00:00Z`);

  // Cells are flex-1 across roughly 300px of card, so the glyph has to follow
  // the column count or it either overflows the square or vanishes inside it.
  const fireSize = Math.max(7, Math.min(22, Math.round((300 / data.weeks.length) * 0.62)));

  // Label a column only when its month differs from the column before it.
  let lastMonth = "";
  const months = data.weeks.map((w) => {
    const m = monthFmt.format(asDate(w.start));
    if (m === lastMonth) return "";
    lastMonth = m;
    return m;
  });

  return (
    <section className="rounded-xl2 bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] leading-tight">{t("miles.heatmap")}</h2>
        <p className="shrink-0 text-[11px] uppercase tracking-wider text-smoke">
          {t("miles.heatmapCaption", { n: data.weeks.length })}
        </p>
      </div>

      {data.total === 0 ? (
        <p className="mt-4 text-[13px] text-smoke">{t("miles.heatmapEmpty")}</p>
      ) : (
        <>
          <div className="mt-4 flex gap-[3px] pl-[18px]">
            {months.map((m, i) => (
              <div
                key={i}
                aria-hidden
                className="min-w-0 flex-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-smoke/70"
              >
                {m}
              </div>
            ))}
          </div>

          <div className="mt-1 flex gap-[3px]">
            <div className="flex w-[15px] shrink-0 flex-col gap-[3px]">
              {ROW_LABELS.map((d, i) => (
                <div
                  key={i}
                  aria-hidden
                  className="flex aspect-square items-center justify-center text-[9px] font-semibold text-smoke/60"
                >
                  {d}
                </div>
              ))}
            </div>

            {data.weeks.map((week) => (
              <div key={week.start} className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {week.days.map((day) => {
                  const lvl = level(day.count);
                  return (
                    <div
                      key={day.key}
                      title={
                        day.future
                          ? undefined
                          : `${dayFmt.format(asDate(day.key))} — ${
                              day.count === 0
                                ? t("miles.heatmapRest")
                                : day.count === 1
                                  ? t("miles.heatmapOne")
                                  : t("miles.heatmapMany", { n: day.count })
                            }`
                      }
                      className={`grid aspect-square place-items-center rounded-[3px] ${
                        day.future ? "bg-transparent" : FILL[lvl]
                      }`}
                    >
                      {!day.future && lvl === 3 ? (
                        <span aria-hidden className="leading-none" style={{ fontSize: fireSize }}>
                          🔥
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-smoke/70">
            <span>{t("miles.heatmapLess")}</span>
            {([0, 1, 2, 3] as const).map((l) => (
              <span
                key={l}
                aria-hidden
                className={`grid h-[13px] w-[13px] place-items-center rounded-[3px] ${FILL[l]}`}
              >
                {l === 3 ? <span className="text-[8px] leading-none">🔥</span> : null}
              </span>
            ))}
            <span>{t("miles.heatmapMore")}</span>
          </div>
        </>
      )}
    </section>
  );
}
