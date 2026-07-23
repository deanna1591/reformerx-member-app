import { ensureDB } from "@/lib/store";
import { runHealthCheck, type Check } from "@/lib/health";
import { simulateSimplybookSync, cleanDemoData } from "@/app/actions";
import SyncButton from "@/components/SyncButton";
import ConfirmButton from "@/components/ConfirmButton";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DOT: Record<Check["level"], string> = {
  ok: "bg-spring-green",
  warn: "bg-spring-yellow",
  error: "bg-spring-red",
  info: "bg-line",
};

function Row({ c }: { c: Check }) {
  return (
    <div className="flex gap-3 border-b border-line px-5 py-3.5 last:border-0">
      <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.level]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="text-[14px] font-medium">{c.label}</p>
          {c.value && <p className="text-[13px] tabular-nums text-smoke">{c.value}</p>}
        </div>
        {c.detail && <p className="mt-1 text-[12.5px] leading-relaxed text-smoke">{c.detail}</p>}
      </div>
    </div>
  );
}

function Section({ title, checks }: { title: string; checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-smoke">{title}</p>
      {checks.map((c) => (
        <Row key={c.label} c={c} />
      ))}
    </section>
  );
}

export default async function HealthPage() {
  await ensureDB();
  const t = getT();
  const r = await runHealthCheck();
  const healthy = r.problems === 0;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px]">{t("adm.h.title")}</h1>
        <form action={simulateSimplybookSync}>
          <SyncButton />
        </form>
      </div>

      <div
        className={`mt-4 rounded-xl2 p-5 shadow-card ${
          healthy ? "bg-spring-green/10" : r.problems > 2 ? "bg-spring-red/10" : "bg-spring-yellow/10"
        }`}
      >
        <p className="font-display text-[22px]">
          {healthy ? t("adm.h.allGood") : t("adm.h.needsAttention", { n: r.problems })}
        </p>
        <p className="mt-1 text-[13px] text-smoke">
          {healthy ? t("adm.h.allGoodBody") : t("adm.h.needsAttentionBody")}
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <Section title={t("adm.h.setup")} checks={r.setup} />
        <Section title={t("adm.h.connection")} checks={r.connection} />
        <Section title={t("adm.h.capacity")} checks={r.capacity} />
        <Section title={t("adm.h.data")} checks={r.data} />

        {r.demoMembers > 0 && (
          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex gap-3">
              <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full bg-spring-yellow" />
              <div className="flex-1">
                <p className="text-[14px] font-medium">{t("adm.h.demoTitle", { n: r.demoMembers })}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-smoke">{t("adm.h.demoBody")}</p>
                <form action={cleanDemoData} className="mt-3">
                  <ConfirmButton
                    message={t("adm.h.demoConfirm")}
                    className="rounded-xl bg-ink px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    {t("adm.h.demoRemove")}
                  </ConfirmButton>
                </form>
              </div>
            </div>
          </section>
        )}
      </div>

      <p className="mt-5 text-center text-[12px] text-smoke">
        {t("adm.h.checkedAt", { time: new Date(r.checkedAt).toLocaleString("en-GB") })}
      </p>
    </div>
  );
}
