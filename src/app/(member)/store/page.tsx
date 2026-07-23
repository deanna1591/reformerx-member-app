import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { fmtDate, membershipActive, passUsage } from "@/lib/engine";
import { simplybookPackagesUrl } from "@/lib/simplybook";
import { getT, getLocale, intlLocale, pluralDays } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);
  const pass = passUsage(member.id);
  const shopUrl = simplybookPackagesUrl();
  const t = getT();
  const locale = getLocale();

  const packages = (db.packages ?? []).filter((p) => p.price > 0);
  const daysLeft = active
    ? Math.max(0, Math.ceil((new Date(member.membershipExpires).getTime() - Date.now()) / 86400000))
    : 0;

  const price = (n: number, c: string) =>
    new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: c || "CZK", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">{t("store.title")}</h1>
        <p className="mt-0.5 text-[13px] text-white/60">{t("store.subtitle")}</p>

        <div className="mt-4 rounded-[22px] bg-white/10 p-4 backdrop-blur">
          <p className="text-[11px] uppercase tracking-wider text-white/55">{t("pass.yourMembership")}</p>
          <p className="mt-1 font-display text-[24px] leading-none">
            {active ? pass?.name ?? member.membershipType : t("pass.none")}
          </p>
          <p className="mt-1.5 text-[13px] text-white/70">
            {active
              ? `${t("pass.validUntil", { date: fmtDate(member.membershipExpires) })} · ${daysLeft} ${pluralDays(locale, daysLeft)}`
              : t("store.buyToBook")}
          </p>
          {active && pass && <p className="mt-1 text-[13px] font-medium text-sage">{pass.summary}</p>}

          {active && pass && pass.perService.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-white/15 pt-3">
              {pass.perService.map((s) => (
                <div key={s.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[13px] text-white/85">{s.name}</p>
                    <p className="shrink-0 text-[12px] tabular-nums text-white/60">
                      {s.used} / {s.limit}
                    </p>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-sage"
                      style={{ width: `${Math.min(100, Math.round((s.used / s.limit) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-3 px-5 pt-5">
        {packages.map((p) => (
          <a
            key={p.id}
            href={shopUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl2 bg-card p-5 shadow-card transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[19px] leading-tight">{p.name}</p>
                <p className="mt-1 text-[12px] text-smoke">
                  {p.validityDays ? t("store.validDays", { n: p.validityDays }) : t("store.studioPass")}
                  {p.classes ? ` · ${p.classes} ${t("common.classes")}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[19px] leading-tight tabular-nums">{price(p.price, p.currency)}</p>
                <p className="mt-1 text-[12px] font-semibold text-tan-deep">{t("store.buy")} ↗</p>
              </div>
            </div>
          </a>
        ))}

        {packages.length === 0 && (
          <div className="rounded-xl2 bg-card p-6 text-center shadow-card">
            <p className="font-display text-[20px]">{t("store.emptyTitle")}</p>
            <p className="mt-1 text-[13px] text-smoke">
              {t("store.emptyBody")}
            </p>
          </div>
        )}

        <a
          href={shopUrl}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl2 bg-ink p-5 text-center text-white shadow-card"
        >
          <p className="font-display text-[18px] uppercase tracking-wide">{t("store.openShop")}</p>
          <p className="mt-1 text-[12px] text-white/60">{t("store.secure")}</p>
        </a>

        <p className="px-1 pt-1 text-center text-[11px] leading-relaxed text-smoke">
{t("store.note")}
        </p>
      </div>
    </div>
  );
}
