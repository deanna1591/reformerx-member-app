import Link from "next/link";
import { requestLoginCode, verifyLoginCode } from "@/app/actions";
import { ensureDB } from "@/lib/store";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter the email you use for booking.",
  code: "That code doesn't match. Check the digits and try again.",
  expired: "That code expired — request a fresh one.",
  rate: "Too many codes requested. Try again in an hour.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: { step?: string; email?: string; referral?: string; error?: string };
}) {
  await ensureDB();
  const step = searchParams.step === "code" ? "code" : "email";
  const email = searchParams.email ?? "";
  const referral = searchParams.referral ?? "";
  const error = searchParams.error ? ERRORS[searchParams.error] : null;
  const devMode = !emailConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-ink.png" alt="ReformerX" className="h-9 w-auto self-start" />

      {step === "email" ? (
        <>
          <h1 className="mt-2 font-display text-[40px] leading-[1.05]">
            Your studio,<br />in your pocket.
          </h1>
          <p className="mt-3 text-[15px] text-smoke">
            Sign in with the email you use to book at ReformerX — no new password to remember.
          </p>
          <form action={requestLoginCode} className="mt-8 space-y-3">
            <div>
              <label htmlFor="email">Email you use for booking</label>
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
                Friend&apos;s member code <span className="font-normal text-smoke">(optional, first sign-in only)</span>
              </label>
              <input id="referral" name="referral" type="text" placeholder="RXM-XXXX-0000" className="mt-1.5" />
            </div>
            {error && <p className="text-[13px] text-spring-red">{error}</p>}
            <button className="w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-white shadow-lift active:scale-[0.98]">
              Email me a sign-in code
            </button>
          </form>
          <p className="mt-6 text-[13px] leading-relaxed text-smoke">
            Your account is created automatically from your ReformerX booking profile — membership,
            class history and your personal QR code are already waiting.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[36px] leading-[1.05]">Check your email</h1>
          <p className="mt-3 text-[15px] text-smoke">
            If <span className="font-medium text-ink">{email}</span> is on file at ReformerX, a 6-digit code is on its
            way. It expires in 10 minutes.
          </p>
          <form action={verifyLoginCode} className="mt-8 space-y-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="referral" value={referral} />
            <div>
              <label htmlFor="code">Sign-in code</label>
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
              Sign in
            </button>
          </form>

          <form action={requestLoginCode} className="mt-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="referral" value={referral} />
            <button className="w-full rounded-xl border border-line bg-white py-3 text-[14px] font-semibold">
              Send a new code
            </button>
          </form>

          <Link href="/login" className="mt-5 text-center text-[13px] text-smoke">
            Use a different email
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
