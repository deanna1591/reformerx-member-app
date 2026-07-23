import Link from "next/link";
import { requestLoginCode, verifyLoginCode } from "@/app/actions";
import { ensureDB } from "@/lib/store";
import { emailConfigured } from "@/lib/email";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: { step?: string; email?: string; referral?: string; error?: string };
}) {
  await ensureDB();
  const step = searchParams.step === "code" ? "code" : "email";
  const email = searchParams.email ?? "";
  const referral = searchParams.referral ?? "";
  const devMode = !emailConfigured();
  const t = getT();
  const ERRORS: Record<string, string> = {
    email: t("login.err.email"),
    code: t("login.err.code"),
    expired: t("login.err.expired"),
    rate: t("login.err.rate"),
  };
  const error = searchParams.error ? ERRORS[searchParams.error] : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-ink.png" alt="ReformerX" className="h-9 w-auto self-start" />

      {step === "email" ? (
        <>
          <h1 className="mt-2 whitespace-pre-line font-display text-[40px] leading-[1.05]">
            {t("login.title")}
          </h1>
<p className="mt-3 text-[15px] text-smoke">{t("login.lead")}</p>
          <form action={requestLoginCode} className="mt-8 space-y-3">
            <div>
              <label htmlFor="email">{t("login.emailLabel")}</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={email}
                placeholder="you@example.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="referral">
                {t("login.referralLabel")} <span className="font-normal text-smoke">({t("login.referralHint")})</span>
              </label>
              <input id="referral" name="referral" type="text" placeholder="RXM-XXXX-0000" className="mt-1.5" />
            </div>
            {error && <p className="text-[13px] text-spring-red">{error}</p>}
            <button className="w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-white shadow-lift active:scale-[0.98]">
              {t("login.sendCode")}
            </button>
          </form>
<p className="mt-6 text-[13px] leading-relaxed text-smoke">{t("login.footnote")}</p>

          <div className="mt-8 border-t border-line pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-smoke">{t("login.staffHeading")}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Link
                href="/staff/login"
                className="rounded-xl border border-line bg-white px-3 py-3 text-center text-[13px] font-semibold"
              >
                {t("login.instructor")}
              </Link>
              <Link
                href="/admin/login"
                className="rounded-xl border border-line bg-white px-3 py-3 text-center text-[13px] font-semibold"
              >
                {t("login.owner")}
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[36px] leading-[1.05]">{t("login.checkEmail")}</h1>
          <p className="mt-3 text-[15px] text-smoke">
{t("login.codeSent", { email })}
          </p>
          <form action={verifyLoginCode} className="mt-8 space-y-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="referral" value={referral} />
            <div>
              <label htmlFor="code">{t("login.codeLabel")}</label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                placeholder="000000"
                className="mt-1.5 text-center font-display text-[28px] tracking-[0.3em]"
              />
            </div>
            {error && <p className="text-[13px] text-spring-red">{error}</p>}
            <button className="w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-white shadow-lift active:scale-[0.98]">
              {t("login.signIn")}
            </button>
          </form>

          <form action={requestLoginCode} className="mt-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="referral" value={referral} />
            <button className="w-full rounded-xl border border-line bg-white py-3 text-[14px] font-semibold">
              {t("login.newCode")}
            </button>
          </form>

          <Link href="/login" className="mt-5 text-center text-[13px] text-smoke">
            {t("login.otherEmail")}
          </Link>

          {devMode && (
            <p className="mt-6 rounded-xl2 bg-white/70 p-4 text-[12px] text-smoke shadow-card">
              <span className="font-semibold text-ink">Development mode:</span> no email provider is configured, so the
              code is printed in the server terminal instead of being sent.
            </p>
          )}
        </>
      )}
    </main>
  );
}
