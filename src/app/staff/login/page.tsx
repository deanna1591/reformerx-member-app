import { staffLogin } from "@/app/actions";
import { ensureDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StaffLogin({ searchParams }: { searchParams: { error?: string } }) {
  await ensureDB();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-ink.png" alt="ReformerX" className="h-8 w-auto self-start" />
      <h1 className="mt-3 font-display text-[32px] leading-tight">Studio sign-in</h1>
      <p className="mt-2 text-[14px] text-smoke">For coaches and front desk.</p>
      <form action={staffLogin} className="mt-6 space-y-3">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="mt-1.5" placeholder="coach@reformerx.cz" />
        </div>
        <div>
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            required
            autoComplete="current-password"
            className="mt-1.5 text-center font-display text-[24px] tracking-[0.3em]"
            placeholder="••••"
          />
        </div>
        {searchParams.error && <p className="text-[13px] text-spring-red">That email and PIN don&apos;t match.</p>}
        <button className="w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-white">Sign in</button>
      </form>
      <a href="/admin/login" className="mt-6 text-center text-[13px] text-smoke">
        Studio owner? Use the studio password →
      </a>
    </main>
  );
}
