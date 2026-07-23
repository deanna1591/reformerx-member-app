import { adminLogin } from "@/app/actions";
import { getT } from "@/lib/i18n";

export default function AdminLogin({ searchParams }: { searchParams: { error?: string } }) {
  const t = getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-ink.png" alt="ReformerX" className="h-8 w-auto self-start" />
      <h1 className="mt-3 font-display text-[34px]">{t("adm.dashboard")}</h1>
      <form action={adminLogin} className="mt-6 space-y-3">
        <div>
          <label htmlFor="password">Admin password</label>
          <input id="password" name="password" type="password" required className="mt-1.5" />
        </div>
        {searchParams.error && <p className="text-[13px] text-spring-red">Wrong password.</p>}
        <button className="w-full rounded-xl bg-ink py-3 text-[15px] font-semibold text-white">Sign in</button>
        <p className="text-[12px] text-smoke">
          Owner access — full dashboard including settings, challenges and staff.
        </p>
      </form>
      <div className="mt-7 grid grid-cols-2 gap-2 border-t border-line pt-5">
        <a href="/staff/login" className="rounded-xl border border-line bg-white px-3 py-3 text-center text-[13px] font-semibold">
          {t("login.instructor")}
        </a>
        <a href="/login" className="rounded-xl border border-line bg-white px-3 py-3 text-center text-[13px] font-semibold">
          {t("login.member")}
        </a>
      </div>
    </main>
  );
}
