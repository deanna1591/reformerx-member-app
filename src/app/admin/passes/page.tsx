import Link from "next/link";
import { ensureDB } from "@/lib/store";
import { passOverview, fmtDate, RENEWAL_WINDOW_DAYS } from "@/lib/engine";
import { sendRenewalRemindersNow } from "@/app/actions";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PassesPage({ searchParams }: { searchParams: { sent?: string } }) {
  await ensureDB();
  const t = getT();
  const { groups, totalActive, expiringSoon } = passOverview();
  const sent = searchParams.sent ? Number(searchParams.sent) : null;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px]">{t("adm.pass.title")}</h1>
          <p className="mt-1 max-w-xl text-[13px] text-smoke">
            {t("adm.pass.lead", { days: RENEWAL_WINDOW_DAYS })}
          </p>
        </div>
        <form action={sendRenewalRemindersNow}>
          <button className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">
            {t("adm.pass.sendReminders")}
          </button>
        </form>
      </div>

      {sent !== null && (
        <div className="mt-4 rounded-xl border border-spring-green/40 bg-spring-green/10 px-4 py-3 text-[13px]">
          {sent > 0 ? t("adm.pass.remindersSent", { n: sent }) : t("adm.pass.noneToRemind")}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl2 bg-white p-5 shadow-card">
          <p className="font-display text-[34px] leading-none tabular-nums">{totalActive}</p>
          <p className="mt-1.5 text-[12px] uppercase tracking-wider text-smoke">{t("adm.pass.activeTotal")}</p>
        </div>
        <div className={`rounded-xl2 p-5 shadow-card ${expiringSoon > 0 ? "bg-spring-yellow/15" : "bg-white"}`}>
          <p className="font-display text-[34px] leading-none tabular-nums">{expiringSoon}</p>
          <p className="mt-1.5 text-[12px] uppercase tracking-wider text-smoke">
            {t("adm.pass.expiringSoon", { days: RENEWAL_WINDOW_DAYS })}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {groups.map((g) => (
          <section key={g.name} className="overflow-hidden rounded-xl2 bg-white shadow-card">
            <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-4">
              <h2 className="font-display text-[20px]">{g.name}</h2>
              <p className="shrink-0 text-[13px] text-smoke">
                <span className="font-display text-[20px] text-ink tabular-nums">{g.count}</span> {t("adm.pass.people")}
              </p>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {g.members.map((m) => (
                <div key={m.id} className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/members/${m.id}`} className="block truncate text-[14px] font-medium hover:underline">
                      {m.name}
                    </Link>
                    <p className="truncate text-[12px] text-smoke">{m.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] tabular-nums">{fmtDate(m.expires)}</p>
                    <p
                      className={`text-[11.5px] ${
                        m.daysLeft <= RENEWAL_WINDOW_DAYS ? "font-semibold text-spring-red" : "text-smoke"
                      }`}
                    >
                      {m.daysLeft <= 0 ? t("adm.pass.lastDay") : t("adm.pass.daysLeft", { n: m.daysLeft })}
                    </p>
                  </div>
                  <div className="hidden w-[150px] shrink-0 text-right text-[12px] text-smoke sm:block">
                    {m.credits
                      ? t("adm.pass.used", { used: m.used, total: m.credits })
                      : t("adm.pass.classesTaken", { n: m.used })}
                    {m.reminded && (
                      <span className="ml-1.5 rounded-full bg-chalk px-2 py-0.5 text-[10px] font-semibold uppercase">
                        {t("adm.pass.reminded")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {groups.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-[14px] text-smoke shadow-card">
            {t("adm.pass.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
