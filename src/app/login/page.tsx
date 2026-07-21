import { memberLogin } from "@/app/actions";
import { getDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  const demo = getDB().members.slice(0, 2);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <p className="font-display text-[15px] tracking-[0.3em] text-smoke">REFORMER X</p>
      <h1 className="mt-2 font-display text-[40px] leading-[1.05]">
        Your studio,<br />in your pocket.
      </h1>
      <p className="mt-3 text-[15px] text-smoke">
        Check in with a scan, push challenges forward, earn rewards.
      </p>
      <form action={memberLogin} className="mt-8 space-y-3">
        <div>
          <label htmlFor="email">Email you use for booking</label>
          <input id="email" name="email" type="email" required placeholder="you@example.com" className="mt-1.5" />
        </div>
        {searchParams.error && (
          <p className="text-[13px] text-spring-red">
            We couldn&apos;t find that email. It must match your SimplyBook membership account.
          </p>
        )}
        <button className="w-full rounded-xl bg-plum py-3.5 text-[15px] font-semibold text-white shadow-lift active:scale-[0.98]">
          Continue
        </button>
      </form>
      <div className="mt-8 rounded-xl2 bg-white/70 p-4 text-[13px] text-smoke shadow-card">
        <p className="font-semibold text-ink">Demo accounts</p>
        {demo.map((m) => (
          <p key={m.id} className="mt-1 font-mono">{m.email}</p>
        ))}
        <p className="mt-1 font-mono">eliska@example.com <span className="font-sans">(expired membership)</span></p>
      </div>
    </main>
  );
}
