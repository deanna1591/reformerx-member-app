import { adminLogin } from "@/app/actions";

export default function AdminLogin({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="font-display text-[15px] tracking-[0.3em] text-smoke">REFORMER X</p>
      <h1 className="mt-2 font-display text-[34px]">Studio dashboard</h1>
      <form action={adminLogin} className="mt-6 space-y-3">
        <div>
          <label htmlFor="password">Admin password</label>
          <input id="password" name="password" type="password" required className="mt-1.5" />
        </div>
        {searchParams.error && <p className="text-[13px] text-spring-red">Wrong password.</p>}
        <button className="w-full rounded-xl bg-ink py-3 text-[15px] font-semibold text-white">Sign in</button>
        <p className="text-[12px] text-smoke">Demo password: <span className="font-mono">reformerx</span> (set ADMIN_PASSWORD in production)</p>
      </form>
    </main>
  );
}
