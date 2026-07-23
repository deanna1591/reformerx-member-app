import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { ensureDB } from "@/lib/store";
import { fmtDate, membershipActive, passUsage } from "@/lib/engine";
import { memberLogout, setLanguage } from "@/app/actions";
import { getT, getLocale, LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import PushOptIn from "@/components/PushOptIn";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const active = membershipActive(member);
  const pass = passUsage(member.id);
  const t = getT();
  const locale = getLocale();

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-0">
      <span className="text-[13px] text-smoke">{label}</span>
      <span className="truncate text-right text-[14px] font-medium">{value}</span>
    </div>
  );

  const link = (href: string, label: string, hint?: string) => (
    <Link href={href} className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-0">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-smoke">{hint}</span>}
      </span>
      <span className="text-smoke">›</span>
    </Link>
  );

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">{t("settings.title")}</h1>
        <p className="mt-0.5 text-[13px] text-white/60">{member.name}</p>
      </header>

      <div className="space-y-4 px-5 pt-5">
        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">{t("settings.account")}</p>
          {row(t("settings.name"), member.name)}
          {row(t("settings.email"), member.email)}
          {row(t("settings.memberCode"), member.qrCode)}
          {row(t("settings.memberSince"), fmtDate(member.joinedAt))}
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">{t("pass.membership")}</p>
          {row(t("settings.pass"), active ? pass?.name ?? member.membershipType : t("pass.none"))}
          {row(t("settings.validUntil"), active ? fmtDate(member.membershipExpires) : "—")}
          {active && pass && row(t("settings.usage"), pass.summary)}
          {active &&
            pass?.perService.map((s) => row(s.name, `${s.used} / ${s.limit}`))}
          {link("/store", t("settings.buyRenew"), t("settings.opensShop"))}
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">{t("settings.language")}</p>
          <div className="px-5 pb-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              {LOCALES.map((l) => (
                <form key={l} action={setLanguage}>
                  <input type="hidden" name="lang" value={l} />
                  <button
                    className={`w-full rounded-xl px-3 py-3 text-[14px] font-semibold transition ${
                      locale === l ? "bg-ink text-white" : "border border-line bg-white text-ink"
                    }`}
                  >
                    {LOCALE_NAMES[l]}
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-smoke">{t("settings.languageHint")}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">{t("settings.notifications")}</p>
          <div className="px-5 py-4">
            <PushOptIn />
            <p className="mt-2 text-[12px] text-smoke">
              {t("settings.notificationsHint")}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">{t("settings.more")}</p>
          {link("/milestones", t("profile.milestones"), t("settings.milestonesHint"))}
          {link("/challenges", t("settings.challenges"), t("settings.challengesHint"))}
          {link("/rewards", t("settings.rewards"), t("settings.rewardsHint"))}
          <div className="px-5 py-4">
            <ShareButton
              label={t("profile.invite")}
              text={`Join me at ReformerX — use my member code ${member.qrCode} when you sign up.`}
            />
          </div>
        </section>

        <form action={memberLogout}>
          <button className="w-full rounded-xl2 bg-white py-4 text-[14px] font-semibold text-spring-red shadow-card">
            {t("common.signOut")}
          </button>
        </form>

        <p className="pb-2 pt-1 text-center text-[11px] text-smoke">ReformerX · Haštalská, Prague 1</p>
      </div>
    </div>
  );
}
