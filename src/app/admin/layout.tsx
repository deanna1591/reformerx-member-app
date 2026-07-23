import Link from "next/link";
import { adminLogout, staffLogout, setAdminLanguage } from "@/app/actions";
import { ensureDB } from "@/lib/store";
import { currentStaff, isOwner } from "@/lib/staff";
import { getT, getLocale, LOCALES, LOCALE_NAMES } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureDB();
  const staff = currentStaff();
  const owner = isOwner();
  const t = getT();
  const locale = getLocale();

  const items: Array<[string, string]> = [
    ["/admin", t("adm.nav.overview")],
    ["/admin/members", t("adm.nav.members")],
    ["/admin/redemptions", t("adm.nav.redemptions")],
    ["/admin/studio-qr", t("adm.nav.studioQr")],
  ];
  if (owner) {
    items.splice(1, 0, ["/admin/challenges", t("adm.nav.challenges")]);
    items.push(
      ["/admin/passes", t("adm.nav.passes")],
      ["/admin/promotions", t("adm.nav.whatsOn")],
      ["/admin/instructors", t("adm.nav.instructors")],
      ["/admin/health", t("adm.h.title")],
      ["/admin/settings", t("adm.nav.settings")]
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink p-5 text-white lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="ReformerX" className="h-6 w-auto" />
        <p className="mt-0.5 text-[12px] text-white/50">{t("adm.dashboard")}</p>

        {staff && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5">
            {staff.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={staff.photoUrl} alt={staff.name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-sage font-display text-[15px] text-ink">
                {staff.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{staff.name}</p>
              <p className="text-[11px] text-white/50">{owner ? t("adm.owner") : t("adm.instructor")}</p>
            </div>
          </div>
        )}

        <nav className="mt-6 space-y-1 text-[14px]">
          {items.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-lg px-3 py-2 font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div>
            <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-white/40">{t("adm.language")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {LOCALES.map((l) => (
                <form key={l} action={setAdminLanguage}>
                  <input type="hidden" name="lang" value={l} />
                  <button
                    className={`w-full rounded-lg py-1.5 text-[12px] font-semibold transition ${
                      locale === l ? "bg-white text-ink" : "border border-white/20 text-white/60 hover:text-white"
                    }`}
                  >
                    {LOCALE_NAMES[l]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <form action={staff ? staffLogout : adminLogout}>
            <button className="w-full rounded-lg border border-white/20 py-2 text-[13px] font-medium text-white/70 hover:text-white">
              {t("common.signOut")}
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-line bg-white px-6 py-3 text-[13px] text-smoke lg:hidden">{t("adm.desktopHint")}</div>
        <main className="mx-auto max-w-5xl p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
